/**
 * Chip: kleine Auswahltaste als Pille, aktiv in Signal Orange getönt.
 */
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';

/** onSurface: der Chip liegt auf einer Surface Karte und bekommt deshalb die hellere Füllung. */
export function Chip({
  label, active, onPress, onSurface,
}: { label: string; active: boolean; onPress: () => void; onSurface?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      // gedrückt wie alle Tasten (Regel Druck), die Auswahl selbst wechselt ohne Bewegung
      style={({ pressed }) => [styles.chip, active ? styles.on : onSurface ? styles.offOnSurface : styles.off, pressed && styles.pressed]}>
      <AppText style={[styles.label, active && styles.labelOn]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, justifyContent: 'center' },
  // Aktiv weiß wie die Reiter der Suche; Orange bleibt der Hauptaktion vorbehalten (Koray 9.11.)
  on: { backgroundColor: Colors.text },
  off: { backgroundColor: Colors.surface },
  offOnSurface: { backgroundColor: Colors.surface2 },
  pressed: { transform: [{ scale: Motion.pressScale }], opacity: 0.85 },
  label: { fontSize: Type.body, fontFamily: Fonts.semibold },
  labelOn: { color: Colors.ground, fontFamily: Fonts.bold },
});
