/**
 * Fahrspaß Pegel (Variante S3, entschieden am 7.11.2026, löst E ab): acht Segmente mit rundem Rücken um
 * einen schlanken achtzackigen Stern, der als Negativform frei bleibt. Fünf Stufen füllen 1, 3, 5, 7 und 8
 * Segmente ab 6 Uhr im Uhrzeigersinn. Unter 20 pt nur die orangen Segmente.
 *
 * Legende (animate): subtiler Austausch zwischen Segmenten und Stern, nie beides zugleich (siehe LegendGauge).
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
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export type FunLevel = 1 | 2 | 3 | 4 | 5;

export const FUN_NAMES: Record<FunLevel, string> = { 1: 'Nett', 2: 'Lohnend', 3: 'Stark', 4: 'Traumstraße', 5: 'Legende' };

const N = 8;
/** Stufen: 1, 3, 5, 7 und 8 von 8 Segmenten, Legende ist der volle Kreis */
const FILLED: Record<FunLevel, number> = { 1: 1, 2: 3, 3: 5, 4: 7, 5: 8 };
/**
 * Variante S3 (7.11.2026): Ausgangspunkt ist ein schlanker achtzackiger Stern, eine Zacke oben. Spitzen
 * außen bei RO, Innenecken bei RI, über ROUND der Kante gerundet. Acht Segmente mit rundem Rücken füllen
 * genau den Raum zwischen den Zacken und schließen den Kreis, der Stern bleibt als Negativform frei.
 */
const RO = 11.4;
const RI = 4.2;
const ROUND = 0.22;
const OFF = Colors.empty;
const STEP = 360 / N;
const f = (v: number) => v.toFixed(2);
const at = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [12 + r * Math.sin(a), 12 - r * Math.cos(a)];
};
const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pt = (p: [number, number]) => `${f(p[0])},${f(p[1])}`;

/** Segmente in Füllreihenfolge: das erste direkt links neben 6 Uhr, dann im Uhrzeigersinn (Koray 7.11.) */
const SEGS = Array.from({ length: N }, (_, k) => {
  const c = 180 + STEP / 2 + k * STEP;
  const apex = at(RI, c);
  const l = at(RO, c - STEP / 2);
  const r = at(RO, c + STEP / 2);
  const a1 = lerp(apex, l, ROUND);
  const a2 = lerp(apex, r, ROUND);
  return `M${pt(a2)} L${pt(r)} A${RO},${RO} 0 0 0 ${pt(l)} L${pt(a1)} Q${pt(apex)} ${pt(a2)} Z`;
});

/** Der Stern selbst (Legende) */
const STAR = (() => {
  let d = '';
  for (let k = 0; k < N; k++) {
    const tip = at(RO, k * STEP);
    const next = at(RO, (k + 1) * STEP);
    const inner = at(RI, k * STEP + STEP / 2);
    d += `${k === 0 ? 'M' : 'L'}${pt(tip)} L${pt(lerp(inner, tip, ROUND))} Q${pt(inner)} ${pt(lerp(inner, next, ROUND))} `;
  }
  return `${d}Z`;
})();

const CYCLE_MS = 4000;
const EASE_IN = Easing.in(Easing.quad);
const EASE_OUT = Easing.out(Easing.cubic);
const EASE_IN_OUT = Easing.inOut(Easing.quad);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export function FunGauge({ level, size = 20, animate = false }: { level: FunLevel; size?: number; animate?: boolean }) {
  const reduced = useReducedMotion();
  const label = `Fahrspaß ${FUN_NAMES[level]}, ${level} von 5`;
  if (animate && level === 5 && !reduced) return <LegendGauge size={size} label={label} />;
  const n = FILLED[level];
  const small = size < 20;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image" accessibilityLabel={label}>
      {SEGS.map((d, i) => {
        const on = i < n;
        if (!on && small) return null;
        return <Path key={i} d={d} fill={on ? Colors.signal : OFF} />;
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
          <Path d={STAR} fill={Colors.signal} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, group]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          {SEGS.map((d, i) => (
            <RebuildTri key={i} d={d} step={i} t={t} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Ein oranges Segment: ausgeblendet, solange der Stern dran ist, danach ab 6 Uhr im Uhrzeigersinn versetzt (80 ms) wieder da. */
function RebuildTri({ d, step, t }: { d: string; step: number; t: SharedValue<number> }) {
  const shift = (step * 80) / CYCLE_MS;
  const props = useAnimatedProps(() => {
    const p = t.get();
    if (p < 0.36) return { fillOpacity: 1 };
    return { fillOpacity: EASE_OUT(interpolate(p, [0.66 + shift, 0.74 + shift], [0, 1], 'clamp')) };
  });
  return <AnimatedPath d={d} fill={Colors.signal} animatedProps={props} />;
}

export const toFunLevel = (v: number | null | undefined): FunLevel => Math.max(1, Math.min(5, Math.round(v ?? 3))) as FunLevel;
