/**
 * Früher sperrte die App nach der Testphase ganz. Seit der kostenlosen Version (Koray 14.11.) bleibt sie offen,
 * die Grenzen greifen dort, wo sie gelten: Losfahren außerhalb des Heimatgebiets, Gruppe, Funk.
 * Solange LIMITS_LIVE aus ist (Testphase), bleibt es beim alten Verhalten.
 * Ohne Anmeldung greift die Sperre nicht (das regelt die Anmeldepflicht, der Web Planer bleibt offen).
 * Dazu TrialBadge, eine kleine Pille mit den restlichen Testtagen, etwa für die Einstellungen.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { signOut, useSession } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { LIMITS_LIVE } from '@/lib/paywall';

import { Paywall } from './paywall';


export function EntitlementGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const e = useEntitlement();
  if (LIMITS_LIVE || !session || e.loading || e.active) return <>{children}</>;
  return (
    <Paywall
      mode="expired"
      footer={
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          <AppText muted style={styles.signOutText}>
            Abmelden
          </AppText>
        </Pressable>
      }
    />
  );
}

/** "Test noch 9 Tage": nur sichtbar während der Testphase. */
export function TrialBadge() {
  const e = useEntitlement();
  if (e.loading || !e.active || e.source !== 'test' || !e.until) return null;
  const text = e.daysLeft <= 1 ? 'Test noch 1 Tag' : `Test noch ${e.daysLeft} Tage`;
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
