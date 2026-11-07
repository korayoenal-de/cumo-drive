/**
 * Navigationssymbole aus maneuver-geometry.ts (gleiche Formen wie im Design System).
 *
 * Mit soon (Manöver steht kurz bevor) baut sich der Pfeil von unten bis zur Spitze auf, wie mit einer Maske
 * aufgedeckt, darunter bleibt er schwach sichtbar. Erreicht die Linie die Basis der Spitze, füllt sich die
 * ganze Spitze auf einmal, die Linie läuft darunter weiter. Danach ein kurzer Puls (6 Prozent).
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
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { ManeuverKind } from '@/lib/navigation/types';

import { SHAFT_INSIDE_HEAD, symbolFor, symbolGeometry, type NavSymbol, type Paint, type Shape } from './maneuver-geometry';

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
  // Fortschritt, bei dem die Linie (mit runder Kappe) die Basis der Spitze erreicht
  const headAt = total > 0 ? Math.max(0.5, (total - SHAFT_INSIDE_HEAD - 3) / total) : 0.9;
  const isInk = (s: Shape) => (s.t === 'stroke' && !!s.len) || (s.t === 'fill' && !!s.round);
  // Schwache Ebene: Umgebung (Ring, Straße) und der ganze Pfeil in EINER Gruppe, die als Ganzes
  // transparent wird. So liegen Ring und schwacher Pfeil nicht übereinander und es ist nur ein Pfad
  // zu sehen (vorher zwei verschieden helle Wege im Kreisverkehr). 0,86 mal 0,35 ergibt wieder 0,3.
  const ghost = draw ? (
    <G opacity={0.35}>
      {g.shapes.map((s, i) =>
        isInk(s) ? <G key={i} opacity={GHOST / 0.35}><StaticShape shape={s} color={paint[s.paint]} solid /></G> : s.paint === 'faint' ? <StaticShape key={i} shape={s} color={paint[s.paint]} solid /> : null,
      )}
    </G>
  ) : null;
  const body = g.shapes.map((s, i) => {
    if (s.t === 'stroke' && s.len && draw) {
      // Schaft unter einer Spitze: hält an der Basis (samt runder Kappe), bis die Spitze voll ist
      const next = g.shapes[i + 1];
      const intoHead = next?.t === 'fill' && !!next.round;
      return <DrawnStroke key={i} shape={s} color={paint[s.paint]} from={starts[i]} total={total} p={p} stopBefore={intoHead ? SHAFT_INSIDE_HEAD + s.w / 2 : 0} release={headAt + 0.025} />;
    }
    if (s.t === 'fill' && s.round && draw) return <DrawnHead key={i} d={s.d} color={paint[s.paint]} p={p} at={headAt} />;
    // Umgebung liegt beim Aufbau schon in der schwachen Ebene
    if (draw && s.paint === 'faint') return null;
    return <StaticShape key={i} shape={s} color={paint[s.paint]} />;
  });
  const all = (
    <>
      {ghost}
      {body}
    </>
  );

  const style = useAnimatedStyle(() => {
    if (reduce) return { opacity: 1 - pulse.value * 0.35 };
    return { transform: [{ scale: 1 + pulse.value * (draw ? 0.06 : 0.1) }] };
  });

  return (
    <Animated.View style={style}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {g.mirror ? <G transform="matrix(-1 0 0 1 64 0)">{all}</G> : all}
        {g.ring && /_([1-9])$/.test(symbol) && (
          <SvgText x={g.ring.x} y={g.ring.y + 5} fontSize={14} fontWeight="800" fill={color} textAnchor="middle">
            {symbol.slice(-1)}
          </SvgText>
        )}
      </Svg>
    </Animated.View>
  );
}

function StaticShape({ shape: s, color, solid }: { shape: Shape; color: string; solid?: boolean }) {
  const faint = s.paint === 'faint' && !solid ? 0.35 : 1;
  if (s.t === 'stroke') {
    return <Path d={s.d} stroke={color} strokeOpacity={faint} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  }
  return (
    <Path
      d={s.d}
      fill={color}
      fillOpacity={faint}
      fillRule={s.evenodd ? 'evenodd' : 'nonzero'}
      {...(s.round ? { stroke: color, strokeWidth: 2, strokeLinejoin: 'round' as const } : {})}
    />
  );
}

/** Linie, die sich über die Länge aufbaut (die schwache Fassung liegt in der Gruppe darunter). */
function DrawnStroke({
  shape: s,
  color,
  from,
  total,
  p,
  stopBefore,
  release,
}: {
  shape: Extract<Shape, { t: 'stroke' }>;
  color: string;
  from: number;
  total: number;
  p: SharedValue<number>;
  /** so viele Einheiten vor dem Ende anhalten, bis p den Wert release erreicht */
  stopBefore: number;
  release: number;
}) {
  const len = s.len ?? 1;
  const props = useAnimatedProps(() => {
    let shown = Math.min(len, Math.max(0, p.value * total - from));
    if (stopBefore > 0 && p.value < release) shown = Math.min(shown, Math.max(0, len - stopBefore));
    return { strokeDashoffset: len + 2 - shown, strokeOpacity: shown > 0 ? 1 : 0 };
  });
  // Lücke weit länger als der Pfad: ist die echte Länge größer als die gerechnete (Bögen),
  // erscheint sonst ein zweites Stück Linie (zwei Pfade im Kreisverkehr)
  return <AnimatedPath d={s.d} stroke={color} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={[len + 2, 1000]} animatedProps={props} />;
}

/** Spitze: füllt sich ganz und auf einmal, sobald die Linie ihre Basis erreicht (kein dünner Strich in der Spitze). */
function DrawnHead({ d, color, p, at }: { d: string; color: string; p: SharedValue<number>; at: number }) {
  const props = useAnimatedProps(() => {
    const o = interpolate(p.value, [at - 0.015, at + 0.025], [0, 1], 'clamp');
    return { fillOpacity: o, strokeOpacity: o };
  });
  return <AnimatedPath d={d} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" animatedProps={props} />;
}

/** Manöver Symbol; im Kreisverkehr mit der Ausfahrt Nummer. */
export function ManeuverIcon({ kind, exit, turn, size = 64, color = Colors.text, soon = false }: { kind: ManeuverKind; exit?: number; turn?: number | null; size?: number; color?: string; soon?: boolean }) {
  return <NavSymbolIcon symbol={symbolFor(kind, exit, turn)} size={size} color={color} soon={soon} />;
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
