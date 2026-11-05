/**
 * Abschnitt "Mitgliedschaft" für die Einstellungen: aktueller Stand und der Weg zur Paywall.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { formatUntil, PRICES, refreshEntitlement, useEntitlement, type Entitlement } from '@/lib/entitlement';

import { TrialBadge } from './entitlement-gate';

function describe(e: Entitlement): { title: string; text: string } {
  const until = formatUntil(e.until);
  if (!e.active) {
    return {
      title: e.source === 'plan' ? 'Plan abgelaufen' : 'Testphase vorbei',
      text: until ? `Abgelaufen am ${until}. Wähle einen Plan, um weiterzufahren.` : 'Wähle einen Plan, um weiterzufahren.',
    };
  }
  if (e.source === 'club') {
    return { title: e.clubName ?? 'Club', text: `Über deinen Club, gültig bis ${until}. Gruppen bis ${e.maxVehicles} Fahrzeuge.` };
  }
  if (e.source === 'plan') {
    return { title: 'Plan aktiv', text: `Gültig bis ${until}.` };
  }
  return {
    title: 'Testphase',
    text: `Alles frei bis ${until}. Danach ab ${PRICES[0].perMonthText ?? PRICES[0].priceText} weiter.`,
  };
}

export function MembershipSection() {
  const e = useEntitlement();
  useFocusEffect(
    useCallback(() => {
      void refreshEntitlement();
    }, []),
  );
  const d = describe(e);
  return (
    <View style={styles.gapM}>
      <AppText variant="label">Mitgliedschaft</AppText>
      <View style={styles.card}>
        {e.loading ? (
          <ActivityIndicator color={Colors.muted} />
        ) : (
          <View style={styles.gapS}>
            <View style={styles.row}>
              <AppText style={[styles.title, styles.flex]} numberOfLines={1}>
                {d.title}
              </AppText>
              <TrialBadge />
            </View>
            <AppText muted>{d.text}</AppText>
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={() => router.push('/mitgliedschaft')} style={styles.secondary}>
          <AppText style={styles.secondaryText}>Mitgliedschaft ansehen</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapS: { gap: Spacing.xs },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  title: { fontFamily: Fonts.semibold, fontSize: Type.title },
  secondary: { height: 48, borderRadius: 24, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
});
