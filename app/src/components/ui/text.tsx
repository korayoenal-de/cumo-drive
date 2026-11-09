/**
 * AppText: der einzige Textbaustein der App. Varianten (display, title, body, label, caption, number) setzen Schrift, Größe und Farbe aus den Tokens.
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts, Leading, Type } from '@/constants/theme';

type Variant = 'display' | 'title' | 'body' | 'label' | 'caption' | 'number';

export function AppText({
  variant = 'body',
  muted = false,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean }) {
  return <Text style={[styles.base, styles[variant], muted && styles.muted, style]} {...rest} />;
}

// Skala vom 9.11.: display Archivo 34/36, title Inter Bold 17/22, body Inter Semibold 15/20,
// label Abschnittstitel Inter Bold 17, caption 13/16 nur Karte und Plaketten, number Kennzahl Archivo 22
const styles = StyleSheet.create({
  base: { color: Colors.text, fontFamily: Fonts.semibold, fontSize: Type.body, lineHeight: Leading.body },
  display: { fontFamily: Fonts.display, fontSize: Type.display, lineHeight: Leading.display, textTransform: 'uppercase' },
  title: { fontFamily: Fonts.bold, fontSize: Type.title, lineHeight: Leading.title },
  body: { fontFamily: Fonts.semibold, fontSize: Type.body, lineHeight: Leading.body },
  label: { fontFamily: Fonts.bold, fontSize: Type.title, lineHeight: Leading.title, color: Colors.text },
  caption: { fontFamily: Fonts.semibold, fontSize: Type.caption, lineHeight: Leading.caption },
  number: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  muted: { color: Colors.muted },
});
