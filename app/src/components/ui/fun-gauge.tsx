/**
 * Fahrspaß Pegel (Variante E): sieben Dreiecke auf einem geschlossenen Kreis, Spitzen zur Mitte, wie das
 * CDC Keyvisual. Sie stoßen an der Basis aneinander, dazwischen bleibt ein siebenzackiger Stern frei.
 * Fünf Stufen füllen 1, 3, 4, 6 und 7 Dreiecke im Uhrzeigersinn. Unter 20 pt nur die orangen Dreiecke.
 *
 * Legende (animate): subtiler Austausch zwischen Dreiecken und Stern, nie beides zugleich (siehe LegendGauge).
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
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
const OFF = Colors.empty;
/** Kreis um 180 Grad gedreht (eine Zacke oben, zwei unten); Füllung beginnt immer unten bei 6 Uhr und läuft im Uhrzeigersinn (Koray 7.11.) */
const ROT = 180;
const ORDER = [0, 1, 2, 3, 4, 5, 6];
const f = (v: number) => v.toFixed(2);

const TRIS = Array.from({ length: N }, (_, i) => {
  const a = ((i * 360) / N + ROT) * (Math.PI / 180);
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
    const a = ((i * 360) / N + ROT) * (Math.PI / 180);
    const b = (((i + 0.5) * 360) / N + ROT) * (Math.PI / 180);
    out.push(`${f(12 + Math.sin(a) * RT)},${f(12 - Math.cos(a) * RT)}`, `${f(12 + Math.sin(b) * ro)},${f(12 - Math.cos(b) * ro)}`);
  }
  return out.join(' ');
})();

const CYCLE_MS = 4000;
const EASE_IN = Easing.in(Easing.quad);
const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN_OUT = Easing.inOut(Easing.quad);
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

/**
 * Legende mit Stern Animation, läuft in Schleife, solange sie zu sehen ist. Subtiler Austausch, nie beides zugleich,
 * ohne graue Flächen: Dreiecke weiten sich auf 112 % und blenden aus, danach erscheint der Stern, pulsiert auf 125 %
 * und zurück und blendet aus, danach bauen sich die Dreiecke im Uhrzeigersinn wieder auf.
 */
function LegendGauge({ size, label }: { size: number; label: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t]);
  const group = useAnimatedStyle(() => {
    const p = t.get();
    if (p < 0.3 || p >= 0.67) return { opacity: 1, transform: [{ scale: 1 }] };
    const k = EASE_IN_OUT(interpolate(p, [0.3, 0.36], [0, 1], 'clamp'));
    return { opacity: 1 - k, transform: [{ scale: 1 + 0.12 * k }] };
  });
  const star = useAnimatedStyle(() => {
    const p = t.get();
    if (p < 0.37 || p >= 0.66) return { opacity: 0, transform: [{ scale: 0.92 }] };
    if (p < 0.42) {
      const k = EASE_OUT(interpolate(p, [0.37, 0.42], [0, 1]));
      return { opacity: k, transform: [{ scale: 0.92 + 0.08 * k }] };
    }
    if (p < 0.6) {
      const k = EASE_IN_OUT(p < 0.51 ? interpolate(p, [0.42, 0.51], [0, 1]) : interpolate(p, [0.51, 0.6], [1, 0]));
      return { opacity: 1, transform: [{ scale: 1 + 0.25 * k }] };
    }
    const k = EASE_IN(interpolate(p, [0.6, 0.66], [0, 1]));
    return { opacity: 1 - k, transform: [{ scale: 1 - 0.04 * k }] };
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
            <RebuildTri key={i} pts={pts} step={ORDER.indexOf(i)} t={t} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Ein oranges Dreieck: ausgeblendet, solange der Stern dran ist, danach im Uhrzeigersinn versetzt (80 ms) wieder da. */
function RebuildTri({ pts, step, t }: { pts: string; step: number; t: SharedValue<number> }) {
  const shift = (step * 80) / CYCLE_MS;
  const props = useAnimatedProps(() => {
    const p = t.get();
    if (p < 0.36) return { fillOpacity: 1 };
    return { fillOpacity: EASE_OUT(interpolate(p, [0.66 + shift, 0.74 + shift], [0, 1], 'clamp')) };
  });
  return <AnimatedPolygon points={pts} fill={Colors.signal} animatedProps={props} />;
}

export const toFunLevel = (v: number | null | undefined): FunLevel => Math.max(1, Math.min(5, Math.round(v ?? 3))) as FunLevel;
