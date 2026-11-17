/**
 * Abschnitt "Mitgliedschaft" für die Einstellungen: aktueller Stand und der Weg zur Paywall.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { formatUntil, PRICES, refreshEntitlement, useEntitlement, type Entitlement } from '@/lib/entitlement';

import { limitsLive } from '@/lib/paywall';

import { TrialBadge } from './entitlement-gate';
import { t } from '@/i18n';

export function describeEntitlement(e: Entitlement): { title: string; text: string } {
  const until = formatUntil(e.until);
  if (!e.active) {
    return {
      title: e.source === 'plan' ? t('Plan abgelaufen') : e.source === 'gruender' ? t('Gründungszeit vorbei') : t('Testphase vorbei'),
      text: limitsLive()
        ? t('Du fährst kostenlos in deinem Heimatgebiet weiter. Mit einem Plan geht alles, überall.')
        : until
          ? t('Abgelaufen am {until}. Wähle einen Plan, um weiterzufahren.', { until })
          : t('Wähle einen Plan, um weiterzufahren.'),
    };
  }
  if (e.source === 'club') {
    return { title: e.clubName ?? t('Club'), text: t('Über deinen Club, gültig bis {until}. Gruppen bis {maxVehicles} Fahrzeuge.', { until, maxVehicles: e.maxVehicles }) };
  }
  if (e.source === 'plan') {
    return { title: t('Plan aktiv'), text: t('Gültig bis {until}.', { until }) };
  }
  if (e.source === 'vorstart') {
    return { title: t('Testphase'), text: t('Bis zum Start ist alles frei. Danach fährst du als Gründungstester 12 Monate kostenlos.') };
  }
  if (e.source === 'gruender') {
    return { title: t('Gründungstester'), text: t('Danke fürs Mittesten. Alles frei bis {until}.', { until }) };
  }
  return {
    title: t('Testphase'),
    text: t('Alles frei bis {until}. Danach ab {v1} weiter.', { until, v1: PRICES[0].perMonthText ?? PRICES[0].priceText }),
  };
}

export function MembershipSection() {
  const e = useEntitlement();
  useFocusEffect(
    useCallback(() => {
      void refreshEntitlement();
    }, []),
  );
  const d = describeEntitlement(e);
  return (
    <View style={styles.gapM}>
      <AppText variant="label">{t('Mitgliedschaft')}</AppText>
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
          <AppText style={styles.secondaryText}>{t('Mitgliedschaft ansehen')}</AppText>
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
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
});
