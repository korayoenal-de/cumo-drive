/**
 * Abschnitt "Mitgliedschaft" für die Einstellungen: aktueller Stand und der Weg zur Paywall.
 */

import { formatUntil, PRICES, type Entitlement } from '@/lib/entitlement';

import { limitsLive } from '@/lib/paywall';

import { t } from '@/i18n';

export function describeEntitlement(e: Entitlement): { title: string; text: string } {
  const until = formatUntil(e.until);
  if (!e.active && e.source === 'kostenlos') {
    return { title: t('Kostenlos'), text: t('Du planst überall und fährst in deinem Heimatgebiet, mit Gruppen zu dritt. Mit einem Plan geht alles, überall.') };
  }
  if (!e.active) {
    return {
      title: e.source === 'plan' ? t('Plan abgelaufen') : e.source === 'gruender' ? t('Gründungszeit vorbei') : t('Testphase vorbei'),
      text: limitsLive()
        ? t('Du fährst kostenlos in deinem Heimatgebiet weiter. Mit einem Plan geht alles, überall.')
        : until
          ? t('Abgelaufen am {until}. Wähle einen Plan, um weiterzufahren.', { until })
          : t('Wähle einen Plan, um weiterzufahren.'),
    };
  }
  if (e.source === 'club') {
    return { title: e.clubName ?? t('Club'), text: t('Über deinen Club, gültig bis {until}. Gruppen bis {maxVehicles} Fahrzeuge.', { until, maxVehicles: e.maxVehicles }) };
  }
  if (e.source === 'plan') {
    return { title: t('Plan aktiv'), text: t('Gültig bis {until}.', { until }) };
  }
  if (e.source === 'vorstart') {
    return { title: t('Vor dem Start'), text: t('Bis zum Start ist alles frei. Danach fährst du als Gründungstester 12 Monate kostenlos.') };
  }
  if (e.source === 'gruender') {
    return { title: t('Gründungstester'), text: t('Danke fürs Mittesten. Alles frei bis {until}.', { until }) };
  }
  return {
    title: t('Testphase'),
    text: t('Alles frei bis {until}. Danach ab {v1} weiter.', { until, v1: PRICES[0].perMonthText ?? PRICES[0].priceText }),
  };
}

