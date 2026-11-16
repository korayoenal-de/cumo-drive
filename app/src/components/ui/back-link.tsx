/**
 * Zurück als Pille mit Herkunft (Regel 10.11., Konsistenzprüfung 15.11. O6, I4): überall gleich, Pfeil 16
 * semibold, Inter Bold 15 auf surface, 44 hoch. Ohne bekannte Herkunft heißt sie „Zurück“.
 */
import { router, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Type } from '@/constants/theme';
import { t } from '@/i18n';

export function BackLink({ label = t('Zurück'), fallback = '/', onPress }: { label?: string; fallback?: Href; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === 'Zurück' || label === t('Zurück') ? t('Zurück') : t('Zurück zu {label}', { label: t(label) })}
      hitSlop={4}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.navigate(fallback)))}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
      <SymbolView name="chevron.left" size={16} weight="semibold" tintColor={Colors.text} />
      <AppText style={styles.text} numberOfLines={1}>
        {t(label)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22, backgroundColor: Colors.surface, flexShrink: 0 },
  pressed: { opacity: 0.85 },
  text: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
});
