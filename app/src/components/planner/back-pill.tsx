/**
 * Zurück Pille oben links über der Karte (Koray 10.11., Muster Instagram): erscheint, solange die Tour
 * aus einem anderen Bereich geöffnet ist, und führt dorthin zurück. Rechts bleiben die Karteneinstellungen.
 */
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Fonts, Motion, Shadow, Spacing } from '@/constants/theme';

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

const styles = StyleSheet.create({
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
