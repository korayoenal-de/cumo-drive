/**
 * Runder Plus Knopf für Listen, in denen man etwas hinzufügt, zum Beispiel Kontakte zur Gruppenfahrt einladen
 * (Koray 17.11.: eine Reihe oranger Einladen Knöpfe war zu laut; Orange bleibt der Hauptaktion vorbehalten).
 * Ruhige Fläche wie der Entfernen Knopf daneben, 44 pt, nach dem Hinzufügen ein grüner Haken.
 */
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size } from '@/constants/theme';

export function AddButton({ label, onPress, busy, done, disabled }: { label: string; onPress: () => void; busy?: boolean; done?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!done, busy: !!busy }}
      hitSlop={8}
      disabled={disabled || done || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, done && styles.done, pressed && styles.pressed, disabled && !done && styles.off]}>
      {busy ? (
        <ActivityIndicator color={Colors.muted} />
      ) : (
        <SymbolView
          name={done ? 'checkmark' : 'plus'}
          size={18}
          weight="bold"
          tintColor={done ? Colors.good : Colors.text}
          fallback={<AppText style={[styles.glyph, done && styles.glyphDone]}>{done ? '✓' : '+'}</AppText>}
        />
      )}
    </Pressable>
  );
}

/**
 * Runder Entfernen Knopf, Gegenstück zum Plus (Koray 17.11.: das Kreuz als Schriftzeichen war zu dünn, die Symbole
 * sollen einheitlich sein). Gleiche Fläche, gleiches Symbol Gewicht wie das Plus, nur in Grau.
 */
export function RemoveButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      hitSlop={8}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, disabled && styles.off]}>
      {busy ? (
        <ActivityIndicator color={Colors.muted} />
      ) : (
        <SymbolView name="xmark" size={16} weight="bold" tintColor={Colors.muted} fallback={<AppText style={[styles.glyph, styles.glyphMuted]}>✕</AppText>} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: Colors.goodTint },
  pressed: { opacity: 0.7 },
  off: { opacity: 0.4 },
  glyph: { fontFamily: Fonts.bold, fontSize: 22, lineHeight: 24, color: Colors.text },
  glyphDone: { color: Colors.good },
  glyphMuted: { color: Colors.muted, fontSize: 18 },
});
