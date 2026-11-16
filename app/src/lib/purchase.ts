/**
 * Kauf Adapter für die Mitgliedschaft (RevenueCat, Apple In App Purchase). Die Paywall spricht nur mit
 * purchase() und restorePurchases().
 *
 * Ablauf: RevenueCat kennt das Konto unter der Supabase Konto ID. Nach einem Kauf schreibt der Webhook
 * (Edge Function revenuecat) plan und plan_until in profiles; die App fragt danach my_entitlement neu.
 * Die Wahrheit bleibt im Backend, damit App, Web Planer, Club und freie Phasen eine Quelle haben.
 * Weil der Webhook ein paar Sekunden brauchen kann, gilt ein frischer Kauf in der App sofort als aktiv
 * (markPurchased), bis der Server ihn bestätigt.
 *
 * Produkte in App Store Connect (docs/bezahlmodell.md): de.rallycumo.drive.jahr, .monat, .woche als Abos
 * in einer Gruppe, .saison als Abo ohne Verlängerung (6 Monate).
 */
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE, type PurchasesError, type PurchasesPackage } from 'react-native-purchases';

import { getEntitlement, markPurchased, refreshEntitlement, type PlanId } from './entitlement';
import { supabase } from './supabase';

export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const PRODUCT_IDS: Record<PlanId, string> = {
  jahr: 'de.rallycumo.drive.jahr',
  monat: 'de.rallycumo.drive.monat',
  woche: 'de.rallycumo.drive.woche',
  saison: 'de.rallycumo.drive.saison',
};

const NOT_YET = 'Käufe sind bald möglich. Bis dahin ist alles frei.';

let configured = false;
let loggedIn: string | null = null;

function ready() {
  return Platform.OS === 'ios' && !!API_KEY;
}

/** Einmal beim Start: RevenueCat einrichten und dem angemeldeten Konto folgen */
export function startPurchases() {
  if (!ready() || configured) return;
  configured = true;
  try {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: API_KEY });
  } catch {
    configured = false;
    return;
  }
  const follow = (uid: string | null) => {
    if (uid === loggedIn) return;
    loggedIn = uid;
    if (uid) void Purchases.logIn(uid).catch(() => {});
    else void Purchases.logOut().catch(() => {});
  };
  supabase.auth
    .getSession()
    .then(({ data }) => follow(data.session?.user.id ?? null))
    .catch(() => {});
  supabase.auth.onAuthStateChange((_e, s) => follow(s?.user.id ?? null));
}

async function packageFor(planId: PlanId): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  return pkgs.find((p) => p.product.identifier === PRODUCT_IDS[planId]) ?? null;
}

function errorText(e: unknown): PurchaseResult {
  const err = e as Partial<PurchasesError> & { userCancelled?: boolean };
  if (err?.userCancelled || err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return { ok: false, cancelled: true, message: '' };
  }
  switch (err?.code) {
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
      return { ok: false, message: 'Keine Verbindung. Versuch es gleich nochmal.' };
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return { ok: false, message: 'Käufe sind auf diesem iPhone nicht erlaubt (Bildschirmzeit).' };
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return { ok: false, message: 'Der Kauf wartet noch auf eine Freigabe. Sobald sie da ist, schalten wir frei.' };
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return { ok: false, message: 'Den Plan hast du schon. Tipp auf Käufe wiederherstellen.' };
    default:
      return { ok: false, message: 'Der Kauf hat nicht geklappt. Es wurde nichts abgebucht.' };
  }
}

/** Nach dem Kauf: den Server fragen, ein paar Mal, bis der Webhook angekommen ist */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await refreshEntitlement();
    const e = getEntitlement();
    if (e.active && e.source === 'plan') return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export async function purchase(planId: PlanId): Promise<PurchaseResult> {
  if (!ready()) return { ok: false, message: Platform.OS === 'ios' ? NOT_YET : 'Kaufen geht in der iPhone App.' };
  startPurchases();
  try {
    const pkg = await packageFor(planId);
    if (!pkg) return { ok: false, message: 'Dieser Plan ist gerade nicht verfügbar. Versuch es später nochmal.' };
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const pro = customerInfo.entitlements.active.pro;
    if (!pro) return { ok: false, message: 'Der Kauf ist noch nicht bestätigt. Tipp gleich auf Käufe wiederherstellen.' };
    markPurchased(planId, pro.expirationDate ? new Date(pro.expirationDate) : null);
    void settle();
    return { ok: true };
  } catch (e) {
    return errorText(e);
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  // Auch ohne Store lohnt ein Neuladen: ein vom Betreiber zugewiesener Club wird so sichtbar
  if (ready()) {
    startPurchases();
    try {
      const info = await Purchases.restorePurchases();
      const pro = info.entitlements.active.pro;
      if (pro) {
        const plan = (Object.keys(PRODUCT_IDS) as PlanId[]).find((k) => PRODUCT_IDS[k] === pro.productIdentifier) ?? 'jahr';
        markPurchased(plan, pro.expirationDate ? new Date(pro.expirationDate) : null);
        void settle();
        return { ok: true };
      }
    } catch (e) {
      const r = errorText(e);
      if (!r.ok && r.cancelled) return r;
    }
  }
  await refreshEntitlement();
  const e = getEntitlement();
  if (e.active && (e.source === 'plan' || e.source === 'club')) return { ok: true };
  return { ok: false, message: ready() ? 'Wir haben keinen Kauf zu deiner Apple ID gefunden.' : NOT_YET };
}
