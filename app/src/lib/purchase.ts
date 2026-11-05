/**
 * Kauf Adapter für die Mitgliedschaft. Die Paywall spricht nur mit diesen zwei Funktionen.
 *
 * TODO RevenueCat (Apple In App Purchase):
 * 1. Produkte in App Store Connect anlegen (Woche, Monat, Jahr als Auto Renewing Abos in einer Gruppe,
 *    Saison Pass als Non Renewing Subscription über 6 Monate) und in RevenueCat einem Offering zuordnen.
 * 2. react-native-purchases installieren, beim Start Purchases.configure({ apiKey, appUserID: Supabase User Id }).
 * 3. purchase(): Paket zur planId aus dem Offering holen und Purchases.purchasePackage(paket) aufrufen.
 *    restorePurchases(): Purchases.restorePurchases().
 * 4. RevenueCat Webhook auf eine Supabase Edge Function zeigen lassen, die mit service role
 *    profiles.plan und profiles.plan_until setzt (die App selbst darf das nicht).
 * 5. Danach refreshEntitlement() aufrufen, damit die App den neuen Stand sieht.
 */
import { getEntitlement, refreshEntitlement, type PlanId } from './entitlement';

export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

const NOT_YET = 'Käufe sind bald möglich. In der Testphase ist alles frei.';

export async function purchase(planId: PlanId): Promise<PurchaseResult> {
  void planId;
  return { ok: false, message: NOT_YET };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  // Auch ohne Store lohnt ein Neuladen: ein vom Betreiber zugewiesener Club oder Plan wird so sichtbar
  await refreshEntitlement();
  const e = getEntitlement();
  if (e.active && e.source !== 'test') return { ok: true };
  return { ok: false, message: NOT_YET };
}
