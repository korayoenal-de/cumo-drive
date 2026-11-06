/**
 * Hält CarPlay mit der App gleich: die aktive Tour erscheint auf dem Autodisplay als Vorschau,
 * "Los" dort öffnet die Navigation und startet sie (src/app/navigation.tsx).
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useActiveTour } from '@/lib/active-tour';
import { carPlayAvailable, carPlaySetTour, markCarPlayStart, useCarPlayEvent } from '@/lib/carplay';

export function CarPlaySync() {
  const active = useActiveTour();
  useEffect(() => {
    if (carPlayAvailable) carPlaySetTour(active?.tour ?? null);
  }, [active]);
  // nach dem Einstecken die Tour erneut schicken (die Karte im Auto ist neu)
  useCarPlayEvent('onConnect', () => carPlaySetTour(active?.tour ?? null));
  useCarPlayEvent('onStart', () => {
    if (!active) return;
    markCarPlayStart();
    router.navigate('/navigation');
  });
  return null;
}
