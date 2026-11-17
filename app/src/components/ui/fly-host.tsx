/**
 * Zeichnet die fliegenden Symbole (lib/fly.ts) über allem, im Wurzel Layout. Der Kreis startet dort, wo die Taste
 * zusammengeschrumpft ist, fliegt auf einem Bogen ins Ziel, verliert unterwegs seinen Grund und landet als Symbol
 * in Größe des Tab Symbols. Bei der Landung: Haptik ziel und die Plakette am Tab.
 * Mit „Bewegung reduzieren“ kein Flug, nur die Plakette.
 */
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BtnIconView } from '@/components/ui/btn-icon';
import { haptic } from '@/lib/haptics';
import { TAB_X, TAB_Y_ABOVE_INSET, landed, useFlights, type Flight } from '@/lib/fly';

/** Dauer des Flugs (ms) und die Kurve (langsam los, weich hinein, wie im Prototyp) */
export const FLY_MS = 460;
const FLY_EASE = Easing.bezier(0.5, 0, 0.2, 1);

export function FlyHost() {
  const flights = useFlights();
  if (!flights.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {flights.map((f) => (
        <Flyer key={f.id} f={f} />
      ))}
    </View>
  );
}

function Flyer({ f }: { f: Flight }) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const to = typeof f.target === 'string' ? { x: win.width * TAB_X[f.target], y: win.height - insets.bottom - TAB_Y_ABOVE_INSET } : f.target;
  // Kontrollpunkt: erst etwas hoch und zur Seite, dann hinein (Bogen statt Linie)
  const c = { x: f.from.x * 0.3 + to.x * 0.7, y: Math.min(f.from.y, to.y) - 60 };
  const p = useSharedValue(0);
  const out = useSharedValue(1);
  const done = () => landed(f.id);
  useEffect(() => {
    if (reduced) {
      done();
      return;
    }
    p.value = withTiming(1, { duration: FLY_MS, easing: FLY_EASE }, (ok) => {
      if (!ok) return;
      runOnJS(haptic)('ziel');
      out.value = withDelay(60, withTiming(0, { duration: 140 }, () => runOnJS(done)()));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const size = f.from.size;
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const x = (1 - t) * (1 - t) * f.from.x + 2 * (1 - t) * t * c.x + t * t * to.x;
    const y = (1 - t) * (1 - t) * f.from.y + 2 * (1 - t) * t * c.y + t * t * to.y;
    return {
      opacity: out.value,
      transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale: interpolate(t, [0, 0.7, 1], [1, 0.9, 1.1]) }],
    };
  });
  const bgStyle = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.6, 0.9], [1, 1, 0]) }));
  if (reduced) return null;
  return (
    <Animated.View style={[styles.flyer, { width: size, height: size }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: f.bg }, bgStyle]} />
      <BtnIconView icon={f.icon} color={f.fg} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flyer: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
});
