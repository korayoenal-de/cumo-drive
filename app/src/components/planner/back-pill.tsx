/**
 * Zurück Pille oben links über der Karte (Koray 10.11., Muster Instagram): erscheint, solange die Tour
 * aus einem anderen Bereich geöffnet ist, und führt dorthin zurück. Rechts bleiben die Karteneinstellungen.
 */
import { SymbolView } from 'expo-symbols';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Shadow, Spacing } from '@/constants/theme';

/** Höhe der Pille, damit Plaketten darunter Platz finden */
export const BACK_PILL_H = 44;

export function BackPill({ label, top, onPress }: { label: string; top: number; onPress: () => void }) {
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }));
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.wrap, { top }, anim]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Zurück zu ${label}`}
        hitSlop={4}
        onPress={onPress}
        onPressIn={() => press.set(withSpring(Motion.pressScale, Motion.press))}
        onPressOut={() => press.set(withSpring(1, Motion.press))}
        style={styles.pill}>
        <SymbolView name="chevron.left" size={15} weight="bold" tintColor="#FFFFFF" />
        <AppText style={styles.text} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/** Breite der Randgeste für Zurück (pt) */
const EDGE_W = 24;

/**
 * Wischen vom linken Rand führt zurück (wie iOS und Instagram). Die Geste beginnt nur in den ersten 24 pt,
 * Karte und Blatt bleiben sonst ungestört. Der Inhalt folgt dem Finger; nach einem Drittel der Breite oder
 * mit Schwung ruft sie onBack, sonst federt er zurück. x gehört dem Aufrufer, der den Inhalt hinausgleiten lässt.
 */
export function EdgeSwipeBack({ enabled, x, onBack, children }: { enabled: boolean; x: SharedValue<number>; onBack: () => void; children: ReactNode }) {
  const win = useWindowDimensions();
  const edge = Gesture.Pan()
    .enabled(enabled)
    .hitSlop({ left: 0, width: EDGE_W })
    .activeOffsetX(12)
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      x.set(Math.max(0, e.translationX));
    })
    .onEnd((e) => {
      if (x.get() > win.width / 3 || (e.velocityX > 800 && x.get() > 24)) scheduleOnRN(onBack);
      else x.set(withSpring(0, Motion.snap));
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View style={styles.ground}>
      <GestureDetector gesture={edge}>
        <Animated.View style={[styles.flex, style]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1, backgroundColor: Colors.ground },
  flex: { flex: 1 },
  wrap: { position: 'absolute', left: Spacing.l, borderRadius: BACK_PILL_H / 2, boxShadow: Shadow.float },
  pill: {
    height: BACK_PILL_H,
    borderRadius: BACK_PILL_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s - 2,
    paddingLeft: Spacing.m,
    paddingRight: Spacing.l,
    backgroundColor: 'rgba(11,11,12,0.86)',
  },
  text: { fontFamily: Fonts.bold, fontSize: 16, color: '#FFFFFF' },
});
