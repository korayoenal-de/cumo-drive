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
  label: {
    fontFamily: Fonts.semibold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.muted,
  },
  caption: { fontFamily: Fonts.regular, fontSize: 13 },
  number: { fontFamily: Fonts.displayBold, fontSize: 17, fontVariant: ['tabular-nums'] },
  muted: { color: Colors.muted },
});
