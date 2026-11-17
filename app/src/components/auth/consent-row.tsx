/**
 * Einwilligung bei der Registrierung (Koray 17.11.: Opt in). Eine Zeile zum Antippen mit Kästchen, Pflicht oder
 * freiwillig. Die ganze Zeile ist die Trefferfläche (ab 44 pt), VoiceOver liest sie als Kästchen mit Zustand.
 */
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { t } from '@/i18n';

export function ConsentRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      onPress={() => onChange(!checked)}
      style={styles.row}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <AppText style={styles.tick}>✓</AppText> : null}</View>
      <View style={styles.text}>
        <AppText style={styles.title}>{title}</AppText>
        {hint ? <AppText style={styles.hint}>{hint}</AppText> : null}
      </View>
    </Pressable>
  );
}

/** Nutzungsbedingungen und Datenschutz zum Nachlesen, ohne das Formular zu verlassen */
export function LegalLinks() {
  const open = (path: 'agb' | 'datenschutz') => void WebBrowser.openBrowserAsync(`https://cumodrive.de/${path}`);
  return (
    <View style={styles.links}>
      <Pressable accessibilityRole="link" onPress={() => open('agb')} style={styles.link} hitSlop={8}>
        <AppText style={styles.linkText}>{t('Nutzungsbedingungen')}</AppText>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => open('datenschutz')} style={styles.link} hitSlop={8}>
        <AppText style={styles.linkText}>{t('Datenschutz')}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m, minHeight: 44, paddingVertical: Spacing.xs },
  box: { width: 24, height: 24, marginTop: 1, borderRadius: 7, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.signal },
  tick: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 15, lineHeight: 18 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  hint: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  links: { flexDirection: 'row', gap: Spacing.l, paddingLeft: 24 + Spacing.m },
  link: { minHeight: 32, justifyContent: 'center' },
  linkText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text, textDecorationLine: 'underline' },
});
