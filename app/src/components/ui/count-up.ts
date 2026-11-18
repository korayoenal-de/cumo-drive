/**
 * Hochzählen (Joy of Use, Leinwand „Weitere Fälle“, kleine Belohnungen): Zahlen der Fahrtstatistik zählen einmal von
 * null auf ihren Wert, wenn die Statistik erscheint. Liefert den Anteil 0 bis 1 mit weichem Auslauf; bei „Bewegung
 * reduzieren“ sofort 1. Läuft nur einmal je Einbau und nur wenige Bilder lang.
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

export function useCountUp(ms = 900): number {
  const reduced = useReducedMotion();
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const x = Math.min(1, (Date.now() - t0) / ms);
      // Auslauf ohne Überschwingen
      setP(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, reduced]);
  return reduced ? 1 : p;
}
