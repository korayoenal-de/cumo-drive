/**
 * Erinnerung vor der Verlängerung (Koray 17.11., Nutzerstimmen der Wettbewerber: die Verlängerung des Jahresabos
 * kam überraschend und ärgerte mehr als alles andere). Lokal auf dem Gerät geplant, nur wenn Mitteilungen erlaubt
 * sind; fragt nie selbst nach.
 *
 * * Jahr: 7 Tage vor der Verlängerung um 10 Uhr
 * * Saison Pass: 3 Tage vor dem Ende, denn er endet von selbst und man soll nicht mitten in der Tour ohne Plan sein
 * * Woche und Monat: keine Erinnerung, das wäre bei jedem Zyklus zu viel
 * * Gratismonat (Einführungsangebot im App Store): 3 Tage vor seinem Ende, bei jedem Abo
 * Nach einer Kündigung (willRenew false) entfällt die Erinnerung beim Jahr und im Gratismonat.
 */
import type { PlanId } from './entitlement';
import { t } from '@/i18n';

export const PLAN_REMINDER_ID = 'plan-renewal';

export type PlanReminder = { at: Date; title: string; body: string };

const DAY = 24 * 60 * 60 * 1000;

const PLAN_NAME: Record<PlanId, string> = { jahr: t('Jahr'), monat: t('Monat'), woche: t('Woche'), saison: t('Saison Pass') };

/** wie formatUntil in entitlement.ts; hier ohne dessen Abhängigkeiten, damit die Tests ohne React Native laufen */
const formatUntil = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function morningOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(10, 0, 0, 0);
  return m;
}

export function planReminder(plan: { id: PlanId; willRenew: boolean; until: Date | null; trial?: boolean } | null, now = Date.now()): PlanReminder | null {
  if (!plan?.until) return null;
  const end = plan.until;
  // Gratismonat: 3 Tage vor dem Ende, bei jedem Abo, solange es nicht gekündigt ist
  if (plan.trial) {
    if (!plan.willRenew) return null;
    const at = morningOf(new Date(end.getTime() - 3 * DAY));
    if (at.getTime() <= now) return null;
    return {
      at,
      title: t('Dein Gratismonat endet in 3 Tagen'),
      body: t('Ab {date} beginnt dein Plan {name}. Kündigen oder wechseln kannst du in den Einstellungen unter Mitgliedschaft.', { date: formatUntil(end), name: PLAN_NAME[plan.id] }),
    };
  }
  if (plan.id === 'jahr' && plan.willRenew) {
    const at = morningOf(new Date(end.getTime() - 7 * DAY));
    if (at.getTime() <= now) return null;
    return {
      at,
      title: t('Dein Jahresplan verlängert sich in 7 Tagen'),
      body: t('Am {date} verlängert sich CUMO DRIVE um ein Jahr. Kündigen oder wechseln kannst du in den Einstellungen unter Mitgliedschaft.', { date: formatUntil(end) }),
    };
  }
  if (plan.id === 'saison') {
    const at = morningOf(new Date(end.getTime() - 3 * DAY));
    if (at.getTime() <= now) return null;
    return {
      at,
      title: t('Dein Saison Pass endet in 3 Tagen'),
      body: t('Er gilt bis {date} und endet von selbst. Deine Touren bleiben in deinem Konto.', { date: formatUntil(end) }),
    };
  }
  return null;
}
