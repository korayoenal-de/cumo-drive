/**
 * Profil bearbeiten (Entwurf "Einstellungen neu", Koray 10.11.): Name, Wohnort und Über mich an einem Ort,
 * darunter die Vorschau, wie andere dich unter Drivers sehen. Oben das Profilfoto (13.11.): Tippen klappt die
 * Möglichkeiten auf (Fotos, Kamera, entfernen), wie überall in der App direkt an der Stelle.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';

import { NameField, useNameCheck } from '@/components/auth/name-field';
import { DriverCard } from '@/components/community/driver-card';
import { Avatar } from '@/components/community/ride-bits';
import { ActionSheet, ConfirmSheet, type SheetItem } from '@/components/ui/action-sheet';
import { canCrop, pickPhoto, removeAvatar, uploadAvatar, useAvatar, type Crop, type Picked, type PickResult } from '@/lib/avatars';
import { AvatarCropper } from '@/components/settings/avatar-cropper';
import { haptic } from '@/lib/haptics';
import { BioField, BirthdayField, HomeField, usePrivacy } from '@/components/settings/community-profile';
import { SubScreen } from '@/components/settings/settings-ui';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type, Pressed } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { shownBirthday } from '@/lib/drivers';
import { setDisplayName, useMyProfile } from '@/lib/profile';
import { useVehicles, vehicleName } from '@/lib/vehicle';
import { carLookFor } from '@/components/map/car-sprite';
import { t } from '@/i18n';

export default function Profil() {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const { p, save, busy, err } = usePrivacy();
  const { list } = useVehicles();

  if (!session) {
    return (
      <SubScreen title={t('Profil')}>
        <AppText muted>{t('Melde dich an, um dein Profil anzulegen.')}</AppText>
      </SubScreen>
    );
  }
  return (
    <SubScreen title={t('Profil')}>
      <PhotoField userId={session.user.id} name={profile?.displayName ?? '?'} />
      <View style={styles.gapS}>
        <AppText style={styles.label}>{t('So sehen dich andere')}</AppText>
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
          {busy && <AppText variant="caption" muted>{t('Wird gespeichert')}</AppText>}
          {err && <AppText style={styles.error}>{err}</AppText>}
        </View>
      </View>
      {p && (
        <View style={styles.gapS}>
          <AppText style={styles.label}>{t('Vorschau in Drivers')}</AppText>
          <DriverCard
            big
            d={{
              id: session.user.id,
              name: profile?.displayName ?? t('Noch kein Name'),
              car: null,
              homeName: p.homeName,
              bio: p.bio,
              ...shownBirthday(p),
              home: p.home,
              allowMessages: p.allowMessages,
              garage: list.map((v) => ({ name: vehicleName(v) || t('Fahrzeug'), look: carLookFor(v) ?? null })),
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
  // gewähltes Foto, bis der Ausschnitt im Kreis feststeht
  const [photo, setPhoto] = useState<Picked | null>(null);
  const report = (r: PickResult) => {
    if (r.ok) haptic('punkt');
    else if (!r.cancelled && r.message) setMsg(r.message);
  };
  const upload = async (uri: string, crop?: Crop) => {
    setBusy(true);
    try {
      report(await uploadAvatar(uri, crop));
    } finally {
      setBusy(false);
    }
  };
  const run = async (what: 'library' | 'camera' | 'remove') => {
    setMsg(null);
    if (what === 'remove') {
      setBusy(true);
      try {
        report(await removeAvatar());
      } finally {
        setBusy(false);
        setAsk(false);
      }
      return;
    }
    const p = await pickPhoto(what);
    if (!('uri' in p)) return report(p);
    // mit eigenem Zuschnitt erst den Ausschnitt im Kreis wählen, sonst hat iOS schon quadratisch zugeschnitten
    if (canCrop()) setPhoto(p);
    else await upload(p.uri);
  };
  // Optionen zum Foto im Bottom Sheet (Design Prinzipien: Optionen zu einem Objekt), Entfernen unten rot mit Rückfrage
  const items: SheetItem[] = [
    { key: 'library', icon: 'photo.on.rectangle', label: t('Aus deinen Fotos'), onPress: () => void run('library') },
    { key: 'camera', icon: 'camera', label: t('Foto aufnehmen'), onPress: () => void run('camera') },
    ...(url ? [{ key: 'remove', icon: 'trash' as const, label: t('Foto entfernen'), hint: t('Dann zeigen wir deine Initialen'), danger: true, onPress: () => setAsk(true) }] : []),
  ];
  return (
    <View style={styles.photo}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={url ? t('Profilfoto ändern') : t('Profilfoto hinzufügen')}
        disabled={busy}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}>
        <Avatar name={name} userId={userId} size={96} busy={busy} />
        <View style={styles.photoBadge}>
          <SymbolView name="camera.fill" size={16} weight="semibold" tintColor={Colors.onSignal} />
        </View>
      </Pressable>
      {!url && <AppText variant="caption" muted>{t('Tippe auf den Kreis, um ein Foto zu setzen.')}</AppText>}
      {msg && <AppText style={styles.error}>{msg}</AppText>}
      <ActionSheet visible={open} title={t('Profilfoto')} items={items} onClose={() => setOpen(false)} />
      <AvatarCropper
        photo={photo}
        onCancel={() => setPhoto(null)}
        onDone={(crop) => {
          const p = photo;
          setPhoto(null);
          if (p) void upload(p.uri, crop);
        }}
      />
      <ConfirmSheet
        visible={ask}
        title={t('Möchtest du dein Profilfoto wirklich entfernen?')}
        text={t('Andere sehen dann wieder deine Initialen.')}
        confirmLabel={t('Entfernen')}
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
      setErr(e instanceof Error ? e.message : t('Das hat nicht geklappt.'));
    } finally {
      setBusy(false);
    }
  };

  if (draft == null) {
    return (
      <View style={styles.row}>
        <View style={styles.grow}>
          <AppText variant="caption" muted>
            {t('Dein Name')}
          </AppText>
          <AppText style={styles.name} numberOfLines={1}>
            {current ?? t('Noch kein Name')}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Namen ändern')} onPress={() => setDraft(current ?? '')} style={[styles.secondary, styles.padH]}>
          <AppText style={styles.secondaryText}>{t('Ändern')}</AppText>
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
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{t('Speichern')}</AppText>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={[styles.secondary, styles.grow]}>
          <AppText style={styles.secondaryText}>{t('Abbrechen')}</AppText>
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
  pressed: Pressed,
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
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
});
