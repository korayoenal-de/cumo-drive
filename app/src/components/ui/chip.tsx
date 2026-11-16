/**
 * Chip: kleine Auswahltaste als Pille, aktiv in Signal Orange getönt.
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

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

/**
 * Reihe von Auswahl Chips, die seitlich wischt statt umzubrechen (Koray 15.11., W3). Läuft bis an den Rand
 * der Fläche: bleed ist der Innenabstand des Containers (Blatt Spacing.xl, Karte Spacing.l).
 * Gründe zum Ankreuzen in Bewertungen und Meldungen bleiben umgebrochen, dort soll man alles sehen.
 */
export function ChipRow({ children, bleed = Spacing.xl }: { children: ReactNode; bleed?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -bleed, flexGrow: 0 }}
      contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.s },
  chip: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, justifyContent: 'center' },
  // Aktiv weiß wie die Reiter der Suche; Orange bleibt der Hauptaktion vorbehalten (Koray 9.11.)
  on: { backgroundColor: Colors.text },
  off: { backgroundColor: Colors.surface },
  offOnSurface: { backgroundColor: Colors.surface2 },
  pressed: { transform: [{ scale: Motion.pressScale }], opacity: 0.85 },
  label: { fontSize: Type.body, fontFamily: Fonts.semibold },
  labelOn: { color: Colors.ground, fontFamily: Fonts.bold },
});
