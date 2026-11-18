/**
 * Toast: schwebende Pille über der Tab Leiste, verschwindet von selbst.
 * Einmal im Wurzel Layout eingebunden; auslösen mit showToast aus lib/toast.ts.
 */
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { softEnter } from '@/components/ui/motion';
import { TAB_BAR_SPACE } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Shadow, Spacing, Type } from '@/constants/theme';
import { useFlights } from '@/lib/fly';
import { hideToast, holdToast, setToastPlace, useToast, useToastPlace, type ToastPlace } from '@/lib/toast';
import { tr } from '@/i18n';

/**
 * Einmal im Wurzel Layout und zusätzlich in jedem modalen Bildschirm (Navigation, Ausfahrt anlegen, Mitgliedschaft,
 * Scan, Karte): modale Bildschirme liegen über dem Wurzel Layout, dort war der Toast sonst nicht zu sehen (Audit 18.11.).
 */
export function ToastHost({ place: fixed }: { place?: ToastPlace } = {}) {
  const t = useToast();
  const stored = useToastPlace();
  const place = fixed ?? stored;
  const flying = useFlights().length > 0;
  const insets = useSafeAreaInsets();
  useEffect(() => {
    holdToast(flying);
  }, [flying]);
  // Fliegt ein Symbol ins Ziel, wartet der Toast: nie zwei Signale zugleich
  if (!t || flying) return null;
  const error = t.tone === 'error';
  const pos = place ? ('top' in place ? { top: place.top } : { bottom: insets.bottom + place.bottom }) : { bottom: insets.bottom + TAB_BAR_SPACE };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, pos]}>
      <Animated.View
        key={t.id}
        entering={softEnter()}
        exiting={FadeOutDown.duration(Motion.exit)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.toast}>
        <SymbolView weight="semibold" name={error ? 'exclamationmark.circle.fill' : 'checkmark.circle.fill'} size={20} tintColor={error ? Colors.danger : Colors.good} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr('{text}, schließen', { text: t.text })} onPress={hideToast} flat style={styles.flex}>
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

/** Seite mit fester Hauptaktion unten: der Toast steht darüber, solange die Seite vorn ist (px über dem sicheren Rand) */
export function useToastAbove(bottom: number) {
  useFocusEffect(
    useCallback(() => {
      setToastPlace({ bottom });
      return () => setToastPlace(null);
    }, [bottom]),
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
