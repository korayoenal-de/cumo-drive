/**
 * Hält CarPlay mit der App gleich: die aktive Tour erscheint auf dem Autodisplay als Vorschau,
 * "Los" dort öffnet die Navigation und startet sie (src/app/navigation.tsx).
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useActiveTour } from '@/lib/active-tour';
import { carPlayAvailable, carPlayResend, carPlaySetMapStyle, carPlaySetTour, markCarPlayStart, useCarPlayEvent } from '@/lib/carplay';
import { carPlayStyleOf, setMapSettings, useMapSettings, type MapStyle } from '@/lib/map-settings';

export function CarPlaySync() {
  const active = useActiveTour();
  useEffect(() => {
    if (carPlayAvailable) carPlaySetTour(active?.tour ?? null);
  }, [active]);
  // Darstellung aus den Karteneinstellungen auch im Auto (Testfahrer 8.11.)
  const style = carPlayStyleOf(useMapSettings());
  useEffect(() => {
    if (carPlayAvailable) carPlaySetMapStyle(style);
  }, [style]);
  // nach dem Einstecken die Tour und die Darstellung erneut schicken (die Karte im Auto ist neu)
  useCarPlayEvent('onConnect', () => {
    carPlayResend();
    carPlaySetMapStyle(style);
  });
  // Kartenstil im Auto gewechselt (Menü Mehr): gilt dann für alle Karten der App
  useCarPlayEvent('onMapStyle', (e) => {
    if (e.style === 'standard' || e.style === 'satellit' || e.style === '3d') setMapSettings({ style: e.style as MapStyle });
  });
  useCarPlayEvent('onStart', () => {
    if (!active) return;
    markCarPlayStart();
    router.navigate('/navigation');
  });
  return null;
}
