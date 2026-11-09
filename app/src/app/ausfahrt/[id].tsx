/**
 * Ausfahrt im Detail (Konzept Koray 9.11.): Abfahrt, Ankunft, Treffpunkt, Strecke und Teilnehmer.
 * Eine Hauptaktion je Zustand: Mitfahren anfragen (klappt mit Nachricht auf), Chat öffnen für
 * Teilnehmer und Organisator, am Tag Gruppenfahrt starten. Der Organisator sieht offene Anfragen
 * mit Profil und nimmt an oder lehnt ab.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, DateBlock } from '@/components/community/ride-bits';
import { RoutePreview } from '@/components/planner/route-preview';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import {
  answerAnfrage, arrival, ausfahrtTeilnehmer, ausfahrtTour, cancelAusfahrt, clock, freeSeats, listAnfragen,
  listAusfahrten, longDate, monthYear, requestAusfahrt, withdrawAusfahrt, type Anfrage, type Ausfahrt, type Teilnehmer,
} from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { myVehicleLabel, rideAlong, startAsLead } from '@/lib/group/start';
import { useRide } from '@/lib/group/ride';
import { setRideStatus } from '@/lib/group/invites';
import { formatKm, type Profile, type Tour } from '@/lib/tour';

type Full = { tour: Tour & { minutes?: number }; profile: Profile };

export default function AusfahrtDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const ride = useRide();
  const [a, setA] = useState<Ausfahrt | null | undefined>(undefined);
  const [full, setFull] = useState<Full | null>(null);
  const [members, setMembers] = useState<Teilnehmer[]>([]);
  const [requests, setRequests] = useState<Anfrage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const all = await listAusfahrten();
      const found = all.find((x) => x.id === id) ?? null;
      setA(found);
      if (!found) return;
      setMembers(await ausfahrtTeilnehmer(id));
      if (found.isOwner) setRequests(await listAnfragen(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setA((x) => x ?? null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => {
        setNow(Date.now());
        void load();
      }, 30000);
      return () => clearInterval(t);
    }, [load]),
  );

  useEffect(() => {
    if (!id) return;
    ausfahrtTour(id)
      .then(setFull)
      .catch(() => undefined);
  }, [id]);

  // Bestätigen klappt nach 3 s zurück (Prinzip 2)
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/community'));

  if (a === undefined) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.muted} />
      </View>
    );
  }
  if (a === null) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + Spacing.s, paddingHorizontal: Spacing.xl, gap: Spacing.l }]}>
        <BackButton onPress={back} />
        <AppText variant="display">Ausfahrt</AppText>
        <AppText muted>{session ? 'Diese Ausfahrt gibt es nicht mehr.' : 'Melde dich an, um Ausfahrten zu sehen.'}</AppText>
        {err && <AppText style={styles.error}>{err}</AppText>}
      </View>
    );
  }

  const arr = arrival(a);
  const free = freeSeats(a);
  const startsSoon = a.startsAt.getTime() - now < 2 * 3600000;
  const inThisRide = ride.rideId === a.id && (ride.status === 'aktiv' || ride.status === 'verbinde');
  const joined = a.isOwner || a.myStatus === 'zugesagt';
  const meetingName = a.meeting?.name || 'Start der Tour';

  const openMaps = () => {
    const p = a.meeting ? [a.meeting.lat, a.meeting.lon] : a.start;
    if (!p) return;
    void Linking.openURL(`https://maps.apple.com/?daddr=${p[0]},${p[1]}&q=${encodeURIComponent(meetingName)}`);
  };

  const startGroup = () =>
    run('start', async () => {
      if (a.isOwner) {
        if (!full) throw new Error('Die Tour lädt noch, bitte gleich nochmal.');
        await setRideStatus(a.id, 'laeuft');
        await startAsLead(a.id, a.name, { ...full.tour, name: a.name }, full.profile);
      } else {
        await rideAlong(a.id);
      }
      router.push('/navigation');
    });

  /** Hauptaktion je Zustand */
  let main: { label: string; onPress: () => void; disabled?: boolean } | null = null;
  if (inThisRide) main = { label: 'Zur Navigation', onPress: () => router.push('/navigation') };
  else if (joined && (startsSoon || a.rideStatus === 'laeuft') && (a.isOwner || a.rideStatus === 'laeuft'))
    main = { label: a.isOwner ? 'Gruppenfahrt starten' : 'Jetzt mitfahren', onPress: () => void startGroup() };
  else if (joined) main = { label: 'Chat öffnen', onPress: () => router.push({ pathname: '/ausfahrt/chat', params: { id: a.id } }) };
  else if (!a.myStatus && free > 0 && !asking) main = { label: 'Mitfahren anfragen', onPress: () => setAsking(true) };
  else if (asking) main = { label: 'Anfrage senden', onPress: () => void run('ask', async () => { await requestAusfahrt(a.id, msg, myVehicleLabel() || null); setAsking(false); }) };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.s, paddingBottom: Spacing.xxxl }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={styles.topRow}>
          <BackButton onPress={back} />
          <View style={styles.flex} />
          {joined && main?.label !== 'Chat öffnen' && (
            <Pressable accessibilityRole="button" accessibilityLabel="Chat öffnen" hitSlop={4} onPress={() => router.push({ pathname: '/ausfahrt/chat', params: { id: a.id } })} style={styles.roundBtn}>
              <SymbolView name="bubble.left.and.bubble.right" size={18} weight="semibold" tintColor={Colors.text} />
            </Pressable>
          )}
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.row}>
            <AppText style={styles.kicker}>Ausfahrt</AppText>
            <View style={[styles.tag, free > 0 ? styles.tagGood : styles.tagMuted]}>
              <AppText style={[styles.tagText, { color: free > 0 ? Colors.good : Colors.muted }]}>{free > 0 ? `${free} von ${a.maxMembers - 1} Plätzen frei` : 'Ausgebucht'}</AppText>
            </View>
          </View>
          <AppText variant="display">{a.name}</AppText>
        </View>

        <View style={styles.fields}>
          <View style={styles.field}>
            <DateBlock d={a.startsAt} />
            <View style={styles.flex}>
              <AppText style={styles.label}>Abfahrt</AppText>
              <AppText style={styles.value}>{longDate(a.startsAt)}, {clock(a.startsAt)}</AppText>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityHint="Öffnet den Treffpunkt in Karten" onPress={openMaps} style={styles.fieldPlain}>
            <View style={styles.flex}>
              <AppText style={styles.label}>Treffpunkt</AppText>
              <AppText style={styles.value}>{meetingName}</AppText>
            </View>
            <SymbolView name="arrow.triangle.turn.up.right.circle" size={22} weight="semibold" tintColor={Colors.muted} />
          </Pressable>
          {arr && (
            <View style={styles.fieldPlain}>
              <View style={styles.flex}>
                <AppText style={styles.label}>{a.roundTrip ? 'Zurück am Start' : 'Ankunft'}</AppText>
                <AppText style={styles.value}>
                  etwa {clock(arr)}
                  {!a.roundTrip && a.goalName ? ` in ${a.goalName}` : ''}
                </AppText>
              </View>
            </View>
          )}
        </View>

        {full && (
          <View style={styles.preview}>
            <RoutePreview tour={full.tour} height={180} />
          </View>
        )}

        <View style={styles.metrics}>
          {a.km != null && <Metric label="Strecke" value={`${formatKm(a.km, 0)} KM`} />}
          {a.minutes != null && <Metric label="Fahrzeit" value={`${Math.floor(a.minutes / 60)}:${String(a.minutes % 60).padStart(2, '0')} H`} />}
          <Metric label="Dabei" value={`${a.taken}`} />
        </View>

        {a.note ? (
          <View style={styles.note}>
            <AppText style={styles.label}>Hinweis vom Organisator</AppText>
            <AppText>{a.note}</AppText>
          </View>
        ) : null}

        {a.isOwner && requests.length > 0 && (
          <View style={styles.section}>
            <AppText variant="title">{requests.length === 1 ? 'Neue Anfrage' : `${requests.length} neue Anfragen`}</AppText>
            {requests.map((r) => (
              <Animated.View key={r.userId} entering={FadeIn.duration(Motion.enter)} exiting={FadeOut.duration(180)} layout={LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)} style={styles.request}>
                <View style={styles.row}>
                  <Avatar name={r.name} />
                  <View style={styles.flex}>
                    <AppText style={styles.name}>{r.name}</AppText>
                    <AppText variant="caption" muted numberOfLines={2}>
                      {[r.memberSince ? `Dabei seit ${monthYear(r.memberSince)}` : null, r.drives ? `${r.drives} Fahrten` : null, r.driveKm ? `${formatKm(r.driveKm, 0)} km` : null].filter(Boolean).join('  ·  ') || 'Neu bei CUMO DRIVE'}
                    </AppText>
                  </View>
                </View>
                {r.vehicle ? (
                  <View style={styles.car}>
                    <SymbolView name="car.side" size={16} weight="semibold" tintColor={Colors.muted} />
                    <AppText style={styles.carText}>{r.vehicle}</AppText>
                  </View>
                ) : null}
                {r.message ? <AppText style={styles.message}>{r.message}</AppText> : null}
                <View style={styles.row}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${r.name} ablehnen`} onPress={() => void run(`no-${r.userId}`, () => answerAnfrage(a.id, r.userId, false))} style={[styles.secondary, styles.flex]}>
                    {busy === `no-${r.userId}` ? <ActivityIndicator color={Colors.muted} /> : <AppText style={styles.secondaryText}>Ablehnen</AppText>}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${r.name} annehmen`} disabled={free === 0} onPress={() => void run(`yes-${r.userId}`, () => answerAnfrage(a.id, r.userId, true))} style={[styles.primary, styles.flex, free === 0 && styles.disabled]}>
                    {busy === `yes-${r.userId}` ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Annehmen</AppText>}
                  </Pressable>
                </View>
              </Animated.View>
            ))}
            <AppText variant="caption" muted>Nach dem Annehmen ist der Fahrer im Chat und bei der Gruppenfahrt dabei.</AppText>
          </View>
        )}

        <View style={styles.section}>
          <AppText variant="title">Dabei</AppText>
          {members.map((m) => (
            <View key={m.userId} style={styles.member}>
              <Avatar name={m.name} />
              <View style={styles.flex}>
                <AppText style={styles.name}>{m.name}{session?.user.id === m.userId ? ' (du)' : ''}</AppText>
                <AppText variant="caption" muted numberOfLines={1}>{[m.isOwner ? 'organisiert' : null, m.vehicle].filter(Boolean).join('  ·  ') || 'Mitfahrer'}</AppText>
              </View>
            </View>
          ))}
        </View>

        {asking && (
          <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.section}>
            <AppText style={styles.label}>Nachricht an {a.ownerName} (optional)</AppText>
            <TextInput
              value={msg}
              onChangeText={setMsg}
              placeholder="Kurz zu dir und deinem Auto"
              placeholderTextColor={Colors.muted}
              multiline
              maxLength={300}
              autoFocus
              style={[styles.input, styles.inputMulti]}
              accessibilityLabel="Nachricht an den Organisator"
            />
          </Animated.View>
        )}

        {!a.isOwner && a.myStatus === 'angefragt' && (
          <View style={styles.info}>
            <AppText variant="title">Anfrage gesendet</AppText>
            <AppText muted>{a.ownerName} entscheidet. Sobald du angenommen bist, siehst du es hier und kannst im Chat schreiben.</AppText>
          </View>
        )}
        {!a.isOwner && a.myStatus === 'abgelehnt' && (
          <View style={styles.info}>
            <AppText variant="title">Diesmal nicht dabei</AppText>
            <AppText muted>{a.ownerName} hat deine Anfrage abgelehnt.</AppText>
          </View>
        )}
        {!joined && !a.myStatus && free === 0 && <AppText muted>Diese Ausfahrt ist ausgebucht.</AppText>}

        {err && <AppText style={styles.error}>{err}</AppText>}

        {main && (
          <Pressable accessibilityRole="button" onPress={main.onPress} disabled={!!busy} style={styles.primary}>
            {busy === 'ask' || busy === 'start' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{main.label}</AppText>}
          </Pressable>
        )}
        {asking && (
          <Pressable accessibilityRole="button" onPress={() => setAsking(false)} style={styles.textBtn}>
            <AppText style={styles.textBtnText}>Abbrechen</AppText>
          </Pressable>
        )}

        {(a.myStatus === 'angefragt' || (a.myStatus === 'zugesagt' && !a.isOwner) || a.isOwner) && !inThisRide && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              setConfirm(false);
              void run('cancel', async () => {
                if (a.isOwner) {
                  await cancelAusfahrt(a.id);
                  back();
                } else await withdrawAusfahrt(a.id);
              });
            }}
            style={[styles.textBtn, confirm && styles.confirm]}>
            {busy === 'cancel' ? (
              <ActivityIndicator color={Colors.stopText} />
            ) : (
              <AppText style={[styles.textBtnText, confirm && styles.confirmText]}>
                {confirm ? 'Wirklich? Nochmal tippen' : a.isOwner ? 'Ausfahrt absagen' : a.myStatus === 'angefragt' ? 'Anfrage zurückziehen' : 'Doch nicht mitfahren'}
              </AppText>
            )}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Zurück" hitSlop={4} onPress={onPress} style={styles.roundBtn}>
      <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={Colors.text} />
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText style={styles.metricValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.xl },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  roundBtn: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  kicker: { flex: 1, fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.muted },
  tag: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  tagGood: { backgroundColor: Colors.goodTint },
  tagMuted: { backgroundColor: Colors.surface2 },
  tagText: { fontFamily: Fonts.bold, fontSize: Type.caption },
  fields: { gap: Spacing.s },
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.m },
  fieldPlain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.m, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, minHeight: 60 },
  label: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  value: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  preview: { borderRadius: Radius.l, overflow: 'hidden', backgroundColor: Colors.surface },
  metrics: { flexDirection: 'row', gap: Spacing.xxl },
  metric: { gap: 2 },
  metricValue: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, fontVariant: ['tabular-nums'] },
  note: { gap: Spacing.xs, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  section: { gap: Spacing.m },
  request: { gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  car: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, backgroundColor: Colors.surface2, borderRadius: Radius.m, paddingHorizontal: Spacing.m, height: 44 },
  carText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  message: { fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: Leading.body, color: Colors.text, opacity: 0.9 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 52 },
  name: { fontFamily: Fonts.bold, fontSize: Type.title },
  info: { gap: Spacing.xs, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  input: { minHeight: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  inputMulti: { minHeight: 96, paddingTop: Spacing.m, textAlignVertical: 'top' },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.button },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.bold, fontSize: Type.button },
  disabled: { opacity: 0.4 },
  textBtn: { height: Size.chip, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: Spacing.xl },
  textBtnText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  confirm: { backgroundColor: Colors.signalTint },
  confirmText: { color: Colors.stopText, fontFamily: Fonts.bold },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
