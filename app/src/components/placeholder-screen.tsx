import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';

export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <Screen>
      <AppText variant="display">{title}</AppText>
      <View style={styles.card}>
        <AppText muted>{note}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
});
