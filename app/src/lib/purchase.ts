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
import { NativeModules, Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

import { getEntitlement, refreshEntitlement, type PlanId } from './entitlement';
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
