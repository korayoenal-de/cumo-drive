/**
 * Web Planer: gekauft wird nur in der iPhone App (Apple In App Purchase). Hier nur der Abgleich mit dem Konto.
 */
import { getEntitlement, refreshEntitlement, type PlanId } from './entitlement';

export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

export const PRODUCT_IDS: Record<PlanId, string> = {
  jahr: 'de.rallycumo.drive.jahr',
  monat: 'de.rallycumo.drive.monat',
  woche: 'de.rallycumo.drive.woche',
  saison: 'de.rallycumo.drive.saison',
};

export function startPurchases() {}

export async function purchase(planId: PlanId): Promise<PurchaseResult> {
  void planId;
  return { ok: false, message: 'Die Mitgliedschaft schließt du in der iPhone App ab. Sie gilt dann auch hier.' };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  await refreshEntitlement();
  const e = getEntitlement();
  if (e.active && (e.source === 'plan' || e.source === 'club')) return { ok: true };
  return { ok: false, message: 'Für dein Konto haben wir noch keine Mitgliedschaft gefunden.' };
}
