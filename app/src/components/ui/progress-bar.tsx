/**
 * Fortschritt beim Erstellen einer Tour (Koray 8.11.: Balken mit Prozent statt Logo). Jeder Schritt hat seinen
 * Bereich; innerhalb eines Schritts wächst der Balken langsam weiter, ohne das Ende des Bereichs zu erreichen.
 * done füllt in kurzer Zeit auf 100 %, passend zur Auflösung auf der Karte.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Type } from '@/constants/theme';

/** Bereiche je Schritt in Prozent, Reihenfolge wie PHASES: Startort, Route, Vergleich, Verkehr, Prüfen, Umfahren */
const RANGES: [number, number][] = [
  [0, 10],
  [10, 58],
  [58, 72],
  [72, 84],
  [84, 90],
  [90, 96],
];

export function ProgressBar({ step, done = false, doneMs = 2000, expectMs = 9000 }: { step: number; done?: boolean; doneMs?: number; expectMs?: number }) {
  const [pct, setPct] = useState(0);
  const cur = useRef(0);
  const t0 = useRef<number | null>(null);
  const w = useSharedValue(0);
  useEffect(() => {
    const [from] = RANGES[Math.max(0, Math.min(RANGES.length - 1, step))];
    const begin = Date.now();
    const start = Math.max(cur.current, from);
    const id = setInterval(() => {
      if (t0.current == null) t0.current = begin;
      const total = Date.now() - t0.current;
      // Nie stehen bleiben (Koray 9.11.: sonst wirkt die App hängen): Kurve über die erwartete Dauer,
      // dazu mindestens 0,8 % je Sekunde, höchstens 97 % bis die Route da ist. Ein neuer Schritt springt
      // höchstens an den Anfang seines Bereichs vor, nie zurück.
      const curve = 96 * (1 - Math.exp((-2.3 * total) / expectMs));
      const v = done
        ? Math.min(100, start + ((100 - start) * (Date.now() - begin)) / doneMs)
        : Math.min(97, Math.max(start, curve, cur.current + 0.08));
      cur.current = Math.max(cur.current, v);
      setPct(Math.floor(cur.current));
      w.set(withTiming(cur.current, { duration: 150, easing: Easing.linear }));
      if (done && v >= 100) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [step, done, doneMs, expectMs, w]);
  const bar = useAnimatedStyle(() => ({ width: `${w.get()}%` }));
  return (
    <View style={styles.wrap} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, bar]} />
      </View>
      <AppText style={styles.pct}>{pct} %</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: Colors.signal },
  pct: { width: 52, textAlign: 'right', fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
});
