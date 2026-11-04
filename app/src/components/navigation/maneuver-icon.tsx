/**
 * Navigationssymbole aus maneuver-geometry.ts (gleiche Formen wie im Design System).
 * Mit soon stupst das Symbol in Fahrtrichtung an, damit klar ist: gleich ist es so weit.
 */
import { useEffect } from 'react';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { ReactNode } from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import type { ManeuverKind } from '@/lib/navigation/types';

import { symbolFor, symbolGeometry, type NavSymbol, type Paint } from './maneuver-geometry';

export function NavSymbolIcon({ symbol, size = 64, color = Colors.text, ground = Colors.ground, soon = false }: { symbol: NavSymbol; size?: number; color?: string; ground?: string; soon?: boolean }) {
  const g = symbolGeometry(symbol);
  const paint: Record<Paint, string> = { ink: color, faint: color, ground, signal: Colors.signal };
  const body = g.shapes.map((s, i) =>
    s.t === 'stroke' ? (
      <Path key={i} d={s.d} stroke={paint[s.paint]} strokeOpacity={s.paint === 'faint' ? 0.35 : 1} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ) : (
      <Path
        key={i}
        d={s.d}
        fill={paint[s.paint]}
        fillOpacity={s.paint === 'faint' ? 0.35 : 1}
        fillRule={s.evenodd ? 'evenodd' : 'nonzero'}
        {...(s.round ? { stroke: paint[s.paint], strokeWidth: 2, strokeLinejoin: 'round' as const } : {})}
      />
    ),
  );
  return (
    <Soon active={soon} nudge={g.nudge} size={size}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {g.mirror ? <G transform="matrix(-1 0 0 1 64 0)">{body}</G> : body}
      </Svg>
    </Soon>
  );
}

/** Manöver Symbol; im Kreisverkehr mit der Ausfahrt Nummer. */
export function ManeuverIcon({ kind, exit, size = 64, color = Colors.text, soon = false }: { kind: ManeuverKind; exit?: number; size?: number; color?: string; soon?: boolean }) {
  return <NavSymbolIcon symbol={symbolFor(kind, exit)} size={size} color={color} soon={soon} />;
}

/**
 * Anstupsen: kurz in Fahrtrichtung vor und zurück, dazu leicht größer. Symbole ohne Richtung pulsieren nur.
 * Bei „Bewegung reduzieren“ bleibt es bei einem sanften Pulsieren der Deckkraft.
 */
function Soon({ active, nudge, size, children }: { active: boolean; nudge: { x: number; y: number } | null; size: number; children: ReactNode }) {
  const t = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      t.value = withTiming(0, { duration: 150 });
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.Never }),
      ),
      -1,
    );
    return () => cancelAnimation(t);
  }, [active, t]);
  const dist = (size / 64) * 6;
  const style = useAnimatedStyle(() => {
    if (reduce) return { opacity: 1 - t.value * 0.35 };
    return {
      transform: [
        { translateX: (nudge?.x ?? 0) * dist * t.value },
        { translateY: (nudge?.y ?? 0) * dist * t.value },
        { scale: 1 + t.value * (nudge ? 0.04 : 0.1) },
      ],
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
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
