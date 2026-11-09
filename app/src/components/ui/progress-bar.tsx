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

export function ProgressBar({ step, done = false, doneMs = 2000 }: { step: number; done?: boolean; doneMs?: number }) {
  const [pct, setPct] = useState(0);
  const cur = useRef(0);
  const w = useSharedValue(0);
  useEffect(() => {
    const [from, to] = RANGES[Math.max(0, Math.min(RANGES.length - 1, step))];
    const t0 = Date.now();
    const start = Math.max(cur.current, from);
    const id = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      // done: gleichmäßig bis 100; sonst nähert sich der Wert dem Ende des Bereichs, erreicht es aber nie
      const v = done ? Math.min(100, start + ((100 - start) * (Date.now() - t0)) / doneMs) : start + (to - 1 - start) * (1 - Math.exp(-s / 4));
      cur.current = Math.max(cur.current, v);
      setPct(Math.floor(cur.current));
      w.set(withTiming(cur.current, { duration: 150, easing: Easing.linear }));
      if (done && v >= 100) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [step, done, doneMs, w]);
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
