/**
 * Navigationssymbole aus maneuver-geometry.ts (gleiche Formen wie im Design System).
 *
 * Mit soon (Manöver steht kurz bevor) baut sich der Pfeil von unten bis zur Spitze auf, wie mit einer Maske
 * aufgedeckt, darunter bleibt er schwach sichtbar. Ist die Spitze erreicht, pulsiert das Symbol kurz.
 * Symbole ohne Pfeil pulsieren nur. Bei „Bewegung reduzieren“ bleibt ein sanftes Pulsieren der Deckkraft.
 */
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { ManeuverKind } from '@/lib/navigation/types';

import { symbolFor, symbolGeometry, type NavSymbol, type Paint, type Shape } from './maneuver-geometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Ablauf je Runde: 700 ms aufbauen, 500 ms stehen (mit Puls), dann von vorn. */
const DRAW_MS = 700;
const HOLD_MS = 500;
const GHOST = 0.3;
const never = { reduceMotion: ReduceMotion.Never };

export function NavSymbolIcon({ symbol, size = 64, color = Colors.text, ground = Colors.ground, soon = false }: { symbol: NavSymbol; size?: number; color?: string; ground?: string; soon?: boolean }) {
  const g = symbolGeometry(symbol);
  const paint: Record<Paint, string> = { ink: color, faint: color, ground, signal: Colors.signal };
  const reduce = useReducedMotion();
  const p = useSharedValue(1);
  const pulse = useSharedValue(0);
  const drawable = g.shapes.some((s) => s.t === 'stroke' && s.len != null);
  const draw = soon && drawable && !reduce;

  useEffect(() => {
    cancelAnimation(p);
    cancelAnimation(pulse);
    if (!soon) {
      p.value = 1;
      pulse.value = withTiming(0, { duration: 150 });
      return;
    }
    if (draw) {
      p.value = 0;
      p.value = withRepeat(
        withSequence(
          withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic), ...never }),
          withDelay(HOLD_MS, withTiming(0, { duration: 0, ...never })),
        ),
        -1,
      );
      pulse.value = withRepeat(
        withSequence(
          withDelay(DRAW_MS - 80, withTiming(1, { duration: 180, easing: Easing.out(Easing.quad), ...never })),
          withTiming(0, { duration: HOLD_MS - 100, easing: Easing.inOut(Easing.quad), ...never }),
        ),
        -1,
      );
    } else {
      p.value = 1;
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic), ...never }),
          withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic), ...never }),
        ),
        -1,
      );
    }
    return () => {
      cancelAnimation(p);
      cancelAnimation(pulse);
    };
  }, [soon, draw, p, pulse]);

  // Reihenfolge der Pfeillinien: jede beginnt, wo die vorige endet
  const lens = g.shapes.map((s) => (s.t === 'stroke' && s.len ? s.len : 0));
  const total = lens.reduce((n, l) => n + l, 0);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((n, l) => n + l, 0));
  const body = g.shapes.map((s, i) => {
    if (s.t === 'stroke' && s.len && draw) return <DrawnStroke key={i} shape={s} color={paint[s.paint]} from={starts[i]} total={total} p={p} />;
    if (s.t === 'fill' && s.round && draw) return <DrawnHead key={i} d={s.d} color={paint[s.paint]} p={p} />;
    return <StaticShape key={i} shape={s} color={paint[s.paint]} />;
  });

  const style = useAnimatedStyle(() => {
    if (reduce) return { opacity: 1 - pulse.value * 0.35 };
    return { transform: [{ scale: 1 + pulse.value * (draw ? 0.06 : 0.1) }] };
  });

  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {g.mirror ? <G transform="matrix(-1 0 0 1 64 0)">{body}</G> : body}
      </Svg>
    </Animated.View>
  );
}

function StaticShape({ shape: s, color }: { shape: Shape; color: string }) {
  if (s.t === 'stroke') {
    return <Path d={s.d} stroke={color} strokeOpacity={s.paint === 'faint' ? 0.35 : 1} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  }
  return (
    <Path
      d={s.d}
      fill={color}
      fillOpacity={s.paint === 'faint' ? 0.35 : 1}
      fillRule={s.evenodd ? 'evenodd' : 'nonzero'}
      {...(s.round ? { stroke: color, strokeWidth: 2, strokeLinejoin: 'round' as const } : {})}
    />
  );
}

/** Linie, die sich über die Länge aufbaut; schwach darunter die ganze Linie. */
function DrawnStroke({ shape: s, color, from, total, p }: { shape: Extract<Shape, { t: 'stroke' }>; color: string; from: number; total: number; p: SharedValue<number> }) {
  const len = s.len ?? 1;
  const props = useAnimatedProps(() => {
    const local = Math.min(1, Math.max(0, (p.value * total - from) / len));
    return { strokeDashoffset: len * (1 - local) };
  });
  return (
    <G>
      <Path d={s.d} stroke={color} strokeOpacity={GHOST} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <AnimatedPath d={s.d} stroke={color} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[len, len]} animatedProps={props} />
    </G>
  );
}

/** Spitze: schwach, bis die Linie sie erreicht, dann voll. */
function DrawnHead({ d, color, p }: { d: string; color: string; p: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    const o = interpolate(p.value, [0.82, 0.97], [GHOST, 1], 'clamp');
    return { fillOpacity: o, strokeOpacity: o };
  });
  return <AnimatedPath d={d} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" animatedProps={props} />;
}

/** Manöver Symbol; im Kreisverkehr mit der Ausfahrt Nummer. */
export function ManeuverIcon({ kind, exit, size = 64, color = Colors.text, soon = false }: { kind: ManeuverKind; exit?: number; size?: number; color?: string; soon?: boolean }) {
  return <NavSymbolIcon symbol={symbolFor(kind, exit)} size={size} color={color} soon={soon} />;
}

/** Lautsprecher, an oder aus. */
export function SpeakerIcon({ on, size = 26, color = Colors.text }: { on: boolean; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M 4 12 L 10 12 L 17 6 L 17 26 L 10 20 L 4 20 Z" fill={color} />
      {on ? (
        <G>
          <Path d="M 21 11 A 7 7 0 0 1 21 21" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
          <Path d="M 24 7 A 12 12 0 0 1 24 25" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
        </G>
      ) : (
        <Path d="M 21 12 L 29 20 M 29 12 L 21 20" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      )}
    </Svg>
  );
}

/** Funkgerät Mikrofon. */
export function MicIcon({ size = 28, color = Colors.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x={11} y={4} width={10} height={16} rx={5} fill={color} />
      <Path d="M 7 15 A 9 9 0 0 0 25 15 M 16 24 L 16 29 M 11 29 L 21 29" stroke={color} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
