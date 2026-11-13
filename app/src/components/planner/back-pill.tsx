/**
 * Zurück Pille oben links über der Karte (Koray 10.11., Muster Instagram): erscheint, solange die Tour
 * aus einem anderen Bereich geöffnet ist, und führt dorthin zurück. Rechts bleiben die Karteneinstellungen.
 *
 * Seit 11.11. auch die Statusanzeige für Änderungen auf der Karte (Punkte ziehen): Dort hat man den Blick,
 * also verwandelt sich die Pille weich in „Strecke wird angepasst“ mit Ladebalken, danach kurz in das
 * Ergebnis mit Rückgängig, und dann zurück. Ohne Herkunft erscheint sie nur für diese Zeit.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Shadow, Spacing } from '@/constants/theme';

/** Höhe der Pille, damit Plaketten darunter Platz finden */
export const BACK_PILL_H = 44;

export type PillStatus =
  | { kind: 'busy'; text: string }
  | { kind: 'done'; text: string; tone?: 'warn'; onUndo: () => void };

export function BackPill({ label, top, onPress, status }: { label?: string | null; top: number; onPress?: () => void; status?: PillStatus | null }) {
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }));
  const win = useWindowDimensions();
  const mode = status?.kind ?? (label ? 'back' : null);
  if (!mode) return null;
  const pressIn = () => press.set(withSpring(Motion.pressScale, Motion.press));
  const pressOut = () => press.set(withSpring(1, Motion.press));
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      // Breite wächst und schrumpft mit Feder, der Inhalt blendet über
      layout={LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)}
      style={[styles.wrap, { top, maxWidth: win.width - Spacing.l - 76 }, anim]}>
      {mode === 'back' && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Zurück zu ${label}`} hitSlop={4} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={styles.pill}>
          <Animated.View key="back" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.row}>
            <SymbolView name="chevron.left" size={15} weight="bold" tintColor="#FFFFFF" />
            <AppText style={styles.text} numberOfLines={1}>
              {label}
            </AppText>
          </Animated.View>
        </Pressable>
      )}
      {status?.kind === 'busy' && (
        <View accessibilityLiveRegion="polite" accessibilityLabel={status.text} style={styles.pill}>
          <Animated.View key="busy" entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.row}>
            <PulseDot />
            <AppText style={styles.text} numberOfLines={1}>
              {status.text}
            </AppText>
          </Animated.View>
          <LoadBar />
        </View>
      )}
      {status?.kind === 'done' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status.text}. Rückgängig`}
          hitSlop={4}
          onPress={status.onUndo}
          onPressIn={pressIn}
          onPressOut={pressOut}
          style={styles.pill}>
          <Animated.View key={`done-${status.text}`} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.row}>
            <AppText style={[styles.text, styles.shrink, status.tone === 'warn' && styles.warn]} numberOfLines={1}>
              {status.text}
            </AppText>
            <View style={styles.sep} />
            <SymbolView name="arrow.uturn.backward" size={14} weight="bold" tintColor={Colors.signal} />
            <AppText style={[styles.text, styles.undo]}>Rückgängig</AppText>
          </Animated.View>
        </Pressable>
      )}
    </Animated.View>
  );
}

/** Ladebalken an der Unterkante der Pille: wächst gleichmäßig, wird nie ganz voll, bis die Strecke da ist */
function LoadBar() {
  const reduced = useReducedMotion();
  const w = useSharedValue(0.06);
  useEffect(() => {
    w.set(withTiming(0.92, { duration: reduced ? 0 : 7000, easing: Easing.out(Easing.cubic) }));
  }, [w, reduced]);
  const st = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={styles.track} pointerEvents="none">
      <Animated.View style={[styles.bar, st]} />
    </View>
  );
}

function PulseDot() {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.set(withRepeat(withSequence(withTiming(0.35, { duration: 520 }), withTiming(1, { duration: 520 })), -1));
  }, [o, reduced]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.dot, st]} />;
}

const styles = StyleSheet.create({
  // rechts bleibt Platz für die Karteneinstellungen (44 breit plus Rand): lange Texte kürzen statt darunter laufen
  wrap: { position: 'absolute', left: Spacing.l, borderRadius: BACK_PILL_H / 2, boxShadow: Shadow.button },
  pill: {
    height: BACK_PILL_H,
    borderRadius: BACK_PILL_H / 2,
    justifyContent: 'center',
    paddingLeft: Spacing.m,
    paddingRight: Spacing.l,
    backgroundColor: 'rgba(11,11,12,0.86)',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s - 2, maxWidth: '100%' },
  text: { fontFamily: Fonts.bold, fontSize: 16, color: '#FFFFFF' },
  warn: { color: Colors.warn },
  shrink: { flexShrink: 1 },
  undo: { color: Colors.signal },
  sep: { width: 1, height: 18, marginHorizontal: Spacing.xs, backgroundColor: 'rgba(255,255,255,0.18)' },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 3, backgroundColor: Colors.signal },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  bar: { height: 3, backgroundColor: Colors.signal },
});
