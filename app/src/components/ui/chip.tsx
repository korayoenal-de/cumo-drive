/**
 * Chip: kleine Auswahltaste als Pille, aktiv in Signal Orange getönt.
 */
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';

/** onSurface: der Chip liegt auf einer Surface Karte und bekommt deshalb die hellere Füllung. */
export function Chip({
  label, active, onPress, onSurface,
}: { label: string; active: boolean; onPress: () => void; onSurface?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.on : onSurface ? styles.offOnSurface : styles.off]}>
      <AppText style={[styles.label, active && styles.labelOn]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, justifyContent: 'center' },
  on: { backgroundColor: Colors.signal },
  off: { backgroundColor: Colors.surface },
  offOnSurface: { backgroundColor: Colors.surface2 },
  label: { fontSize: Type.small, fontFamily: Fonts.medium },
  labelOn: { color: Colors.onSignal, fontFamily: Fonts.bold },
});
