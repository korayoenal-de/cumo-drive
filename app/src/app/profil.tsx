/**
 * Profil bearbeiten (Entwurf "Einstellungen neu", Koray 10.11.): Name, Wohnort und Über mich an einem Ort,
 * darunter die Vorschau, wie andere dich unter Drivers sehen. Ein Profilfoto kommt mit dem nächsten Build.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { NameField, useNameCheck } from '@/components/auth/name-field';
import { DriverCard } from '@/components/community/driver-card';
import { BioField, HomeField, usePrivacy } from '@/components/settings/community-profile';
import { SubScreen } from '@/components/settings/settings-ui';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { setDisplayName, useMyProfile } from '@/lib/profile';
import { useVehicles, vehicleName } from '@/lib/vehicle';
import { carLookFor } from '@/components/map/car-sprite';

export default function Profil() {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const { p, save, busy, err } = usePrivacy();
  const { list } = useVehicles();

  if (!session) {
    return (
      <SubScreen title="Profil">
        <AppText muted>Melde dich an, um dein Profil anzulegen.</AppText>
      </SubScreen>
    );
  }
  return (
    <SubScreen title="Profil">
      <View style={styles.gapS}>
        <AppText style={styles.label}>So sehen dich andere</AppText>
        <View style={styles.card}>
          <DisplayName />
          {p ? (
            <>
              <View style={styles.sep} />
              <HomeField p={p} save={save} />
              <View style={styles.sep} />
              <BioField key={p.bio ?? ""} p={p} save={save} />
            </>
          ) : (
            <ActivityIndicator color={Colors.muted} />
          )}
          {busy && <AppText variant="caption" muted>Wird gespeichert</AppText>}
          {err && <AppText style={styles.error}>{err}</AppText>}
        </View>
      </View>
      {p && (
        <View style={styles.gapS}>
          <AppText style={styles.label}>Vorschau in Drivers</AppText>
          <DriverCard
            big
            d={{
              id: session.user.id,
              name: profile?.displayName ?? 'Noch kein Name',
              car: null,
              homeName: p.homeName,
              bio: p.bio,
              home: p.home,
              allowMessages: p.allowMessages,
              garage: list.map((v) => ({ name: vehicleName(v) || 'Fahrzeug', look: carLookFor(v) ?? null })),
              memberSince: null,
              isMe: true,
            }}
          />
        </View>
      )}
    </SubScreen>
  );
}

/** Name, unter dem einen andere finden und einladen; ändern mit Prüfung, ob der neue Name frei ist. */
function DisplayName() {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = profile?.displayName ?? null;
  const check = useNameCheck(draft ?? '', current);

  const save = async () => {
    if (draft == null || check.state !== 'frei') return;
    setBusy(true);
    setErr(null);
    try {
      await setDisplayName(draft);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  if (draft == null) {
    return (
      <View style={styles.row}>
        <View style={styles.grow}>
          <AppText variant="caption" muted>
            Dein Name
          </AppText>
          <AppText style={styles.name} numberOfLines={1}>
            {current ?? 'Noch kein Name'}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Namen ändern" onPress={() => setDraft(current ?? '')} style={[styles.secondary, styles.padH]}>
          <AppText style={styles.secondaryText}>Ändern</AppText>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.gapS}>
      <NameField value={draft} onChange={setDraft} check={check} onSurface />
      {err && <AppText style={styles.error}>{err}</AppText>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={busy || check.state !== 'frei'} onPress={() => void save()} style={[styles.primary, styles.grow, (busy || check.state !== 'frei') && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Speichern</AppText>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={[styles.secondary, styles.grow]}>
          <AppText style={styles.secondaryText}>Abbrechen</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gapS: { gap: Spacing.s },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  label: { paddingHorizontal: 4, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.line },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  disabled: { opacity: 0.4 },
  padH: { paddingHorizontal: Spacing.l },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
