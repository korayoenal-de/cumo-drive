import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

type Variant = 'display' | 'title' | 'body' | 'label' | 'caption' | 'number';

export function AppText({
  variant = 'body',
  muted = false,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean }) {
  return <Text style={[styles.base, styles[variant], muted && styles.muted, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { color: Colors.text, fontFamily: Fonts.regular, fontSize: 16 },
  display: { fontFamily: Fonts.display, fontSize: 38, lineHeight: 38, textTransform: 'uppercase' },
  title: { fontFamily: Fonts.semibold, fontSize: 16 },
  body: { fontFamily: Fonts.regular, fontSize: 16 },
  // Abschnittstitel: normal geschrieben, fett (Mittelweg: Versalien nur für Tournamen und Kennzahlen)
  label: { fontFamily: Fonts.bold, fontSize: 18, letterSpacing: -0.2, color: Colors.text },
  caption: { fontFamily: Fonts.regular, fontSize: 13 },
  number: { fontFamily: Fonts.display, fontSize: 17, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  muted: { color: Colors.muted },
});
