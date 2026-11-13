/**
 * Profil bearbeiten (Entwurf "Einstellungen neu", Koray 10.11.): Name, Wohnort und Über mich an einem Ort,
 * darunter die Vorschau, wie andere dich unter Drivers sehen. Oben das Profilfoto (13.11.): Tippen klappt die
 * Möglichkeiten auf (Fotos, Kamera, entfernen), wie überall in der App direkt an der Stelle.
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';

import { NameField, useNameCheck } from '@/components/auth/name-field';
import { DriverCard } from '@/components/community/driver-card';
import { Avatar } from '@/components/community/ride-bits';
import { ActionSheet, ConfirmSheet, type SheetItem } from '@/components/ui/action-sheet';
import { pickAvatar, removeAvatar, useAvatar } from '@/lib/avatars';
import { haptic } from '@/lib/haptics';
import { BioField, BirthdayField, HomeField, usePrivacy } from '@/components/settings/community-profile';
import { SubScreen } from '@/components/settings/settings-ui';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { shownBirthday } from '@/lib/drivers';
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
      <PhotoField userId={session.user.id} name={profile?.displayName ?? '?'} />
      <View style={styles.gapS}>
        <AppText style={styles.label}>So sehen dich andere</AppText>
        <View style={styles.card}>
          <DisplayName />
          {p ? (
            <>
              <View style={styles.sep} />
              <HomeField p={p} save={save} />
              <View style={styles.sep} />
              <BirthdayField key={`geb${p.birthDate ?? ''}`} p={p} save={save} />
              <View style={styles.sep} />
              <BioField key={`bio${p.bio ?? ""}`} p={p} save={save} />
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
              ...shownBirthday(p),
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

/** Profilfoto: großer Kreis, Tippen klappt Fotos, Kamera und Entfernen auf */
function PhotoField({ userId, name }: { userId: string; name: string }) {
  const url = useAvatar(userId);
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (what: 'library' | 'camera' | 'remove') => {
    setBusy(true);
    setMsg(null);
    try {
      const r = what === 'remove' ? await removeAvatar() : await pickAvatar(what);
      if (r.ok) haptic('punkt');
      else if (!r.cancelled && r.message) setMsg(r.message);
    } finally {
      setBusy(false);
      setAsk(false);
    }
  };
  // Optionen zum Foto im Bottom Sheet (Design Prinzipien: Optionen zu einem Objekt), Entfernen unten rot mit Rückfrage
  const items: SheetItem[] = [
    { key: 'library', icon: 'photo.on.rectangle', label: 'Aus deinen Fotos', hint: 'Quadratisch zuschneiden', onPress: () => void run('library') },
    { key: 'camera', icon: 'camera', label: 'Foto aufnehmen', onPress: () => void run('camera') },
    ...(url ? [{ key: 'remove', icon: 'trash' as const, label: 'Foto entfernen', hint: 'Dann zeigen wir deine Initialen', danger: true, onPress: () => setAsk(true) }] : []),
  ];
  return (
    <View style={styles.photo}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={url ? 'Profilfoto ändern' : 'Profilfoto hinzufügen'}
        disabled={busy}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}>
        <Avatar name={name} userId={userId} size={96} />
        <View style={styles.photoBadge}>
          {busy ? <ActivityIndicator size="small" color={Colors.onSignal} /> : <SymbolView name="camera.fill" size={15} weight="bold" tintColor={Colors.onSignal} />}
        </View>
      </Pressable>
      {!url && <AppText variant="caption" muted>Tippe auf den Kreis, um ein Foto zu setzen.</AppText>}
      {msg && <AppText style={styles.error}>{msg}</AppText>}
      <ActionSheet visible={open} title="Profilfoto" items={items} onClose={() => setOpen(false)} />
      <ConfirmSheet
        visible={ask}
        title="Möchtest du dein Profilfoto wirklich entfernen?"
        text="Andere sehen dann wieder deine Initialen."
        confirmLabel="Entfernen"
        onConfirm={() => {
          setAsk(false);
          void run('remove');
        }}
        onClose={() => setAsk(false)}
      />
    </View>
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
  photo: { alignItems: 'center', gap: Spacing.s },
  photoBtn: { width: 96, height: 96 },
  photoBadge: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.ground },
  gapS: { gap: Spacing.s },
  pressed: { opacity: 0.85 },
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
