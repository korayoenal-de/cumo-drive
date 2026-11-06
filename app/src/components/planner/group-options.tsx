/**
 * Optionen der Gruppenfahrt über der Aktionsleiste, sobald im Schalter "Gruppe" gewählt ist
 * (Entwurf D2, 6.11.): du als Lead, ein Plus zum Einladen, kurz erklärt, was als Nächstes passiert.
 * Eingeladen wird im nächsten Schritt mit Namen (Seite gruppe/neu); dafür wird die Tour gespeichert.
 */
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useMyProfile } from '@/lib/profile';

function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'DU';
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function GroupOptions({ onInvite }: { onInvite: () => void }) {
  const session = useSession();
  const me = useMyProfile(session?.user.id);
  return (
    <Animated.View entering={softEnter()} style={styles.card}>
      <View style={styles.head}>
        <AppText style={styles.title}>Mitfahrer</AppText>
        <AppText style={styles.muted}>bis zu 6 Autos</AppText>
      </View>
      <View style={styles.row}>
        <View style={styles.person}>
          <View style={[styles.avatar, styles.lead]}>
            <AppText style={styles.leadText}>{initials(me?.displayName)}</AppText>
          </View>
          <AppText style={styles.small}>Lead</AppText>
        </View>
        <View style={styles.person}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mitfahrer einladen"
            onPress={onInvite}
            hitSlop={4}
            style={({ pressed }) => [styles.avatar, styles.add, pressed && styles.pressed]}>
            <SymbolView name="plus" size={18} weight="semibold" tintColor={Colors.text} />
          </Pressable>
          <AppText style={styles.small}>Einladen</AppText>
        </View>
        <AppText style={[styles.muted, styles.flex]}>
          {session ? 'Mit Losfahren lädst du die Mitfahrer mit ihrem Namen ein und startest die Fahrt.' : 'Für die Gruppenfahrt meldest du dich in den Einstellungen an.'}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  muted: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m },
  person: { alignItems: 'center', gap: Spacing.xs, width: 56 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  lead: { backgroundColor: Colors.signal },
  leadText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.onSignal },
  add: { borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.empty },
  small: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  pressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
});
