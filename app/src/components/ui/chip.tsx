import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius } from '@/constants/theme';

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.on : styles.off]}>
      <AppText style={[styles.label, active && styles.labelOn]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: 16, borderRadius: Radius.pill, justifyContent: 'center' },
  on: { backgroundColor: Colors.signal },
  off: { borderWidth: 1, borderColor: Colors.line },
  label: { fontSize: 14, fontFamily: Fonts.medium },
  labelOn: { color: Colors.onSignal, fontFamily: Fonts.bold },
});
