/**
 * Kauf Adapter für die Mitgliedschaft (RevenueCat, Apple In App Purchase). Die Paywall spricht nur mit
 * purchase(), restorePurchases() und useStorePrices().
 *
 * Ablauf (Koray 17.11., Einrichtung im Projekt Dokument „Bezahlmodell“):
 * * RevenueCat kennt jedes Konto unter seiner Supabase ID (App User ID), damit der Webhook den Kauf dem
 *   richtigen Konto zuordnet. Deshalb wird erst beim Kauf, Wiederherstellen oder Anzeigen der Preise
 *   konfiguriert, mit der ID des angemeldeten Kontos.
 * * Nach dem Kauf setzt die Edge Function revenuecat-webhook plan und plan_until in Supabase. Die App fragt
 *   danach my_entitlement ein paar Sekunden lang neu, bis der Plan dort ankommt. my_entitlement bleibt die
 *   eine Wahrheit, RevenueCat selbst wird für die Freischaltung nicht gefragt.
 * * Produkte: Offering default mit $rc_annual (Jahr), $rc_monthly (Monat), $rc_weekly (Woche) und
 *   $rc_six_month (Saison Pass, Abo ohne Verlängerung).
 * Der öffentliche SDK Schlüssel kommt aus der EAS Umgebung (EXPO_PUBLIC_REVENUECAT_IOS_KEY). Fehlt er, bleibt
 * es beim freundlichen Hinweis wie vorher.
 */
import { useEffect, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import * as ExpoModules from 'expo-modules-core';
import type * as NotificationsT from 'expo-notifications';
import Purchases, { INTRO_ELIGIBILITY_STATUS, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import { getEntitlement, refreshEntitlement, type PlanId } from './entitlement';
import { PLAN_REMINDER_ID, planReminder } from './plan-reminder';
import { pushStatus } from './push';
import { supabase } from './supabase';
import { t } from '@/i18n';

export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const NOT_YET = t('Käufe sind bald möglich. In der Testphase ist alles frei.');
const FAILED = t('Das hat nicht geklappt. Bitte später noch einmal versuchen.');

/** Paket je Plan im Offering default */
const PACKAGE_OF: Record<PlanId, string> = {
  jahr: '$rc_annual',
  monat: '$rc_monthly',
  woche: '$rc_weekly',
  saison: '$rc_six_month',
};

// Der Kaufbaustein ist nativ und erst ab Build 35 im iPhone. Ältere Builds bekommen dieses JavaScript per OTA ohne ihn:
// dann bleibt es beim Hinweis statt eines Fehlers.
const available = () => Platform.OS === 'ios' && API_KEY.length > 0 && !!NativeModules.RNPurchases;

let configuredFor: string | null = null;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** RevenueCat für das angemeldete Konto bereit machen; null, wenn niemand angemeldet ist */
async function ready(): Promise<string | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  if (configuredFor === null) {
    Purchases.configure({ apiKey: API_KEY, appUserID: uid });
    configuredFor = uid;
  } else if (configuredFor !== uid) {
    await Purchases.logIn(uid);
    configuredFor = uid;
  }
  return uid;
}

async function packages(): Promise<Partial<Record<PlanId, PurchasesPackage>>> {
  const offerings = await Purchases.getOfferings();
  const all = offerings.current?.availablePackages ?? [];
  const out: Partial<Record<PlanId, PurchasesPackage>> = {};
  for (const id of Object.keys(PACKAGE_OF) as PlanId[]) {
    const p = all.find((x) => x.identifier === PACKAGE_OF[id]);
    if (p) out[id] = p;
  }
  return out;
}

/** Nach einem Kauf: warten, bis der Webhook den Plan in Supabase gesetzt hat (höchstens etwa 12 s) */
async function waitForPlan(): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await refreshEntitlement();
    const e = getEntitlement();
    if (e.active && e.source === 'plan') return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

const isCancel = (e: unknown) => !!(e && typeof e === 'object' && (e as { userCancelled?: boolean | null }).userCancelled);

export async function purchase(planId: PlanId): Promise<PurchaseResult> {
  if (!available()) return { ok: false, message: NOT_YET };
  try {
    if (!(await ready())) return { ok: false, message: t('Bitte melde dich zuerst an.') };
    const pkg = (await packages())[planId];
    if (!pkg) return { ok: false, message: NOT_YET };
    await Purchases.purchasePackage(pkg);
    // Apple hat den Kauf bestätigt. Kommt der Plan nicht gleich an, gilt er trotzdem: der Webhook holt ihn nach.
    await waitForPlan();
    void refreshCurrentPlan();
    return { ok: true };
  } catch (e) {
    if (isCancel(e)) return { ok: false, cancelled: true, message: '' };
    return { ok: false, message: FAILED };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  // Auch ohne Store lohnt ein Neuladen: ein vom Betreiber zugewiesener Club oder Plan wird so sichtbar
  await refreshEntitlement();
  if (available()) {
    try {
      if (await ready()) {
        await Purchases.restorePurchases();
        // RevenueCat schickt bei wiederhergestellten Käufen ebenfalls Ereignisse an den Webhook
        await waitForPlan();
      }
    } catch {
      return { ok: false, message: FAILED };
    }
  }
  const e = getEntitlement();
  if (e.active && e.source !== 'test') return { ok: true };
  return { ok: false, message: available() ? t('Wir haben keinen aktiven Kauf gefunden.') : NOT_YET };
}

/**
 * Preise so, wie der App Store sie im Land des Nutzers zeigt (Währung, Steuer). Bis sie da sind oder ohne
 * Store gelten die festen Preise aus entitlement.ts.
 */
export function useStorePrices(): Partial<Record<PlanId, string>> {
  const [prices, setPrices] = useState<Partial<Record<PlanId, string>>>({});
  useEffect(() => {
    if (!available()) return;
    let alive = true;
    void (async () => {
      try {
        if (!(await ready())) return;
        const p = await packages();
        const out: Partial<Record<PlanId, string>> = {};
        for (const id of Object.keys(p) as PlanId[]) out[id] = p[id]?.product.priceString;
        if (alive) setPrices(out);
      } catch {
        // ohne Netz bleiben die festen Preise stehen
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return prices;
}

/**
 * Gratismonat (Koray 17.11.): Jahr, Monat und Woche haben im App Store ein Einführungsangebot „1 Monat kostenlos“
 * für neue Abonnenten. true je Plan, wenn das Angebot existiert und dieses Konto es noch bekommt. Ohne sichere
 * Auskunft (unbekannt) wird nichts versprochen; den genauen Stand zeigt ohnehin Apples Kaufblatt.
 */
export function useFreeTrials(): Partial<Record<PlanId, boolean>> {
  const [free, setFree] = useState<Partial<Record<PlanId, boolean>>>({});
  useEffect(() => {
    if (!available()) return;
    let alive = true;
    void (async () => {
      try {
        if (!(await ready())) return;
        const p = await packages();
        const withIntro = (Object.keys(p) as PlanId[]).filter((id) => {
          const intro = p[id]?.product.introPrice;
          return !!intro && intro.price === 0;
        });
        if (!withIntro.length) return;
        const ids = withIntro.map((id) => p[id]!.product.identifier);
        const elig = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids);
        const out: Partial<Record<PlanId, boolean>> = {};
        for (const id of withIntro) out[id] = elig[p[id]!.product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
        if (alive) setFree(out);
      } catch {
        // ohne Auskunft kein Versprechen
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return free;
}

/** Gebuchter Plan, wie der App Store ihn kennt (Anzeige in Einstellungen und Mitgliedschaft, Koray 17.11.) */
export type CurrentPlan = {
  id: PlanId;
  /** Abo verlängert sich (Woche, Monat, Jahr); false nach Kündigung und beim Saison Pass */
  willRenew: boolean;
  /** Ende der bezahlten Zeit oder nächste Verlängerung; im Gratismonat dessen Ende */
  until: Date | null;
  /** im Gratismonat, noch nichts bezahlt */
  trial: boolean;
};

const PLAN_OF = (productId: string | undefined): PlanId | null => {
  const m = /\.(jahr|monat|woche|saison)$/.exec(productId ?? '');
  return m ? (m[1] as PlanId) : null;
};

function planFrom(info: CustomerInfo): CurrentPlan | null {
  const pro = info.entitlements.active['pro'];
  const id = PLAN_OF(pro?.productIdentifier);
  if (pro && id) return { id, willRenew: pro.willRenew, until: pro.expirationDate ? new Date(pro.expirationDate) : null, trial: pro.periodType === 'TRIAL' };
  // Saison Pass: Abo ohne Verlängerung, gilt 183 Tage ab Kauf (wie im Webhook)
  const saison = info.nonSubscriptionTransactions
    .filter((t) => PLAN_OF(t.productIdentifier) === 'saison')
    .map((t) => new Date(t.purchaseDate).getTime() + 183 * 24 * 60 * 60 * 1000)
    .sort((a, b) => b - a)[0];
  if (saison && saison > Date.now()) return { id: 'saison', willRenew: false, until: new Date(saison), trial: false };
  return null;
}

let current: CurrentPlan | null = null;
const planListeners = new Set<(p: CurrentPlan | null) => void>();

async function refreshCurrentPlan(): Promise<void> {
  if (!available()) return;
  try {
    if (!(await ready())) return;
    current = planFrom(await Purchases.getCustomerInfo());
    for (const l of planListeners) l(current);
    await syncPlanReminder(current);
  } catch {
    // ohne Netz bleibt der letzte Stand
  }
}

const hasNotifications = typeof ExpoModules.requireOptionalNativeModule === 'function' && !!ExpoModules.requireOptionalNativeModule('ExpoPushTokenManager');

/** Erinnerung vor der Verlängerung planen oder entfernen (lib/plan-reminder) */
async function syncPlanReminder(plan: CurrentPlan | null): Promise<void> {
  if (!hasNotifications) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications') as typeof NotificationsT;
  const r = (await pushStatus()) === 'an' ? planReminder(plan) : null;
  await Notifications.cancelScheduledNotificationAsync(PLAN_REMINDER_ID).catch(() => undefined);
  if (!r) return;
  await Notifications.scheduleNotificationAsync({
    identifier: PLAN_REMINDER_ID,
    content: { title: r.title, body: r.body, data: { url: '/mitgliedschaft', type: 'plan_reminder' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
  }).catch(() => undefined);
}

// Stand beim Start und bei jeder Rückkehr in die App holen, damit die Erinnerung auch ohne Besuch der Einstellungen
// stimmt (etwa nach einer Kündigung in der Apple ID)
if (available()) {
  setTimeout(() => void refreshCurrentPlan(), 4000);
  AppState.addEventListener('change', (st) => {
    if (st === 'active') void refreshCurrentPlan();
  });
}

/** Gebuchter Plan oder null (kein Kauf im App Store, Club, Testphase, Web) */
export function useCurrentPlan(): CurrentPlan | null {
  const [plan, setPlan] = useState<CurrentPlan | null>(current);
  useEffect(() => {
    planListeners.add(setPlan);
    void refreshCurrentPlan();
    return () => {
      planListeners.delete(setPlan);
    };
  }, []);
  return plan;
}

/** Abo verwalten: Apples eigene Seite für Kündigen und Wechseln */
export async function manageSubscription(): Promise<void> {
  if (available() && (await ready())) {
    await Purchases.showManageSubscriptions();
    void refreshCurrentPlan();
  }
}
