/**
 * Web Planer: Käufe laufen nur über den App Store in der iPhone App (Koray 17.11.). Hier gibt es dafür nur den
 * Hinweis und das Neuladen des Stands, etwa nach einem Kauf auf dem iPhone oder einer Club Zuweisung.
 */
import { getEntitlement, refreshEntitlement, type PlanId } from './entitlement';
import { t } from '@/i18n';

export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

const IN_APP = t('Pläne kaufst du in der CUMO DRIVE App auf dem iPhone. Danach gilt dein Plan auch hier.');

export async function purchase(planId: PlanId): Promise<PurchaseResult> {
  void planId;
  return { ok: false, message: IN_APP };
}

export async function restorePurchases(): Promise<PurchaseResult> {
  await refreshEntitlement();
  const e = getEntitlement();
  if (e.active && e.source !== 'test') return { ok: true };
  return { ok: false, message: IN_APP };
}

export function useStorePrices(): Partial<Record<PlanId, string>> {
  return {};
}

export type CurrentPlan = { id: PlanId; willRenew: boolean; until: Date | null };

export function useCurrentPlan(): CurrentPlan | null {
  return null;
}

export async function manageSubscription(): Promise<void> {}
