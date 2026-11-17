/**
 * Früher sperrte die App nach der Testphase ganz. Seit der kostenlosen Version (Koray 14.11.) bleibt sie offen,
 * die Grenzen greifen dort, wo sie gelten: Losfahren außerhalb des Heimatgebiets, Gruppe, Funk.
 * Solange limitsLive() aus ist (Testphase), bleibt es beim alten Verhalten.
 * Ohne Anmeldung greift die Sperre nicht (das regelt die Anmeldepflicht, der Web Planer bleibt offen).
 * Dazu TrialBadge, eine kleine Pille mit den restlichen Testtagen, etwa für die Einstellungen.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { signOut, useSession } from '@/lib/auth';
import { isFreePhase, useEntitlement } from '@/lib/entitlement';
import { limitsLive } from '@/lib/paywall';

import { Paywall } from './paywall';
import { t } from '@/i18n';

export function EntitlementGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const e = useEntitlement();
  if (limitsLive() || !session || e.loading || e.active) return <>{children}</>;
  return (
    <Paywall
      mode="expired"
      footer={
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          <AppText muted style={styles.signOutText}>
            {t('Abmelden')}
          </AppText>
        </Pressable>
      }
    />
  );
}

/** "Test noch 9 Tage": nur sichtbar während der Testphase. */
export function TrialBadge() {
  const e = useEntitlement();
  if (e.loading || !e.active || !e.until || !isFreePhase(e.source)) return null;
  // Gründungstester erst in den letzten zwei Wochen erinnern
  if (e.source === 'gruender' && e.daysLeft > 14) return null;
  const text =
    e.source === 'test'
      ? e.daysLeft <= 1
        ? t('Test noch 1 Tag')
        : t('Test noch {daysLeft} Tage', { daysLeft: e.daysLeft })
      : e.daysLeft <= 1
        ? t('Frei noch 1 Tag')
        : t('Frei noch {daysLeft} Tage', { daysLeft: e.daysLeft });
  const urgent = e.daysLeft <= 3;
  return (
    <View style={[styles.pill, urgent && styles.pillUrgent]} accessibilityLabel={text}>
      <AppText variant="caption" style={[styles.pillText, urgent && styles.pillTextUrgent]}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  signOut: { height: 44, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  pill: { alignSelf: 'flex-start', backgroundColor: Colors.warnTint, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, paddingVertical: 2 },
  pillUrgent: { backgroundColor: Colors.signalTint },
  pillText: { color: Colors.warn, fontFamily: Fonts.semibold },
  pillTextUrgent: { color: Colors.signal },
});
