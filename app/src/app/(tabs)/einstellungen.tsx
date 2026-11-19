/**
 * Einstellungen (Entwurf "Einstellungen neu", Koray 10.11.): oben die Profilkarte, darunter nach Themen
 * gruppiert Fahrzeuge, Fahren, Community, Mitgliedschaft, Konto und Rechtliches. Details liegen eine Ebene tiefer.
 */
import Constants from 'expo-constants';
import { appVersionLine } from '@/lib/feedback';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';

import { Avatar } from '@/components/community/ride-bits';
import { BackLink } from '@/components/ui/back-link';
import { describeEntitlement } from '@/components/paywall/membership-section';
import { resetPrivacy, usePrivacy } from '@/components/settings/community-profile';
import { avoidSummary } from '@/components/planner/planner-parts';
import { Group, Row, SwitchRow } from '@/components/settings/settings-ui';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { ActionSheet, ConfirmSheet, SHEET_GONE_MS } from '@/components/ui/action-sheet';
import { here } from '@/components/group/meeting-route';
import { askMembership, limitsLive, previewPaywall, type PaywallKind } from '@/lib/paywall';
import { reverseName } from '@/lib/geocode';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useAvoid } from '@/lib/avoid-settings';
import { refreshAvatar } from '@/lib/avatars';
import { deleteAccount, signIn, signOut, useSession } from '@/lib/auth';
import { useNewsConsent } from '@/lib/consent';
import { PRICES, refreshEntitlement, setHomeArea, useEntitlement } from '@/lib/entitlement';
import { clearLocalTours } from '@/lib/library';
import { MAP_STYLES, useMapSettings } from '@/lib/map-settings';
import { noticeSeen, useModeration } from '@/lib/moderation';
import { useCurrentPlan } from '@/lib/purchase';
import { useMyProfile } from '@/lib/profile';
import { enablePush, pushStatus, type PushStatus } from '@/lib/push';
import { showToast } from '@/lib/toast';
import { syncVehicles, useVehicles, vehicleName } from '@/lib/vehicle';
import { useVoiceChoice } from '@/lib/voice-settings';
import { chosenLang, LANGS, setLang, t, tr, useLang, type Lang } from '@/i18n';


const PAYWALL_PREVIEWS: { kind: PaywallKind; label: string; icon: 'map.fill' | 'person.3.fill' | 'mic.fill' | 'house.fill' | 'hourglass' | 'calendar.badge.exclamationmark' }[] = [
  { kind: 'ausserhalb', label: 'A Losfahren außerhalb', icon: 'map.fill' },
  { kind: 'gruppe', label: 'B Viertes Auto', icon: 'person.3.fill' },
  { kind: 'funk', label: 'C Funk', icon: 'mic.fill' },
  { kind: 'heimat', label: 'D Heimatgebiet ändern', icon: 'house.fill' },
  { kind: 'testende', label: 'F Ende der Testphase', icon: 'hourglass' },
  { kind: 'abgelaufen', label: 'G Abo abgelaufen, Ausfahrt geplant', icon: 'calendar.badge.exclamationmark' },
];

/** inNav: während der Navigation als Blatt darüber geöffnet (Koray 15.11.), oben der Weg zurück zur Fahrt */
export default function Einstellungen({ inNav = false }: { inNav?: boolean } = {}) {
  const session = useSession();
  const { list, current } = useVehicles();
  const map = useMapSettings();
  const [avoid] = useAvoid();
  const voice = useVoiceChoice();
  const ent = useEntitlement();
  // Gebuchter Plan direkt sichtbar (Koray 17.11.): „Monat“ statt „Plan aktiv“
  const plan = useCurrentPlan();
  const planName = plan && ent.source === 'plan' ? PRICES.find((p) => p.id === plan.id)?.name : undefined;
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
      const where = name ?? t('dein Standort');
      showToast(ent.home ? tr('Heimatgebiet geändert: {where}. Das war die eine Änderung.', { where }) : tr('Heimatgebiet: {where}', { where }));
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('Das hat nicht geklappt.'), { tone: 'error' });
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

  const cars = list.length === 0 ? t('Noch keins') : list.length === 1 ? '1 Fahrzeug' : `${list.length} Fahrzeuge`;
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      {inNav && <BackLink label={t('Zur Navigation')} onPress={() => router.back()} />}
      <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {t('Einstellungen')}
      </AppText>
      {session ? <ProfileCard userId={session.user.id} cars={list.length} /> : <Login />}
      {/* Hinweise mit Begründung nach Entfernen oder Sperren (Koray 12.11.) */}
      {moderation.notices.map((n) => (
        <View key={n.id} style={styles.notice}>
          <AppText style={styles.noticeTitle}>{t('Hinweis von Cumo Drive')}</AppText>
          <AppText style={styles.noticeText}>{n.body}</AppText>
          <Pressable accessibilityRole="button" onPress={() => void noticeSeen(n.id).then(moderation.reload)} style={styles.noticeBtn}>
            <AppText style={styles.noticeBtnText}>{t('Verstanden')}</AppText>
          </Pressable>
        </View>
      ))}

      {/* Reihenfolge (Koray 17.11.): erst was man hat (Plan, Fahrzeuge), dann wie die App fährt und aussieht, dann
          Sichtbarkeit und Mitteilungen, Hilfe und Rechtliches, das Konto mit Abmelden und Löschen ganz unten */}
      {session && (
        <Group label={t('Mitgliedschaft')}>
          <Row title={t('Dein Plan')} value={planName ?? describeEntitlement(ent).title} onPress={() => router.push('/mitgliedschaft')} />
          {/* kostenlose Version: Heimatgebiet, einmal änderbar (stumm, solange limitsLive() aus ist) */}
          {limitsLive() && !ent.active && (
            <Row title={t('Heimatgebiet')} value={ent.home?.name ?? (ent.home ? t('Festgelegt') : t('Noch nicht festgelegt'))} onPress={() => void changeHome()} />
          )}
        </Group>
      )}

      <Group label={t('Fahrzeuge')}>
        <Row title={t('Garage')} value={cars} onPress={() => router.push('/garage')} />
        {list.length > 1 && <Row title={t('Für neue Fahrten')} value={current ? vehicleName(current) || t('Ohne Namen') : 'Keins'} onPress={() => router.push('/garage')} />}
      </Group>

      <Group label={t('Navigation')}>
        <Row title={t('Stimme und Ansagen')} value={voice?.name ?? 'Standard'} onPress={() => router.push('/ansagen')} />
        <Row title={t('Vermeiden')} value={avoidSummary(avoid)} onPress={() => router.push('/ansagen')} />
      </Group>

      <Group label={t('Darstellung')}>
        <Row title={t('Kartendarstellung')} value={MAP_STYLES.find((s) => s.id === map.style)?.label ?? 'Standard'} onPress={() => router.push('/ansagen')} />
        <LanguageRow />
      </Group>

      {session && <CommunityGroup />}

      {session && <NotifyGroup userId={session.user.id} />}

      <Group label={t('Hilfe und Rechtliches')} hint={t('Fehler, Wünsche, falsche Strecken: jede Meldung wird geprüft.')}>
        <Row title={t('Feedback geben')} onPress={() => router.push('/feedback')} />
        <Row title={t('Datenschutz')} onPress={() => router.push('/datenschutz')} />
        <Row title={t('Nutzungsbedingungen')} onPress={() => router.push('/agb')} />
        <Row title={t('Impressum')} onPress={() => router.push('/impressum')} />
      </Group>

      {/* Prüfbereich nur für Admins (Koray 14.11.) */}
      {moderation.mod?.admin && (
        <Group label={t('Prüfung')} hint={t('Gemeldete Inhalte ansehen, entfernen oder Konten sperren.')}>
          <Row title={t('Prüfbereich')} value={moderation.mod.openReports ? `${moderation.mod.openReports} offen` : t('Nichts offen')} onPress={() => router.push('/pruefung')} />
          <Row title={t('Paywalls ansehen')} value={limitsLive() ? t('Aktiv') : t('Stumm')} onPress={() => setPaywallList(true)} />
        </Group>
      )}

      {session && <Account email={session.user.email ?? ''} />}

      {moderation.mod?.admin && (
        <ActionSheet
          visible={paywallList}
          title={t('Paywalls ansehen')}
          subtitle={limitsLive() ? t('Die Grenzen gelten.') : t('Die Grenzen sind stumm. Hier nur zur Ansicht, ein Kauf ist noch nicht möglich.')}
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

      {version ? <AppText style={styles.version}>Cumo Drive {appVersionLine()}</AppText> : null}
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
  const meta = [p?.homeName ?? t('Wohnort fehlt'), cars ? (cars === 1 ? '1 Fahrzeug' : `${cars} Fahrzeuge`) : null].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Profil bearbeiten, {v0}', { v0: name ?? t('noch kein Name') })} onPress={() => router.push('/profil')} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
      <Avatar name={name ?? '?'} userId={userId} size={64} />
      <View style={styles.flex}>
        <AppText style={styles.profileName} numberOfLines={1}>
          {name ?? t('Noch kein Name')}
        </AppText>
        <AppText style={styles.profileMeta} numberOfLines={1}>
          {meta}
        </AppText>
        {p && (
          <View style={[styles.tag, p.visible ? styles.tagGood : styles.tagMuted]}>
            <AppText style={[styles.tagText, { color: p.visible ? Colors.good : Colors.muted }]}>{!p.visible ? t('Nicht in der Community') : p.homeName ? t('Sichtbar in der Community') : t('In der Community, ohne Karte')}</AppText>
          </View>
        )}
      </View>
      <SymbolView name="chevron.right" size={16} weight="semibold" tintColor={Colors.muted} />
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
  const [, setPush] = usePushStatus();
  return (
    <Group label={t('Community')} hint={err ?? (p?.visible === false ? t('Du bist in der Community ausgeblendet. Gruppenfahrten und bestehende Unterhaltungen bleiben.') : t('Andere sehen deinen Namen, Wohnort und auf Wunsch deine Garage.'))}>
      <SwitchRow title={t('In Community sichtbar')} value={p?.visible ?? true} onChange={(v) => void save({ visible: v })} />
      <SwitchRow title={t('Garage im Profil zeigen')} value={p?.showGarage ?? true} onChange={(v) => void save({ showGarage: v })} />
      <SwitchRow
        title={t('Nachrichten erlauben')}
        value={p?.allowMessages ?? true}
        onChange={(v) => {
          void save({ allowMessages: v });
          if (v) void enablePush(true).then(() => pushStatus().then(setPush));
        }}
      />
      <SwitchRow title={t('Einladungen nur von Kontakten')} value={p?.invitesContactsOnly ?? false} onChange={(v) => void save({ invitesContactsOnly: v })} />
      <Row title={t('Blockierte Drivers')} onPress={() => router.push('/blockiert')} />
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
      showToast(t('Dein Konto ist gelöscht.'));
    } catch (e) {
      showToast(e instanceof Error ? e.message: t('Löschen hat nicht geklappt.'), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Group label={t('Konto')} hint={t('Touren, Fahrten und Fahrzeuge liegen in deinem Konto und im Web Planer.')}>
        <Row title={t('E-Mail')} value={email} />
        <Row title={t('Abmelden')} onPress={() => {
          resetPrivacy();
          void signOut();
        }} />
        <Row title={busy ? t('Konto wird gelöscht') : t('Konto löschen')} danger chevron={false} onPress={busy ? undefined : () => setAsk(true)} />
      </Group>
      <ConfirmSheet
        visible={ask}
        title={t('Möchtest du dein Konto wirklich löschen?')}
        text={t('Touren, Fahrten, Fahrzeuge, Bewertungen und dein Name werden endgültig gelöscht, auch in der Community. Das lässt sich nicht rückgängig machen. Ein Abo kündigst du separat in den Einstellungen deiner Apple ID.')}
        confirmLabel={t('Löschen')}
        onConfirm={() => void remove()}
        onClose={() => setAsk(false)}
      />
    </>
  );
}

/** Neuigkeiten per E Mail: Opt in aus der Registrierung, hier jederzeit änderbar (17.11.) */
/** Mitteilungen aufs Handy und Neuigkeiten per E Mail an einer Stelle (Koray 17.11.) */
function NotifyGroup({ userId }: { userId: string }) {
  const news = useNewsConsent(userId);
  const [push, setPush] = usePushStatus();
  // Einschalten fragt iOS einmalig; danach (und zum Ausschalten) geht es nur in den iOS Einstellungen
  const togglePush = async (on: boolean) => {
    if (on && push === 'offen') {
      await enablePush(true);
      setPush(await pushStatus());
    } else void Linking.openSettings();
  };
  return (
    <Group label={t('Mitteilungen')} hint={t('Neuigkeiten: neue Funktionen, Strecken und Ausfahrten, selten und jederzeit abbestellbar.')}>
      {push !== 'nicht' && <SwitchRow title={t('Mitteilungen bei Nachrichten')} value={push === 'an'} onChange={(v) => void togglePush(v)} />}
      <SwitchRow
        title={t('Neuigkeiten per E Mail')}
        value={news.on ?? false}
        onChange={(v) => void news.set(v).catch(() => showToast(t('Das hat nicht geklappt.')))}
      />
    </Group>
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
      setErr(e instanceof Error ? e.message : t('Das hat nicht geklappt.'));
    } finally {
      setBusy(false);
    }
  };
  const ready = !!email.trim() && pw.length > 0 && !busy;
  return (
    <View style={styles.card}>
      <AppText muted>{t('Mit Konto findest du deine Touren auch im Web Planer, kannst Touren veröffentlichen und deine Fahrten werden gespeichert.')}</AppText>
      <TextField maxFontSizeMultiplier={1.2}
        value={email}
        onChangeText={setEmail}
        placeholder={t('E-Mail')}
        placeholderTextColor={Colors.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
        accessibilityLabel={t('E-Mail')}
      />
      <TextField maxFontSizeMultiplier={1.2}
        value={pw}
        onChangeText={setPw}
        placeholder={t('Passwort, mindestens 8 Zeichen')}
        placeholderTextColor={Colors.muted}
        secureTextEntry
        autoComplete="password"
        style={styles.input}
        accessibilityLabel={t('Passwort')}
      />
      {err && <AppText style={styles.error}>{err}</AppText>}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={() => run(signIn)} style={[styles.primary, styles.grow, !ready && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{t('Anmelden')}</AppText>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: Colors.signalTint, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.s },
  noticeTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.danger },
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
  version: { alignSelf: 'center', fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.faint },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  disabled: { opacity: 0.4 },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
});

/** Sprache der App (Koray 16.11.): folgt dem iPhone, hier selbst festlegen. Ein Wechsel startet die App neu. */
function LanguageRow() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const chosen = chosenLang();
  const label = chosen ? LANGS.find((l) => l.id === chosen)?.label : `${t('Wie das iPhone')} (${LANGS.find((l) => l.id === lang)?.label})`;
  const pick = (next: Lang | null) => {
    if (next === chosen) return;
    setLang(next);
    showToast(t('Die App startet neu, damit alle Texte wechseln.'));
    setTimeout(() => void restartApp(), 900);
  };
  return (
    <>
      <Row title={t('Sprache')} value={label} onPress={() => setOpen(true)} />
      <ActionSheet
        visible={open}
        title={t('Sprache')}
        onClose={() => setOpen(false)}
        items={[
          { key: 'auto', icon: chosen === null ? 'checkmark' : 'iphone', label: t('Wie das iPhone'), onPress: () => pick(null) },
          ...LANGS.map((l) => ({ key: l.id, icon: (chosen === l.id ? 'checkmark' : 'globe') as 'checkmark' | 'globe', label: l.label, onPress: () => pick(l.id) })),
        ]}
      />
    </>
  );
}

async function restartApp() {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }
  try {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
  } catch {
    // im Entwicklungsmodus ohne Updates: die Texte wechseln beim nächsten Start
  }
}
