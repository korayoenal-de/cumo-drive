/**
 * Fahrspaß Pegel (Variante E): sieben Dreiecke auf einem geschlossenen Kreis, Spitzen zur Mitte, wie das
 * CDC Keyvisual. Sie stoßen an der Basis aneinander, dazwischen bleibt ein siebenzackiger Stern frei.
 * Fünf Stufen füllen 1, 3, 4, 6 und 7 Dreiecke im Uhrzeigersinn. Unter 20 pt nur die orangen Dreiecke.
 *
 * Legende (animate): Dreiecke füllen sich nacheinander, springen auseinander und verschwinden, aus der
 * Negativform erscheint der orange Stern, pulsiert auf 125 % und zurück, blendet aus, die Dreiecke kehren zurück.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export type FunLevel = 1 | 2 | 3 | 4 | 5;

export const FUN_NAMES: Record<FunLevel, string> = { 1: 'Nett', 2: 'Lohnend', 3: 'Stark', 4: 'Traumstraße', 5: 'Legende' };

const N = 7;
const FILLED: Record<FunLevel, number> = { 1: 1, 2: 3, 3: 4, 4: 6, 5: 7 };
const RB = 11.2;
const RT = 4.2;
const HALF = RB * Math.sin(Math.PI / N) * 0.97;
const OFF = '#3A3A3F';
/** Füllreihenfolge im Uhrzeigersinn ab oben links */
const ORDER = [5, 6, 0, 1, 2, 3, 4];
const f = (v: number) => v.toFixed(2);

const TRIS = Array.from({ length: N }, (_, i) => {
  const a = ((i * 360) / N) * (Math.PI / 180);
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);
  const bx = 12 + ux * RB * Math.cos(Math.PI / N);
  const by = 12 + uy * RB * Math.cos(Math.PI / N);
  return `${f(12 + ux * RT)},${f(12 + uy * RT)} ${f(bx + px * HALF)},${f(by + py * HALF)} ${f(bx - px * HALF)},${f(by - py * HALF)}`;
});

/** Negativform: Zacken an den Stoßstellen der Basen, Innenecken an den Spitzen */
const STAR = (() => {
  const ro = Math.hypot(RB * Math.cos(Math.PI / N), HALF);
  const out: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = ((i * 360) / N) * (Math.PI / 180);
    const b = (((i + 0.5) * 360) / N) * (Math.PI / 180);
    out.push(`${f(12 + Math.sin(a) * RT)},${f(12 - Math.cos(a) * RT)}`, `${f(12 + Math.sin(b) * ro)},${f(12 - Math.cos(b) * ro)}`);
  }
  return out.join(' ');
})();

const CYCLE_MS = 3200;
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

export function FunGauge({ level, size = 20, animate = false }: { level: FunLevel; size?: number; animate?: boolean }) {
  const reduced = useReducedMotion();
  const label = `Fahrspaß ${FUN_NAMES[level]}, ${level} von 5`;
  if (animate && level === 5 && !reduced) return <LegendGauge size={size} label={label} />;
  const n = FILLED[level];
  const small = size < 20;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image" accessibilityLabel={label}>
      {TRIS.map((pts, i) => {
        const on = ORDER.indexOf(i) < n;
        if (!on && small) return null;
        return <Polygon key={i} points={pts} fill={on ? Colors.signal : OFF} />;
      })}
    </Svg>
  );
}

/** Legende mit Stern Animation, läuft in Schleife, solange sie zu sehen ist. */
function LegendGauge({ size, label }: { size: number; label: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t]);
  // Dreiecke springen auseinander (22 bis 29 %) und kehren zurück (82 bis 92 %)
  const group = useAnimatedStyle(() => {
    const p = t.get();
    const scale = interpolate(p, [0, 0.22, 0.29, 0.82, 0.92, 1], [1, 1, 1.6, 0.85, 1, 1], 'clamp');
    const opacity = interpolate(p, [0, 0.22, 0.29, 0.82, 0.92, 1], [1, 1, 0, 0, 1, 1], 'clamp');
    return { opacity, transform: [{ scale }] };
  });
  // Stern: erscheint, pulsiert auf 125 % und zurück, blendet aus
  const star = useAnimatedStyle(() => {
    const p = t.get();
    const scale = interpolate(p, [0, 0.29, 0.47, 0.64, 1], [1, 1, 1.25, 1, 1], 'clamp');
    const opacity = interpolate(p, [0, 0.25, 0.29, 0.64, 0.7, 1], [0, 0, 1, 1, 0, 0], 'clamp');
    return { opacity, transform: [{ scale }] };
  });
  const box = { width: size, height: size };
  return (
    <View style={box} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View style={[StyleSheet.absoluteFill, star]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polygon points={STAR} fill={Colors.signal} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, group]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {TRIS.map((pts, i) => (
            <FillingTri key={i} pts={pts} step={ORDER.indexOf(i)} t={t} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Ein Dreieck, das sich zu seinem Zeitpunkt orange färbt (80 ms Versatz je Dreieck). */
function FillingTri({ pts, step, t }: { pts: string; step: number; t: SharedValue<number> }) {
  const at = (step * 80) / CYCLE_MS;
  const props = useAnimatedProps(() => {
    const p = t.get();
    const k = p < 0.81 ? interpolate(p, [at, at + 0.04], [0, 1], 'clamp') : 0;
    return { fill: interpolateColor(k, [0, 1], [OFF, Colors.signal]) };
  });
  return <AnimatedPolygon points={pts} animatedProps={props} />;
}

export const toFunLevel = (v: number | null | undefined): FunLevel => Math.max(1, Math.min(5, Math.round(v ?? 3))) as FunLevel;
