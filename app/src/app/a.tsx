/**
 * Landeseite für Einladungslinks zu privaten Ausfahrten (drive.rallycumo.de/a#<id>.<schlüssel>, Koray 13.11.).
 * Der Link kommt meist über WhatsApp. Von hier geht es per Knopf in die App, dort fragt man an,
 * der Organisator nimmt an. Kennung und Schlüssel stehen hinter #, sie erreichen den Server nie.
 * Ohne Anmeldung zeigt die Seite bewusst keine Details der Ausfahrt.
 */
import { Redirect } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { parseRideLink } from '@/lib/ausfahrten';

const subscribe = (cb: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const getHash = () => (typeof window === 'undefined' ? '' : window.location.hash);

export default function RideInvite() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  const link = useMemo(() => parseRideLink(hash), [hash]);

  if (Platform.OS !== 'web') return <Redirect href={link ? { pathname: '/ausfahrt/[id]', params: { id: link.id, k: link.key } } : '/'} />;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <AppText style={styles.brand}>CUMO DRIVE</AppText>
        {link ? (
          <>
            <View style={{ gap: 6 }}>
              <AppText variant="caption" muted>Einladung</AppText>
              <AppText variant="display" style={styles.title}>Fahr mit</AppText>
              <AppText muted>Du bist zu einer privaten Ausfahrt eingeladen. In der App siehst du Termin und Organisator und fragst an.</AppText>
            </View>
            <Pressable
              accessibilityRole="link"
              style={styles.primary}
              onPress={() => {
                window.location.href = `cumodrive://ausfahrt/${link.id}?k=${link.key}`;
              }}>
              <AppText style={styles.primaryText}>In CUMO DRIVE öffnen</AppText>
            </Pressable>
            <AppText variant="caption" muted>Noch keine App? CUMO DRIVE gibt es gerade als Testversion für iPhone über den CUMO DRIVERS CLUB.</AppText>
          </>
        ) : (
          <>
            <AppText variant="title">Dieser Link ist unvollständig.</AppText>
            <AppText muted>Bitte lass dir den Link der Ausfahrt nochmal schicken.</AppText>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: Colors.ground, alignItems: 'center', justifyContent: 'center', padding: Spacing.l },
  card: { width: '100%', maxWidth: 440, gap: Spacing.xl, padding: Spacing.xl, borderRadius: Radius.l, backgroundColor: Colors.surface },
  brand: { fontFamily: Fonts.display, fontSize: Type.body, letterSpacing: 2 },
  title: { fontSize: Type.display, lineHeight: 38 },
  primary: { height: 54, borderRadius: 27, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
});
