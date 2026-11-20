/**
 * Eingabefeld (Regel Eingaben, Koray 18.11.2026, docs/design-prinzipien.md):
 * - Form: Radius 14, mindestens 52 hoch; mehrzeilig wächst es nach unten mit demselben Radius.
 *   Einzige Ausnahme: die Nachrichtenleiste im Chat (pill), rund wie ihre Sendetaste.
 * - Fokus: 2 pt Rand in Signal Orange, solange du darin schreibst (überall gleich, wie in der Ortssuche).
 *   Der Rand ist immer da und nur durchsichtig, damit nichts springt.
 * - Fläche: surface auf dem Grund, surface2 auf einer Karte (onSurface).
 * - Schrift: Inter Semibold in Eingabegröße, Platzhalter grau.
 * style darf Layout ergänzen (flex, minHeight); Form, Schrift und Rand setzt der Baustein.
 */
import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';

export type TextFieldProps = TextInputProps & { onSurface?: boolean; pill?: boolean };

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField({ onSurface, pill, style, onFocus, onBlur, multiline, placeholderTextColor, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      maxFontSizeMultiplier={1.2}
      {...rest}
      multiline={multiline}
      placeholderTextColor={placeholderTextColor ?? Colors.muted}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.base,
        onSurface && styles.onSurface,
        multiline && styles.multi,
        style,
        styles.enforced,
        pill && styles.pill,
        focused && styles.focused,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  base: { minHeight: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, color: Colors.text, fontSize: Type.input },
  onSurface: { backgroundColor: Colors.surface2 },
  multi: { paddingTop: Spacing.m, paddingBottom: Spacing.m, textAlignVertical: 'top' },
  enforced: { borderRadius: Radius.m, borderWidth: 2, borderColor: 'transparent', fontFamily: Fonts.semibold },
  // Rund nur, solange das Feld einzeilig ist: fester Radius der halben Mindesthöhe. Mit Radius.pill wurde eine
  // mehrzeilige Nachricht zur Ellipse, oben und unten war Text abgeschnitten (Koray 20.11.2026, Chat der Ausfahrt)
  pill: { borderRadius: Size.input / 2 },
  focused: { borderColor: Colors.signal },
});
