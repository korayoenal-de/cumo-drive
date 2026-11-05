/**
 * AppText: der einzige Textbaustein der App. Varianten (display, title, body, label, caption, number) setzen Schrift, Größe und Farbe aus den Tokens.
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts, Type } from '@/constants/theme';

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
  base: { color: Colors.text, fontFamily: Fonts.regular, fontSize: Type.input },
  display: { fontFamily: Fonts.display, fontSize: 38, lineHeight: 38, textTransform: 'uppercase' },
  title: { fontFamily: Fonts.semibold, fontSize: Type.input },
  body: { fontFamily: Fonts.regular, fontSize: Type.input },
  // Abschnittstitel: normal geschrieben, fett (Mittelweg: Versalien nur für Tournamen und Kennzahlen)
  label: { fontFamily: Fonts.bold, fontSize: Type.button, letterSpacing: -0.2, color: Colors.text },
  caption: { fontFamily: Fonts.regular, fontSize: Type.caption },
  number: { fontFamily: Fonts.display, fontSize: Type.title, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  muted: { color: Colors.muted },
});
