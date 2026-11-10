/**
 * Hält CarPlay mit der App gleich: die aktive Tour erscheint auf dem Autodisplay als Vorschau,
 * "Los" dort öffnet die Navigation und startet sie (src/app/navigation.tsx).
 * Ab Build 16 kann man im Auto auch selbst starten: Meine Touren oder eine Schnelle Runde (carplay-start.ts).
 */
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { useActiveTour } from '@/lib/active-tour';
import {
  carPlayAvailable, carPlayHasPicker, carPlayResend, carPlaySetCar, carPlaySetLibrary, carPlaySetMapStyle, carPlaySetTour, markCarPlayStart, useCarPlayEvent,
} from '@/lib/carplay';
import { carLookFor } from '@/components/map/car-sprite';
import { useLibrary } from '@/lib/library';
import { useVehicles } from '@/lib/vehicle';
import { carPlayStyleOf, setMapSettings, useMapSettings, type MapStyle } from '@/lib/map-settings';

import { cancelCarRound, carTourItems, fillCarTourFun, planCarRound, startSavedTour } from './carplay-start';

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
  // eigenes Auto als Standort im Auto, ohne Auto der eigene Pin (Koray 10.11.)
  const look = carLookFor(useVehicles().current);
  const lookKey = look ? `${look.form}|${look.color}` : '';
  useEffect(() => {
    if (carPlayAvailable) carPlaySetCar(look);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey]);
  // Meine Touren fürs Autodisplay (ab Build 16); ohne CarPlay geht nichts hinüber
  const library = useLibrary();
  const items = useMemo(() => (carPlayHasPicker ? carTourItems(library) : []), [library]);
  useEffect(() => {
    if (carPlayHasPicker) carPlaySetLibrary(items);
  }, [items]);
  // nach dem Einstecken die Tour und die Darstellung erneut schicken (die Karte im Auto ist neu)
  useCarPlayEvent('onConnect', () => {
    carPlayResend();
    carPlaySetMapStyle(style);
    carPlaySetCar(look);
    if (carPlayHasPicker) {
      carPlaySetLibrary(items);
      fillCarTourFun(library);
    }
  });
  useCarPlayEvent('onDisconnect', () => cancelCarRound());
  // Kartenstil im Auto gewechselt (Menü Mehr): gilt dann für alle Karten der App
  useCarPlayEvent('onMapStyle', (e) => {
    if (e.style === 'standard' || e.style === 'satellit' || e.style === '3d') setMapSettings({ style: e.style as MapStyle });
  });
  useCarPlayEvent('onStart', () => {
    if (!active) return;
    markCarPlayStart();
    router.navigate('/navigation');
  });
  // Start im Auto: Tour aus Meine Touren oder Schnelle Runde ab dem Standort
  useCarPlayEvent('onPickTour', (e) => {
    if (e.id) startSavedTour(e.id);
  });
  useCarPlayEvent('onRoundTrip', (e) => {
    if (e.km && e.km > 0) void planCarRound(e.km);
  });
  useCarPlayEvent('onRoundCancel', () => cancelCarRound());
  return null;
}
