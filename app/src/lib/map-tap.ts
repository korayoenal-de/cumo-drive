/**
 * Tipp auf eine Marke oder auf die freie Karte unterscheiden (Koray 17.11.: in der Community musste man mehrmals auf
 * die Punkte tippen). Auf dem iPhone meldet react-native-maps jeden Tipp zusätzlich an die Karte, auch den Tipp auf
 * eine Marke, und zwar ohne action: 'marker-press'. So hob der Kartentipp die eben gewählte Marke gleich wieder auf.
 *
 * Nutzung: onMarkerPress der MapView ruft marker(), onPress der MapView ruft map(fn). Der Kartentipp wartet kurz und
 * entfällt, wenn in der Zeit (oder kurz davor) eine Marke getippt wurde; die Reihenfolge der beiden Meldungen ist egal.
 */
import { useEffect, useMemo, useRef } from 'react';

/** so lange gilt ein Kartentipp als Teil eines Markentipps */
const SAME_TAP_MS = 350;
/** so lange wartet der Kartentipp auf eine Markenmeldung */
const WAIT_MS = 90;

export function useMapTapGuard() {
  const at = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  return useMemo(
    () => ({
      marker() {
        at.current = Date.now();
        if (pending.current) {
          clearTimeout(pending.current);
          pending.current = null;
        }
      },
      map(fn: () => void) {
        if (Date.now() - at.current < SAME_TAP_MS) return;
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(() => {
          pending.current = null;
          if (Date.now() - at.current >= SAME_TAP_MS) fn();
        }, WAIT_MS);
      },
    }),
    [],
  );
}
