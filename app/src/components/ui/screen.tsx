/**
 * Grundgerüst einer scrollbaren Seite: dunkler Grund, sichere Ränder, meldet das Scrollen an die Tableiste (schrumpft beim Runterscrollen).
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { reportScroll } from '@/lib/tab-bar';

/** Höhe der schwebenden Tab Leiste, dazu kommt die Safe Area unten. */
export const TAB_BAR_SPACE = 90;

export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView onScroll={(e) => reportScroll(e.nativeEvent.contentOffset.y)} scrollEventThrottle={32} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + TAB_BAR_SPACE + Spacing.xl }]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.ground },
  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, gap: Spacing.xxl },
});
