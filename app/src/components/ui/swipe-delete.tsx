/**
 * Rote Löschtaste hinter einer Karte, sichtbar beim Wischen von rechts nach links (Planer 13.11., gefahrene
 * Touren 15.11.). Im Ruhezustand unsichtbar, sonst schimmert sie an den runden Ecken durch. Endgültiges ist rot
 * (Konsistenzprüfung 15.11.); Tippen fragt noch einmal nach.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { StyleSheet } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Type, Pressed } from '@/constants/theme';
import { t } from '@/i18n';

/** word und icon: andere endgültige Aktion als Löschen, etwa Absagen oder Austragen bei Ausfahrten (20.11.2026) */
export function SwipeDelete({ progress, label, onPress, radius = Radius.l, word, icon = 'trash.fill' }: { progress: SharedValue<number>; label: string; onPress: () => void; radius?: number; word?: string; icon?: SFSymbol }) {
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [0, 0.2], [0, 1], 'clamp') }));
  return (
    <Animated.View style={[styles.wrap, fade]}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.btn, { borderRadius: radius - 2 }, pressed && styles.pressed]}>
        <SymbolView name={icon} size={20} tintColor={Colors.text} weight="semibold" />
        <AppText style={styles.text}>{word ?? t('Löschen')}</AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 2, paddingLeft: 8, paddingRight: 2 },
  btn: { flex: 1, width: 94, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', gap: 2 },
  text: { fontFamily: Fonts.bold, fontSize: Type.small, color: Colors.text },
  pressed: Pressed,
});
