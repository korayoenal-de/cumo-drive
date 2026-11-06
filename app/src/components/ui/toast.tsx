/**
 * Toast: schwebende Pille über der Tab Leiste, verschwindet von selbst.
 * Einmal im Wurzel Layout eingebunden; auslösen mit showToast aus lib/toast.ts.
 */
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_SPACE } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { hideToast, useToast } from '@/lib/toast';

export function ToastHost() {
  const t = useToast();
  const insets = useSafeAreaInsets();
  if (!t) return null;
  const error = t.tone === 'error';
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_SPACE }]}>
      <Animated.View
        key={t.id}
        entering={FadeInDown.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)}
        exiting={FadeOutDown.duration(160)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.toast}>
        <SymbolView name={error ? 'exclamationmark.circle.fill' : 'checkmark.circle.fill'} size={20} tintColor={error ? Colors.signal : Colors.good} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${t.text}, schließen`} onPress={hideToast} style={styles.flex}>
          <AppText style={styles.text} numberOfLines={2}>
            {t.text}
          </AppText>
        </Pressable>
        {t.action && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              hideToast();
              t.action!.onPress();
            }}
            hitSlop={8}>
            <AppText style={styles.action}>{t.action.label}</AppText>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { position: 'absolute', left: Spacing.l, right: Spacing.l, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    minHeight: 52,
    maxWidth: 520,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.l,
    paddingVertical: Spacing.s,
    borderRadius: Radius.pill,
    backgroundColor: Colors.overlaySurface,
    boxShadow: Shadow.float,
  },
  text: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  action: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
});
