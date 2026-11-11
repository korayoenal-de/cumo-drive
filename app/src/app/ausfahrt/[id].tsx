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
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import {
  answerAnfrage, arrival, ausfahrtTeilnehmer, ausfahrtTour, cancelAusfahrt, clock, freeSeats, listAnfragen,
  listAusfahrten, longDate, monthYear, requestAusfahrt, withdrawAusfahrt, type Anfrage, type Ausfahrt, type Teilnehmer,
} from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { myVehicleLabel, rideAlong, startAsLead } from '@/lib/group/start';
import { useRide } from '@/lib/group/ride';
import { inviteToRide, removeFromRide, respondInvite, rideOverview, setRideStatus, type RideMemberRow } from '@/lib/group/invites';
import { findProfiles, type FoundProfile } from '@/lib/profile';
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
  const [invited, setInvited] = useState<RideMemberRow[]>([]);
  const [inviting, setInviting] = useState(false);
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
      if (found.isOwner) {
        setRequests(await listAnfragen(id));
        setInvited((await rideOverview(id)).filter((m) => m.status === 'eingeladen'));
      }
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


  /** Führt eine Aktion aus, lädt danach neu; true bei Erfolg */
  const run = async (key: string, fn: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    setErr(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
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
  else if (a.myStatus === 'eingeladen') main = { label: 'Zusagen', onPress: () => void run('yes', () => respondInvite(a.id, true, myVehicleLabel() || null)) };
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
          {a.isOwner &&
            invited.map((m) => (
              <Animated.View key={m.userId} entering={FadeIn.duration(Motion.enter)} exiting={FadeOut.duration(180)} style={styles.member}>
                <Avatar name={m.name} />
                <View style={styles.flex}>
                  <AppText style={styles.name}>{m.name}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>{m.vehicle ?? 'Fahrer'}</AppText>
                </View>
                <View style={[styles.tag, styles.tagWarn]}>
                  <AppText style={[styles.tagText, { color: Colors.warn }]}>Eingeladen</AppText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Einladung an ${m.name} zurücknehmen`} hitSlop={4} onPress={() => void run(`rm-${m.userId}`, () => removeFromRide(a.id, m.userId))} style={styles.smallRound}>
                  {busy === `rm-${m.userId}` ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name="xmark" size={13} weight="bold" tintColor={Colors.muted} />}
                </Pressable>
              </Animated.View>
            ))}
          {a.isOwner && free > 0 && !inviting && (
            <Pressable accessibilityRole="button" onPress={() => setInviting(true)} style={styles.inviteBtn}>
              <SymbolView name="person.badge.plus" size={18} weight="semibold" tintColor={Colors.text} />
              <AppText style={styles.secondaryText}>Mitglieder einladen</AppText>
            </Pressable>
          )}
          {a.isOwner && inviting && (
            <InviteBox
              exclude={new Set([...members.map((m) => m.userId), ...invited.map((m) => m.userId), ...requests.map((r) => r.userId)])}
              onInvite={(p) => run(`inv-${p.id}`, () => inviteToRide(a.id, p.id))}
              busyId={busy?.startsWith('inv-') ? busy.slice(4) : null}
              onClose={() => setInviting(false)}
            />
          )}
        </View>

        {asking && (
          <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.section}>
            <AppText style={styles.label}>Nachricht an {a.ownerName} (optional)</AppText>
            <TextInput maxFontSizeMultiplier={1.2}
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

        {!a.isOwner && a.myStatus === 'eingeladen' && (
          <View style={styles.info}>
            <AppText variant="title">Du bist eingeladen</AppText>
            <AppText muted>{a.ownerName} hat dich zu dieser Ausfahrt eingeladen. Sag zu, dann bist du im Chat und fährst am Tag mit.</AppText>
          </View>
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
            {busy === 'ask' || busy === 'start' || busy === 'yes' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{main.label}</AppText>}
          </Pressable>
        )}
        {asking && (
          <Pressable accessibilityRole="button" onPress={() => setAsking(false)} style={styles.textBtn}>
            <AppText style={styles.textBtnText}>Abbrechen</AppText>
          </Pressable>
        )}

        {(a.myStatus === 'angefragt' || a.myStatus === 'eingeladen' || (a.myStatus === 'zugesagt' && !a.isOwner) || a.isOwner) && !inThisRide && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirm(true)}
            style={styles.textBtn}>
            {busy === 'cancel' ? (
              <ActivityIndicator color={Colors.stopText} />
            ) : (
              <AppText style={styles.textBtnText}>
                {a.isOwner ? 'Ausfahrt absagen' : a.myStatus === 'angefragt' ? 'Anfrage zurückziehen' : a.myStatus === 'eingeladen' ? 'Absagen' : 'Doch nicht mitfahren'}
              </AppText>
            )}
          </Pressable>
        )}
      </ScrollView>
      {/* Rückfrage als Blatt wie überall (Prüfung 11.11.) */}
      <ConfirmSheet
        visible={confirm}
        title={a.isOwner ? 'Möchtest du diese Ausfahrt wirklich absagen?' : a.myStatus === 'angefragt' ? 'Möchtest du deine Anfrage wirklich zurückziehen?' : a.myStatus === 'eingeladen' ? 'Möchtest du die Einladung wirklich absagen?' : 'Möchtest du wirklich nicht mehr mitfahren?'}
        text={a.isOwner ? 'Alle, die zugesagt haben, sehen die Ausfahrt dann als abgesagt.' : undefined}
        confirmLabel={a.isOwner ? 'Absagen' : a.myStatus === 'angefragt' ? 'Zurückziehen' : 'Absagen'}
        onConfirm={() =>
          void run('cancel', async () => {
            if (a.isOwner) {
              await cancelAusfahrt(a.id);
              back();
            } else if (a.myStatus === 'eingeladen') await respondInvite(a.id, false);
            else await withdrawAusfahrt(a.id);
          })
        }
        onClose={() => setConfirm(false)}
      />
    </View>
  );
}

/** Mitglieder per Name einladen: Suche klappt inline auf, Treffer antippen lädt ein */
function InviteBox({ exclude, onInvite, busyId, onClose }: { exclude: Set<string>; onInvite: (p: FoundProfile) => Promise<boolean>; busyId: string | null; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundProfile[]>([]);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const t = setTimeout(() => {
      findProfiles(q)
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const shown = q.trim().length >= 2 ? found.filter((p) => !exclude.has(p.id) || done.has(p.id)) : [];
  return (
    <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.inviteBox}>
      <View style={styles.row}>
        <TextInput maxFontSizeMultiplier={1.2}
          value={q}
          onChangeText={setQ}
          placeholder="Name eines Fahrers"
          placeholderTextColor={Colors.muted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.inputOnSurface, styles.flex]}
          accessibilityLabel="Fahrer zum Einladen suchen"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Einladen schließen" hitSlop={4} onPress={onClose} style={styles.roundBtn}>
          <SymbolView name="xmark" size={14} weight="bold" tintColor={Colors.text} />
        </Pressable>
      </View>
      {q.trim().length >= 2 && shown.length === 0 && <AppText variant="caption" muted>Kein Fahrer mit diesem Namen.</AppText>}
      {shown.map((p) => {
        const sent = done.has(p.id);
        return (
          <View key={p.id} style={styles.member}>
            <Avatar name={p.displayName} size={36} />
            <View style={styles.flex}>
              <AppText style={styles.name}>{p.displayName}</AppText>
              {p.car ? <AppText variant="caption" muted numberOfLines={1}>{p.car}</AppText> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={sent ? `${p.displayName} eingeladen` : `${p.displayName} einladen`}
              disabled={sent || !!busyId}
              onPress={() =>
                void onInvite(p).then((ok) => ok && setDone((d) => new Set(d).add(p.id)))
              }
              style={[styles.invitePill, sent && styles.invitePillDone]}>
              {busyId === p.id ? <ActivityIndicator color={Colors.ground} /> : <AppText style={[styles.invitePillText, sent && styles.invitePillTextDone]}>{sent ? 'Eingeladen' : 'Einladen'}</AppText>}
            </Pressable>
          </View>
        );
      })}
      <AppText variant="caption" muted>Eingeladene sehen die Einladung in der App und sagen zu oder ab.</AppText>
    </Animated.View>
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
  tagWarn: { backgroundColor: Colors.warnTint },
  smallRound: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.s, height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  inputOnSurface: { backgroundColor: Colors.surface2 },
  inviteBox: { gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  invitePill: { height: 44, minWidth: 96, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center' },
  invitePillDone: { backgroundColor: Colors.goodTint },
  invitePillText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.ground },
  invitePillTextDone: { color: Colors.good },
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
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
