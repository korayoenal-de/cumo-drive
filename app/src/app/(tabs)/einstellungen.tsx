/**
 * Einstellungen (Entwurf "Einstellungen neu", Koray 10.11.): oben die Profilkarte, darunter nach Themen
 * gruppiert Fahrzeuge, Fahren, Community, Mitgliedschaft, Konto und Rechtliches. Details liegen eine Ebene tiefer.
 */
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/community/ride-bits';
import { describeEntitlement } from '@/components/paywall/membership-section';
import { resetPrivacy, usePrivacy } from '@/components/settings/community-profile';
import { avoidSummary } from '@/components/planner/planner-parts';
import { Group, Row, SwitchRow } from '@/components/settings/settings-ui';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { ActionSheet, ConfirmSheet, SHEET_GONE_MS } from '@/components/ui/action-sheet';
import { here } from '@/components/group/meeting-route';
import { askMembership, LIMITS_LIVE, previewPaywall, type PaywallKind } from '@/lib/paywall';
import { reverseName } from '@/lib/geocode';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useAvoid } from '@/lib/avoid-settings';
import { refreshAvatar } from '@/lib/avatars';
import { deleteAccount, signIn, signOut, signUp, useSession } from '@/lib/auth';
import { refreshEntitlement, setHomeArea, useEntitlement } from '@/lib/entitlement';
import { clearLocalTours } from '@/lib/library';
import { MAP_STYLES, useMapSettings } from '@/lib/map-settings';
import { noticeSeen, useModeration } from '@/lib/moderation';
import { useMyProfile } from '@/lib/profile';
import { enablePush, pushStatus, type PushStatus } from '@/lib/push';
import { showToast } from '@/lib/toast';
import { syncVehicles, useVehicles, vehicleName } from '@/lib/vehicle';
import { useVoiceChoice } from '@/lib/voice-settings';


const PAYWALL_PREVIEWS: { kind: PaywallKind; label: string; icon: 'map.fill' | 'person.3.fill' | 'mic.fill' | 'house.fill' | 'hourglass' | 'calendar.badge.exclamationmark' }[] = [
  { kind: 'ausserhalb', label: 'A Losfahren außerhalb', icon: 'map.fill' },
  { kind: 'gruppe', label: 'B Viertes Auto', icon: 'person.3.fill' },
  { kind: 'funk', label: 'C Funk', icon: 'mic.fill' },
  { kind: 'heimat', label: 'D Heimatgebiet ändern', icon: 'house.fill' },
  { kind: 'testende', label: 'F Ende der Testphase', icon: 'hourglass' },
  { kind: 'abgelaufen', label: 'G Abo abgelaufen, Ausfahrt geplant', icon: 'calendar.badge.exclamationmark' },
];

export default function Einstellungen() {
  const session = useSession();
  const { list, current } = useVehicles();
  const map = useMapSettings();
  const [avoid] = useAvoid();
  const voice = useVoiceChoice();
  const ent = useEntitlement();
  const [paywallList, setPaywallList] = useState(false);
  // Heimatgebiet auf den Standort setzen: das erste Mal frei, danach einmal; beim zweiten Ändern die Paywall
  const changeHome = async () => {
    if (ent.home && ent.home.changes >= 1) {
      await askMembership('heimat', { homeName: ent.home.name ?? undefined });
      return;
    }
    try {
      const p = await here();
      const name = await reverseName(p).catch(() => null);
      await setHomeArea(p[0], p[1], name);
      showToast(ent.home ? `Heimatgebiet geändert: ${name ?? 'dein Standort'}. Das war die eine Änderung.` : `Heimatgebiet: ${name ?? 'dein Standort'}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' });
    }
  };
  const moderation = useModeration(!!session);
  const reloadModeration = moderation.reload;

  useEffect(() => {
    if (session) void syncVehicles();
  }, [session]);
  useFocusEffect(
    useCallback(() => {
      if (session) void refreshEntitlement();
      if (session) reloadModeration();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]),
  );

  const cars = list.length === 0 ? 'Noch keins' : list.length === 1 ? '1 Fahrzeug' : `${list.length} Fahrzeuge`;
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        Einstellungen
      </AppText>
      {session ? <ProfileCard userId={session.user.id} cars={list.length} /> : <Login />}
      {/* Hinweise mit Begründung nach Entfernen oder Sperren (Koray 12.11.) */}
      {moderation.notices.map((n) => (
        <View key={n.id} style={styles.notice}>
          <AppText style={styles.noticeTitle}>Hinweis von Cumo Drive</AppText>
          <AppText style={styles.noticeText}>{n.body}</AppText>
          <Pressable accessibilityRole="button" onPress={() => void noticeSeen(n.id).then(moderation.reload)} style={styles.noticeBtn}>
            <AppText style={styles.noticeBtnText}>Verstanden</AppText>
          </Pressable>
        </View>
      ))}

      <Group label="Fahrzeuge">
        <Row title="Garage" value={cars} onPress={() => router.push('/garage')} />
        {list.length > 1 && <Row title="Für neue Fahrten" value={current ? vehicleName(current) || 'Ohne Namen' : 'Keins'} onPress={() => router.push('/garage')} />}
      </Group>

      <Group label="Fahren">
        <Row title="Stimme und Ansagen" value={voice?.name ?? 'Standard'} onPress={() => router.push('/ansagen')} />
        <Row title="Vermeiden" value={avoidSummary(avoid)} onPress={() => router.push('/ansagen')} />
        <Row title="Kartendarstellung" value={MAP_STYLES.find((s) => s.id === map.style)?.label ?? 'Standard'} onPress={() => router.push('/ansagen')} />
      </Group>

      {session && <CommunityGroup />}

      {session && (
        <Group label="Mitgliedschaft">
          <Row title="Dein Plan" value={describeEntitlement(ent).title} onPress={() => router.push('/mitgliedschaft')} />
          {/* kostenlose Version: Heimatgebiet, einmal änderbar (stumm, solange LIMITS_LIVE aus ist) */}
          {LIMITS_LIVE && !ent.active && <Row title="Heimatgebiet" value={ent.home?.name ?? (ent.home ? 'Festgelegt' : 'Noch nicht festgelegt')} onPress={() => void changeHome()} />}
        </Group>
      )}

      {session && <Account email={session.user.email ?? ''} />}

      {/* Prüfbereich nur für Admins, unten über Rechtliches (Koray 14.11.) */}
      {moderation.mod?.admin && (
        <Group label="Prüfung" hint="Gemeldete Inhalte ansehen, entfernen oder Konten sperren.">
          <Row title="Prüfbereich" value={moderation.mod.openReports ? `${moderation.mod.openReports} offen` : 'Nichts offen'} onPress={() => router.push('/pruefung')} />
          <Row title="Paywalls ansehen" value={LIMITS_LIVE ? 'Aktiv' : 'Stumm'} onPress={() => setPaywallList(true)} />
        </Group>
      )}
      {moderation.mod?.admin && (
        <ActionSheet
          visible={paywallList}
          title="Paywalls ansehen"
          subtitle={LIMITS_LIVE ? 'Die Grenzen gelten.' : 'Die Grenzen sind stumm. Hier nur zur Ansicht, ein Kauf ist noch nicht möglich.'}
          items={PAYWALL_PREVIEWS.map((x) => ({
            key: x.kind,
            icon: x.icon,
            label: x.label,
            onPress: () => {
              setPaywallList(false);
              setTimeout(() => void previewPaywall(x.kind), SHEET_GONE_MS);
            },
          }))}
          onClose={() => setPaywallList(false)}
        />
      )}

      <Group label="Rechtliches">
        <Row title="Datenschutz" onPress={() => router.push('/datenschutz')} />
        <Row title="Nutzungsbedingungen" onPress={() => router.push('/agb')} />
      </Group>

      {version ? <AppText style={styles.version}>Cumo Drive {version}</AppText> : null}
    </Screen>
  );
}

/** Profilkarte: so sehen dich andere unter Drivers; Tippen öffnet Profil bearbeiten. */
function ProfileCard({ userId, cars }: { userId: string; cars: number }) {
  const profile = useMyProfile(userId);
  // eigenes Foto bei jedem Öffnen der Einstellungen frisch holen
  useFocusEffect(useCallback(() => refreshAvatar(userId), [userId]));
  const { p } = usePrivacy();
  const name = profile?.displayName ?? null;
  const meta = [p?.homeName ?? 'Wohnort fehlt', cars ? (cars === 1 ? '1 Fahrzeug' : `${cars} Fahrzeuge`) : null].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Profil bearbeiten, ${name ?? 'noch kein Name'}`} onPress={() => router.push('/profil')} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
      <Avatar name={name ?? '?'} userId={userId} size={64} />
      <View style={styles.flex}>
        <AppText style={styles.profileName} numberOfLines={1}>
          {name ?? 'Noch kein Name'}
        </AppText>
        <AppText style={styles.profileMeta} numberOfLines={1}>
          {meta}
        </AppText>
        {p && (
          <View style={[styles.tag, p.visible ? styles.tagGood : styles.tagMuted]}>
            <AppText style={[styles.tagText, { color: p.visible ? Colors.good : Colors.muted }]}>{!p.visible ? 'Nicht in der Community' : p.homeName ? 'Sichtbar in der Community' : 'In der Community, ohne Karte'}</AppText>
          </View>
        )}
      </View>
      <SymbolView name="chevron.right" size={15} weight="bold" tintColor={Colors.muted} />
    </Pressable>
  );
}

/** Stand der Mitteilungen (iOS Erlaubnis), auch nach der Rückkehr aus den iOS Einstellungen */
function usePushStatus() {
  const [push, setPush] = useState<PushStatus>('nicht');
  useEffect(() => {
    const check = () => void pushStatus().then(setPush);
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);
  return [push, setPush] as const;
}

function CommunityGroup() {
  const { p, save, err } = usePrivacy();
  const [push, setPush] = usePushStatus();
  // Einschalten fragt iOS einmalig; danach (und zum Ausschalten) geht es nur in den iOS Einstellungen
  const togglePush = async (on: boolean) => {
    if (on && push === 'offen') {
      await enablePush(true);
      setPush(await pushStatus());
    } else void Linking.openSettings();
  };
  return (
    <Group label="Community" hint={err ?? (p?.visible === false ? 'Du bist in der Community ausgeblendet. Gruppenfahrten und bestehende Unterhaltungen bleiben.' : 'Andere sehen deinen Namen, Wohnort und auf Wunsch deine Garage.')}>
      <SwitchRow title="In Community sichtbar" value={p?.visible ?? true} onChange={(v) => void save({ visible: v })} />
      <SwitchRow
        title="Nachrichten erlauben"
        value={p?.allowMessages ?? true}
        onChange={(v) => {
          void save({ allowMessages: v });
          if (v) void enablePush(true).then(() => pushStatus().then(setPush));
        }}
      />
      {push !== 'nicht' && <SwitchRow title="Mitteilungen bei Nachrichten" value={push === 'an'} onChange={(v) => void togglePush(v)} />}
      <SwitchRow title="Einladungen nur von Kontakten" value={p?.invitesContactsOnly ?? false} onChange={(v) => void save({ invitesContactsOnly: v })} />
      <SwitchRow title="Garage im Profil zeigen" value={p?.showGarage ?? true} onChange={(v) => void save({ showGarage: v })} />
      <Row title="Blockierte Drivers" onPress={() => router.push('/blockiert')} />
    </Group>
  );
}

function Account({ email }: { email: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      clearLocalTours();
      showToast('Dein Konto ist gelöscht.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Löschen hat nicht geklappt.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Group label="Konto" hint="Touren, Fahrten und Fahrzeuge liegen in deinem Konto und im Web Planer.">
        <Row title="E-Mail" value={email} />
        <Row title="Abmelden" onPress={() => {
          resetPrivacy();
          void signOut();
        }} />
        <Row title={busy ? 'Konto wird gelöscht' : 'Konto löschen'} danger chevron={false} onPress={busy ? undefined : () => setAsk(true)} />
      </Group>
      <ConfirmSheet
        visible={ask}
        title="Möchtest du dein Konto wirklich löschen?"
        text="Touren, Fahrten, Fahrzeuge, Bewertungen und dein Name werden endgültig gelöscht, auch in der Community. Das lässt sich nicht rückgängig machen. Ein Abo kündigst du separat in den Einstellungen deiner Apple ID."
        confirmLabel="Löschen"
        onConfirm={() => void remove()}
        onClose={() => setAsk(false)}
      />
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: (e: string, p: string) => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn(email, pw);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };
  const ready = !!email.trim() && pw.length > 0 && !busy;
  return (
    <View style={styles.card}>
      <AppText muted>Mit Konto findest du deine Touren auch im Web Planer, kannst Touren veröffentlichen und deine Fahrten werden gespeichert.</AppText>
      <TextInput maxFontSizeMultiplier={1.2}
        value={email}
        onChangeText={setEmail}
        placeholder="E-Mail"
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
        accessibilityLabel="E-Mail"
      />
      <TextInput maxFontSizeMultiplier={1.2}
        value={pw}
        onChangeText={setPw}
        placeholder="Passwort, mindestens 8 Zeichen"
        placeholderTextColor={Colors.muted}
        secureTextEntry
        autoComplete="password"
        style={styles.input}
        accessibilityLabel="Passwort"
      />
      {err && <AppText style={styles.error}>{err}</AppText>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={() => run(signIn)} style={[styles.primary, styles.grow, !ready && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Anmelden</AppText>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={() => run(signUp)} style={[styles.secondary, styles.grow, !ready && styles.disabled]}>
          <AppText style={styles.secondaryText}>Registrieren</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: Colors.signalTint, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.s },
  noticeTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.stopText },
  noticeText: { fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: 21, color: Colors.text },
  noticeBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  noticeBtnText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  flex: { flex: 1, gap: 3 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  profile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, padding: Spacing.l, borderRadius: Radius.l, backgroundColor: Colors.surface },
  pressed: { backgroundColor: Colors.surface2 },
  profileName: { fontFamily: Fonts.bold, fontSize: Type.title },
  profileMeta: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  tag: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.pill },
  tagGood: { backgroundColor: Colors.goodTint },
  tagMuted: { backgroundColor: Colors.surface2 },
  tagText: { fontFamily: Fonts.bold, fontSize: 13 },
  version: { alignSelf: 'center', fontFamily: Fonts.medium, fontSize: Type.body, color: '#5E5E63' },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  disabled: { opacity: 0.4 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
});
