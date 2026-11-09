/**
 * Sonderfarbe als letztes Feld der Farbwahl (Koray 9.11.): eigenes Symbol, Tippen öffnet ein Blatt für den
 * Hexwert, etwa #8A9A5B. Mit Vorschau und Prüfung; ist eine Sonderfarbe gewählt, zeigt das Feld sie an.
 */
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OptionsSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';

/** #RGB oder #RRGGBB, mit oder ohne Raute; zurück als #RRGGBB in Großbuchstaben oder null */
export function normHex(raw: string): string | null {
  const t = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(t)) return `#${t.split('').map((c) => c + c).join('')}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`.toUpperCase();
  return null;
}

export function CustomColorButton({ value, custom, onPick }: { value: string; custom: boolean; onPick: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(custom ? value : '');
  const hex = normHex(text);
  const pick = () => {
    if (!hex) return;
    onPick(hex);
    setOpen(false);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={custom ? `Sonderfarbe ${value}, ändern` : 'Sonderfarbe eingeben'}
        accessibilityState={{ selected: custom }}
        onPress={() => {
          setText(custom ? value : '');
          setOpen(true);
        }}
        style={[styles.ring, custom && styles.ringOn]}>
        <View style={[styles.dot, custom ? { backgroundColor: value } : styles.dotEmpty]}>
          <SymbolView name={custom ? 'pencil' : 'eyedropper'} size={15} tintColor={custom ? Colors.ground : Colors.text} weight="semibold" />
        </View>
      </Pressable>
      <OptionsSheet visible={open} title="Sonderfarbe" subtitle="Hexwert deiner Lackfarbe, etwa #8A9A5B" onClose={() => setOpen(false)}>
        <View style={styles.body}>
          <View style={styles.row}>
            <View style={[styles.preview, { backgroundColor: hex ?? Colors.surface2 }]} />
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              returnKeyType="done"
              onSubmitEditing={pick}
              placeholder="#RRGGBB"
              placeholderTextColor={Colors.muted}
              style={[styles.input, styles.flex]}
              accessibilityLabel="Hexwert der Farbe"
            />
          </View>
          {!!text && !hex && <AppText variant="caption" muted>Sechs Zeichen aus 0 bis 9 und A bis F, etwa #8A9A5B</AppText>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !hex }} onPress={pick} style={({ pressed }) => [styles.primary, !hex && styles.disabled, pressed && hex && styles.pressed]}>
            <AppText style={[styles.primaryText, !hex && styles.disabledText]}>Farbe übernehmen</AppText>
          </Pressable>
        </View>
      </OptionsSheet>
    </>
  );
}

const styles = StyleSheet.create({
  ring: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: Colors.text },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  dotEmpty: { backgroundColor: Colors.surface2, borderStyle: 'dashed', borderWidth: 1.5, borderColor: Colors.muted },
  body: { gap: Spacing.m, paddingHorizontal: Spacing.s, paddingTop: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  flex: { flex: 1 },
  preview: { width: Size.input, height: Size.input, borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  input: { height: Size.input, borderRadius: Radius.m, backgroundColor: Colors.surface2, color: Colors.text, paddingHorizontal: Spacing.l, fontFamily: Fonts.semibold, fontSize: Type.input, fontVariant: ['tabular-nums'] },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  disabled: { backgroundColor: Colors.surface2 },
  disabledText: { color: Colors.muted },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
