/**
 * Ausfahrt im Detail (Konzept Koray 9.11.): Abfahrt, Ankunft, Treffpunkt, Strecke und Teilnehmer.
 * Eine Hauptaktion je Zustand: Mitfahren anfragen (klappt mit Nachricht auf), Chat öffnen für
 * Teilnehmer und Organisator, am Tag Gruppenfahrt starten. Der Organisator sieht offene Anfragen
 * mit Profil und nimmt an oder lehnt ab.
 */
import { BackLink } from '@/components/ui/back-link';
import { Kennzahlen, SeatsBadge } from '@/components/ui/kennzahlen';
import { useRideFun } from '@/lib/ride-fun';
import { saveTour, syncLibrary } from '@/lib/library';
import { supabase } from '@/lib/supabase';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, DateBlock } from '@/components/community/ride-bits';
import { RoutePreview } from '@/components/planner/route-preview';
import { ReportSheet } from '@/components/moderation/report-sheet';
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { AddButton } from '@/components/ui/add-button';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import {
  answerAnfrage, arrival, ausfahrtTeilnehmer, ausfahrtTour, cancelAusfahrt, clock, freeSeats, listAnfragen,
  listAusfahrten, longDate, monthYear, requestAusfahrt, sendNachricht, withdrawAusfahrt, ausfahrtAbsagen, rideByLink, rideLink, type Absage, type Anfrage, type Ausfahrt, type LinkedRide, type Teilnehmer,
} from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { here, MeetingRoute, navigateToMeeting } from '@/components/group/meeting-route';
import { ActionSheet, type SheetItem } from '@/components/ui/action-sheet';
import { reverseName } from '@/lib/geocode';
import { changeRide, checkArrived, DAY_BEFORE_MS, giveLead, pingMember, rideDay, START_WINDOW_MS, startRideNow, startSharing, stopSharing, TAKE_LEAD_AFTER_MS, takeLead, type DayRow } from '@/lib/ride-day';
import { refreshContacts, useContacts, type Contact } from '@/lib/contacts';
import { myVehicleLabel, rideAlong, startAsLead } from '@/lib/group/start';
import { useRide } from '@/lib/group/ride';
import { declineInvite, inviteToRide, removeFromRide, respondInvite, rideOverview, setRideTour, type RideMemberRow } from '@/lib/group/invites';
import { useClosedCheck } from '@/components/tours/closed-sheet';
import { showToast } from '@/lib/toast';
import { findProfiles, type FoundProfile } from '@/lib/profile';
import { formatKm, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { t, tr } from '@/i18n';

/** Platz unter dem Inhalt für die feste Leiste unten */
const BAR_SPACE = 96;

type Full = { tour: Tour & { minutes?: number }; profile: Profile };

export default function AusfahrtDetail() {
  // k: Schlüssel aus einem Einladungslink einer privaten Ausfahrt (Koray 13.11.)
  // ping: aus der Mitteilung „fragt, wann du da bist“ (Gemeinsam losfahren, Koray 14.11.)
  const { id, k, ping } = useLocalSearchParams<{ id: string; k?: string; ping?: string }>();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const ride = useRide();
  const [a, setA] = useState<Ausfahrt | null | undefined>(undefined);
  const [linked, setLinked] = useState<LinkedRide | null>(null);
  const [full, setFull] = useState<Full | null>(null);
  // Gerade gesperrt beim Start als Lead (Koray 16.11.): warnen, die Umfahrung gilt für die ganze Gruppe
  const closed = useClosedCheck();
  const [members, setMembers] = useState<Teilnehmer[]>([]);
  const [invited, setInvited] = useState<RideMemberRow[]>([]);
  const [inviting, setInviting] = useState(false);
  const [requests, setRequests] = useState<Anfrage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  /** Fehler beim Laden; sichtbar nur, solange die Ausfahrt noch nicht da ist */
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(false);
  const [declines, setDeclines] = useState<Absage[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // Gemeinsam losfahren (Koray 14.11.): Stand am Tag und die Blätter für Aktionen
  const [day, setDay] = useState<DayRow[]>([]);
  const [more, setMore] = useState(false);
  const [person, setPerson] = useState<{ userId: string; name: string; invited: boolean } | null>(null);
  const [timeSheet, setTimeSheet] = useState(false);
  const [placeSheet, setPlaceSheet] = useState(false);
  const [startAsk, setStartAsk] = useState(false);
  const [pingOpen, setPingOpen] = useState(ping === '1');
  const [leadSheet, setLeadSheet] = useState(false);
  // Ohne gewählten Treffpunkt: Ortsname des Tourstarts statt „Start der Tour“ (Koray 15.11.)
  const [startName, setStartName] = useState<string | null>(null);
  // Einladen (TestFlight Review 13.11.): das Feld rollt nach oben, darunter bleibt Platz für vier bis fünf Vorschläge
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const sectionY = useRef(0);
  const winH = useWindowDimensions().height;
  const contacts = useContacts();
  useEffect(() => {
    if (inviting) void refreshContacts();
  }, [inviting]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const all = await listAusfahrten();
      const found = all.find((x) => x.id === id) ?? null;
      setA(found);
      setLoadErr(null);
      if (!found) {
        if (k) setLinked(await rideByLink(id, k).catch(() => null));
        return;
      }
      setMembers(await ausfahrtTeilnehmer(id));
      // am Tag: wer ist da, wer kommt wann; "da" meldet die eigene App ohne Standort zu teilen
      const joinedNow = found.isOwner || found.myStatus === 'zugesagt';
      if (joinedNow && found.rideStatus === 'geplant' && found.startsAt.getTime() - Date.now() < DAY_BEFORE_MS) {
        const meet: LatLon | null = found.meeting ? [found.meeting.lat, found.meeting.lon] : found.start;
        if (meet) await checkArrived(id, meet).catch(() => false);
        setDay(await rideDay(id).catch(() => []));
      }
      if (found.isOwner) {
        setRequests(await listAnfragen(id));
        setInvited((await rideOverview(id)).filter((m) => m.status === 'eingeladen'));
        setDeclines(await ausfahrtAbsagen(id));
      }
    } catch (e) {
      // Stilles Neuladen alle 30 s (Koray 15.11.): steht die Ausfahrt schon da, bleibt ein abgebrochener
      // Abruf unsichtbar; nur wenn noch nichts geladen ist, zeigen wir einen verständlichen Hinweis
      setLoadErr(friendly(e));
      setA((x) => x ?? null);
    }
  }, [id, k]);

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

  // Ort zum Treffpunkt: aus dem Treffpunkt selbst, sonst aus dem Start der Tour
  const startKey = a && a.meeting && !a.meeting.name ? `${a.meeting.lat},${a.meeting.lon}` : a && a.start ? `${a.start[0]},${a.start[1]}` : null;
  useEffect(() => {
    if (!startKey) return;
    const [la, lo] = startKey.split(',').map(Number);
    let live = true;
    reverseName([la, lo])
      .then((n) => live && n !== 'Standort' && setStartName(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [startKey]);

  const funScore = useRideFun(id);

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

  // Auto folgt der Garage bis zum Start (Koray 14.11.): steht in der Ausfahrt ein anderes als das gewählte, nachtragen
  const myVehicleNow = myVehicleLabel();
  const myRowVehicle = members.find((m) => m.userId === session?.user.id)?.vehicle ?? null;
  const vehicleStale = !!a && a.rideStatus === 'geplant' && !!myVehicleNow && members.some((m) => m.userId === session?.user.id) && myRowVehicle !== myVehicleNow;
  useEffect(() => {
    if (!vehicleStale || !a) return;
    void supabase
      .rpc('ride_set_vehicle', { ride: a.id, my_vehicle: myVehicleNow })
      .then(({ error }) => {
        if (!error) void load();
      });
    // nur wenn sich das Auto unterscheidet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleStale, a?.id, myVehicleNow]);

  if (a === undefined) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={Colors.muted} />
      </View>
    );
  }
  if (a === null && linked) {
    // Einladungslink: Eckdaten und Anfrage; der Organisator nimmt an (Koray 13.11.)
    return (
      <View style={[styles.root, { paddingTop: insets.top + Spacing.s, paddingHorizontal: Spacing.xl, gap: Spacing.l }]}>
        <BackLink onPress={back} />
        <AppText style={styles.kicker}>{linked.ownerName}{tr(' lädt dich ein')}</AppText>
        <AppText variant="display">{linked.name}</AppText>
        <AppText style={styles.value}>{longDate(linked.startsAt)}, {clock(linked.startsAt)}{linked.km ? `  ·  ${formatKm(linked.km, 0)} km` : ''}</AppText>
        {linked.free > 0 ? (
          <>
            <TextInput maxFontSizeMultiplier={1.2}
              value={msg}
              onChangeText={setMsg}
              placeholder={tr('Nachricht an {ownerName} (optional)', { ownerName: linked.ownerName })}
              placeholderTextColor={Colors.muted}
              multiline
              maxLength={300}
              style={[styles.input, styles.inputMulti]}
              accessibilityLabel={tr('Nachricht an {ownerName}', { ownerName: linked.ownerName })}
            />
            <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('ask', () => requestAusfahrt(linked.id, msg, myVehicleLabel() || null, k ?? null))} style={styles.primary}>
              {busy === 'ask' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{t('Mitfahren anfragen')}</AppText>}
            </Pressable>
            <AppText variant="caption" muted>{linked.ownerName}{tr(' bestätigt deine Anfrage. Danach siehst du Tour, Treffpunkt und wer dabei ist.')}</AppText>
          </>
        ) : (
          <AppText muted>{t('Die Ausfahrt ist schon voll.')}</AppText>
        )}
        {(err ?? loadErr) && <AppText style={styles.error}>{err ?? loadErr}</AppText>}
      </View>
    );
  }
  if (a === null) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + Spacing.s, paddingHorizontal: Spacing.xl, gap: Spacing.l }]}>
        <BackLink onPress={back} />
        <AppText variant="display">{t('Ausfahrt')}</AppText>
        <AppText muted>{session ? tr('Diese Ausfahrt gibt es nicht mehr.') : tr('Melde dich an, um Ausfahrten zu sehen.')}</AppText>
        {(err ?? loadErr) && <AppText style={styles.error}>{err ?? loadErr}</AppText>}
      </View>
    );
  }

  const arr = arrival(a);
  const free = freeSeats(a);
  const inThisRide = ride.rideId === a.id && (ride.status === 'aktiv' || ride.status === 'verbinde');
  const joined = a.isOwner || a.myStatus === 'zugesagt';
  const meetingName = a.meeting?.name || startName || tr('Start der Tour');

  const meetAt: LatLon | null = a.meeting ? [a.meeting.lat, a.meeting.lon] : a.start;

  // Nochmal fahren (Koray 14.11.): gleiche Tour, gleicher Treffpunkt, dieselben Leute; nur das Datum fehlt
  const againRide = async () => {
    if (!full) {
      setErr(tr('Die Tour lädt noch, bitte gleich nochmal.'));
      return;
    }
    const saved = saveTour({ ...full.tour, name: a.name, profile: full.profile }, '');
    void syncLibrary();
    const others = members.filter((m) => m.userId !== session?.user.id).map((m) => m.userId);
    router.push({ pathname: '/ausfahrt/neu', params: { tour: saved.id, invite: others.join(','), meetingName: a.meeting?.name ?? '' } });
  };

  const startGroup = () => {
    if (isLead && a.rideStatus !== 'laeuft' && full) {
      void closed.check(full.tour, full.profile, undefined, (t, around) => launch(around ? t : null));
      return;
    }
    launch(null);
  };

  /** around: Umfahrung einer Sperrung statt der Tour der Ausfahrt */
  const launch = (around: Tour | null) =>
    run('start', async () => {
      await stopSharing();
      if (isLead && a.rideStatus !== 'laeuft') {
        if (!full) throw new Error(tr('Die Tour lädt noch, bitte gleich nochmal.'));
        if (around) {
          // Mitfahrer laden die Tour der Ausfahrt: die Umfahrung dort ablegen (darf nur der Organisator)
          try {
            await setRideTour(a.id, around, full.profile);
          } catch {
            showToast(t('Die Umfahrung gilt nur für dich, die anderen fahren wie geplant.'));
          }
        }
        await startRideNow(a.id);
        await startAsLead(a.id, a.name, { ...(around ?? full.tour), name: a.name }, full.profile);
      } else {
        await rideAlong(a.id);
      }
      router.push('/navigation');
    });

  // Wer leitet, wer ist da (Gemeinsam losfahren, Koray 14.11.)
  const me = session?.user.id ?? null;
  const isLead = a.isOwner || day.some((r) => r.userId === me && r.isLead);
  const dayMode = joined && a.rideStatus === 'geplant' && a.startsAt.getTime() - now < DAY_BEFORE_MS;
  const startOpen = now >= a.startsAt.getTime() - START_WINDOW_MS;
  const dayOf = (uid: string) => day.find((r) => r.userId === uid) ?? null;
  const missing = members.filter((m) => m.userId !== me && !dayOf(m.userId)?.arrived);
  const meArrived = !!(me && dayOf(me)?.arrived);
  const canTakeLead = !isLead && a.myStatus === 'zugesagt' && a.rideStatus === 'geplant' && now > a.startsAt.getTime() + TAKE_LEAD_AFTER_MS;
  const tryStart = () => (missing.length ? setStartAsk(true) : void startGroup());
  const openChat = () => router.push({ pathname: '/ausfahrt/chat', params: { id: a.id } });

  /** Eine Hauptaktion je Phase (Koray 14.11.): Einladen vorher, Jetzt losfahren am Tag, Navigation während der Fahrt */
  let main: { label: string; onPress: () => void; disabled?: boolean; hint?: string } | null = null;
  // Nach der Ausfahrt (Koray 14.11.): Rückblick statt Planung
  const over = a.isOver && !inThisRide;
  const drove = over && !!a.startedAt;
  if (over) {
    if (drove) main = { label: t('Nochmal fahren'), onPress: () => void againRide() };
    else if (a.isOwner) main = { label: t('Neuen Termin wählen'), onPress: () => setTimeSheet(true) };
  } else if (inThisRide) main = { label: t('Zur Navigation'), onPress: () => router.push('/navigation') };
  else if (joined && a.rideStatus === 'laeuft' && !isLead) main = { label: meArrived ? tr('Jetzt mitfahren') : tr('Aufschließen'), onPress: () => void startGroup() };
  else if (isLead && a.rideStatus === 'laeuft') main = { label: t('Jetzt losfahren'), onPress: () => void startGroup() };
  else if (isLead && dayMode)
    main = startOpen
      ? { label: t('Jetzt losfahren'), onPress: tryStart }
      : { label: t('Jetzt losfahren'), onPress: () => undefined, disabled: true, hint: tr('Ab {v0} möglich, 2 Stunden vor der Abfahrt', { v0: clock(new Date(a.startsAt.getTime() - START_WINDOW_MS)) }) };
  // Route zum Treffpunkt ist für alle Dabei die Hauptaktion, auch Tage vorher (Koray 15.11.: man kann früher los);
  // Einladen bleibt als Zeile bei den Teilnehmern
  else if (joined && meetAt) main = null;
  else if (a.isOwner && free > 0 && !inviting) main = { label: t('Einladen'), onPress: () => setInviting(true) };
  else if (joined) main = null;
  else if (a.myStatus === 'eingeladen') main = { label: t('Zusagen'), onPress: () => void run('yes', () => respondInvite(a.id, true, myVehicleLabel() || null)) };
  else if (!a.myStatus && free > 0 && !asking) main = { label: t('Mitfahren anfragen'), onPress: () => setAsking(true) };
  else if (asking) main = { label: t('Anfrage senden'), onPress: () => void run('ask', async () => { await requestAusfahrt(a.id, msg, myVehicleLabel() || null); setAsking(false); }) };

  // Ohne andere Hauptaktion ist die Route zum Treffpunkt die Hauptaktion, auch Tage vorher (Koray 15.11.)
  const routeMain = !main && !over && joined && !!meetAt && !inThisRide && !(meArrived && a.rideStatus === 'geplant');

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.s, paddingBottom: inviting ? winH * 0.6 : Spacing.xxxl + BAR_SPACE }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={styles.topRow}>
          <BackLink onPress={back} />
          <View style={styles.flex} />
          {joined && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('Chat öffnen')} hitSlop={4} onPress={openChat} style={styles.roundBtn}>
              <SymbolView name="bubble.left.and.bubble.right" size={20} weight="semibold" tintColor={Colors.text} />
            </Pressable>
          )}
          {/* Seltenes im Blatt (Koray 14.11.): Ändern, Lead, Absagen, Melden */}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Weitere Aktionen')} hitSlop={4} onPress={() => setMore(true)} style={styles.roundBtn}>
            <SymbolView name="ellipsis" size={20} weight="semibold" tintColor={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.titleBlock}>
          {over ? (
            <View style={[styles.tag, drove ? styles.tagGood : styles.tagWarn, styles.selfStart]}>
              <AppText style={[styles.tagText, { color: drove ? Colors.good : Colors.warn }]}>{drove ? tr('Gefahren') : tr('Nicht gestartet')}</AppText>
            </View>
          ) : (
            <AppText style={styles.kicker}>{a.isPublic ? tr('Ausfahrt') : tr('Private Ausfahrt')}</AppText>
          )}
          <AppText variant="display">{a.name}</AppText>
        </View>

        {/* Kennzahlen direkt unter dem Titel, Reihe wie im Planer (Konsistenzprüfung 15.11., K1, K4) */}
        <Kennzahlen
          km={a.km}
          minutes={drove && a.endedAt && a.startedAt ? Math.round((a.endedAt.getTime() - a.startedAt.getTime()) / 60000) : a.minutes}
          fun={funScore}
          extra={drove && members.length > 0 ? [{ label: t('Autos'), value: String(members.length) }] : []}
        />

        <View style={styles.fields}>
          <Pressable accessibilityRole="button" disabled={over || !isLead || a.rideStatus !== 'geplant'} accessibilityHint={isLead && !over ? tr('Abfahrt ändern') : undefined} onPress={() => setTimeSheet(true)} style={styles.field}>
            <DateBlock d={a.startedAt ?? a.startsAt} />
            <View style={styles.flex}>
              <AppText style={styles.label}>{drove ? tr('Gefahren') : over ? tr('Geplant für') : tr('Abfahrt')}</AppText>
              <AppText style={styles.value}>
                {longDate(a.startedAt ?? a.startsAt)}, {clock(a.startedAt ?? a.startsAt)}
                {drove && a.endedAt ? ` bis ${clock(a.endedAt)}` : ''}
              </AppText>
            </View>
            {!over && isLead && a.rideStatus === 'geplant' && <AppText style={styles.change}>{t('Ändern')}</AppText>}
          </Pressable>
          {over && !drove && (
            <View style={styles.fieldPlain}>
              <View style={styles.flex}>
                <AppText style={styles.value}>{t('Diese Ausfahrt hat nicht stattgefunden')}</AppText>
                <AppText style={styles.label}>
                  {a.isOwner ? tr('Niemand hat sie gestartet. Mit einem neuen Termin bekommen alle, die zugesagt hatten, eine Mitteilung.') : tr('Niemand hat sie gestartet.')}
                </AppText>
              </View>
            </View>
          )}
          <Pressable accessibilityRole="button" disabled={over || !isLead || a.rideStatus !== 'geplant'} accessibilityHint={isLead && !over ? tr('Treffpunkt ändern') : undefined} onPress={() => setPlaceSheet(true)} style={styles.fieldPlain}>
            <View style={styles.flex}>
              <AppText style={styles.label}>{t('Treffpunkt')}</AppText>
              <AppText style={styles.value}>{meetingName}</AppText>
            </View>
            {!over && isLead && a.rideStatus === 'geplant' && <AppText style={styles.change}>{t('Ändern')}</AppText>}
          </Pressable>
          {/* Anfahrt mit der eigenen Navigation, Schnell voreingestellt (Koray 14.11.) */}
          {/* Am Treffpunkt (Koray 14.11.): statt der Anfahrt groß zeigen, dass man da ist und wer noch fehlt */}
          {over ? null : joined && meArrived && a.rideStatus === 'geplant' && !inThisRide ? (
            <View style={styles.hereCard} accessibilityRole="summary">
              <View style={styles.hereIcon}>
                <SymbolView name="checkmark" size={20} weight="semibold" tintColor={Colors.ground} />
              </View>
              <View style={styles.flex}>
                <AppText style={styles.hereTitle}>{t('Du bist am Treffpunkt')}</AppText>
                <AppText style={styles.hereText}>
                  {members.filter((m) => dayOf(m.userId)?.arrived).length} von {members.length}{tr(' sind da')}
                </AppText>
              </View>
            </View>
          ) : (
            joined && meetAt && !inThisRide && !!main && <MeetingRoute to={meetAt} place={meetingName} />
          )}
          {/* Runde: keine Zeile „Wieder am Treffpunkt“ mehr (Koray 15.11.) */}
          {arr && !over && !a.roundTrip && (
            <View style={styles.fieldPlain}>
              <View style={styles.flex}>
                <AppText style={styles.label}>{t('Ankunft')}</AppText>
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

        {a.note ? (
          <View style={styles.note}>
            <AppText style={styles.label}>{t('Hinweis vom Organisator')}</AppText>
            <AppText>{a.note}</AppText>
          </View>
        ) : null}

        {a.isOwner && requests.length > 0 && (
          <View style={styles.section}>
            <AppText variant="title">{requests.length === 1 ? tr('Neue Anfrage') : tr('{length} neue Anfragen', { length: requests.length })}</AppText>
            {requests.map((r) => (
              <Animated.View key={r.userId} entering={FadeIn.duration(Motion.enter)} exiting={FadeOut.duration(180)} layout={LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)} style={styles.request}>
                <View style={styles.row}>
                  <Avatar name={r.name} userId={r.userId} />
                  <View style={styles.flex}>
                    <AppText style={styles.name}>{r.name}</AppText>
                    <AppText variant="caption" muted numberOfLines={2}>
                      {[r.memberSince ? tr('Dabei seit {v0}', { v0: monthYear(r.memberSince) }) : null, r.drives ? `${r.drives} Fahrten` : null, r.driveKm ? `${formatKm(r.driveKm, 0)} km` : null].filter(Boolean).join('  ·  ') || tr('Neu bei CUMO DRIVE')}
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
                    {busy === `no-${r.userId}` ? <ActivityIndicator color={Colors.muted} /> : <AppText style={styles.secondaryText}>{t('Ablehnen')}</AppText>}
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${r.name} annehmen`} disabled={free === 0} onPress={() => void run(`yes-${r.userId}`, () => answerAnfrage(a.id, r.userId, true))} style={[styles.primary, styles.flex, free === 0 && styles.disabled]}>
                    {busy === `yes-${r.userId}` ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{t('Annehmen')}</AppText>}
                  </Pressable>
                </View>
              </Animated.View>
            ))}
            <AppText variant="caption" muted>{t('Nach dem Annehmen ist der Fahrer im Chat und bei der Gruppenfahrt dabei.')}</AppText>
          </View>
        )}

        <View
          style={styles.section}
          onLayout={(e) => {
            sectionY.current = e.nativeEvent.layout.y;
          }}>
          {/* Plätze stehen bei den Teilnehmern, rechtsbündig; der letzte freie Platz in Gelb (Koray 14.11.) */}
          <View style={styles.row}>
            <AppText variant="title" style={styles.flex}>{t('Teilnehmer')}</AppText>
            {!over && <SeatsBadge free={free} />}
          </View>
          {members.map((m) => {
            const d = dayOf(m.userId);
            const self = me === m.userId;
            const pinged = d?.pingedAt && now - d.pingedAt.getTime() < 30 * 60000 ? Math.max(1, Math.round((now - d.pingedAt.getTime()) / 60000)) : null;
            const sub = [d?.isLead && !m.isOwner ? 'Lead' : m.isOwner ? 'Organisator' : null, dayMode && !d?.arrived && pinged ? tr('angepingt vor {pinged} min', { pinged }) : m.vehicle].filter(Boolean).join('  ·  ') || 'Mitfahrer';
            return (
              <Pressable key={m.userId} accessibilityRole="button" disabled={self} onPress={() => setPerson({ userId: m.userId, name: m.name, invited: false })} style={styles.member}>
                <Avatar name={m.name} userId={m.userId} />
                <View style={styles.flex}>
                  <AppText style={styles.name}>{m.name}{self ? ' (du)' : ''}</AppText>
                  <AppText variant="caption" muted numberOfLines={1}>{sub}</AppText>
                </View>
                {dayMode &&
                  (d?.arrived ? (
                    <AppText style={styles.here}>{t('Da')}</AppText>
                  ) : d?.etaMin != null ? (
                    <AppText style={styles.eta}>in {d.etaMin} min</AppText>
                  ) : isLead && !self ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`${m.name} anpingen`} onPress={() => void run(`ping-${m.userId}`, () => pingMember(a.id, m.userId))} style={styles.pingBtn}>
                      {busy === `ping-${m.userId}` ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name="bell" size={16} weight="semibold" tintColor={Colors.text} />}
                      <AppText style={styles.pingText}>{t('Anpingen')}</AppText>
                    </Pressable>
                  ) : null)}
              </Pressable>
            );
          })}
          {a.isOwner &&
            invited.map((m) => (
              <Animated.View key={m.userId} entering={FadeIn.duration(Motion.enter)} exiting={FadeOut.duration(180)}>
                <Pressable accessibilityRole="button" accessibilityHint={t('Optionen zur Einladung')} onPress={() => setPerson({ userId: m.userId, name: m.name, invited: true })} style={styles.member}>
                  <Avatar name={m.name} userId={m.userId} />
                  <View style={styles.flex}>
                    <AppText style={styles.name}>{m.name}</AppText>
                    <AppText variant="caption" muted numberOfLines={1}>{m.vehicle ?? tr('Fahrer')}</AppText>
                  </View>
                  <View style={[styles.tag, styles.tagWarn]}>
                    <AppText style={[styles.tagText, { color: Colors.warn }]}>{t('Eingeladen')}</AppText>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          {/* Absagen still, ohne Zahl (Koray 12.11.) */}
          {a.isOwner && declines.length > 0 && (
            <AppText variant="caption" muted>
              {declines.length === 1 ? '1 abgesagt: ' : `${declines.length} abgesagt: `}
              {declines.map((d) => (d.reason ? `${d.name} (${tr(d.reason)})` : d.name)).join(', ')}
            </AppText>
          )}
          {!over && a.isOwner && free > 0 && !inviting && (
            <Pressable accessibilityRole="button" onPress={() => setInviting(true)} style={styles.member}>
              <View style={styles.addCircle}>
                <SymbolView name="plus" size={20} weight="semibold" tintColor={Colors.text} />
              </View>
              <AppText style={styles.name}>{t('Teilnehmer einladen')}</AppText>
            </Pressable>
          )}
          {a.isOwner && inviting && (
            <InviteBox
              exclude={new Set([...members.map((m) => m.userId), ...invited.map((m) => m.userId), ...requests.map((r) => r.userId)])}
              onInvite={(p) => run(`inv-${p.id}`, () => inviteToRide(a.id, p.id))}
              busyId={busy?.startsWith('inv-') ? busy.slice(4) : null}
              contacts={(contacts.list ?? []).filter((c) => c.status === 'kontakt')}
              onPlaced={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, sectionY.current + y - insets.top - Size.button - Spacing.l), animated: true })}
              onClose={() => setInviting(false)}
              onLink={() =>
                void run('link', async () => {
                  const url = await rideLink(a.id);
                  await Share.share({ message: tr('{name}, {v1} um {v2}. Fahr mit, frag in CUMO DRIVE an: {url}', { name: a.name, v1: longDate(a.startsAt), v2: clock(a.startsAt), url }) });
                })
              }
            />
          )}
        </View>

        {asking && (
          <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.section}>
            <AppText style={styles.label}>{tr('Nachricht an ')}{a.ownerName} (optional)</AppText>
            <TextInput maxFontSizeMultiplier={1.2}
              value={msg}
              onChangeText={setMsg}
              placeholder={t('Kurz zu dir und deinem Auto')}
              placeholderTextColor={Colors.muted}
              multiline
              maxLength={300}
              autoFocus
              style={[styles.input, styles.inputMulti]}
              accessibilityLabel={t('Nachricht an den Organisator')}
            />
          </Animated.View>
        )}

        {!a.isOwner && a.myStatus === 'eingeladen' && (
          <View style={styles.info}>
            <AppText variant="title">{t('Du bist eingeladen')}</AppText>
            <AppText muted>{a.ownerName}{tr(' hat dich zu dieser Ausfahrt eingeladen. Sag zu, dann bist du im Chat und fährst am Tag mit.')}</AppText>
          </View>
        )}
        {!a.isOwner && a.myStatus === 'angefragt' && (
          <View style={styles.info}>
            <AppText variant="title">{t('Anfrage gesendet')}</AppText>
            <AppText muted>{a.ownerName}{tr(' entscheidet. Sobald du angenommen bist, siehst du es hier und kannst im Chat schreiben.')}</AppText>
          </View>
        )}
        {!a.isOwner && a.myStatus === 'abgelehnt' && (
          <View style={styles.info}>
            <AppText variant="title">{t('Diesmal nicht dabei')}</AppText>
            <AppText muted>{a.ownerName}{tr(' hat deine Anfrage abgelehnt.')}</AppText>
          </View>
        )}
        {!joined && !a.myStatus && free === 0 && <AppText muted>{t('Diese Ausfahrt ist ausgebucht.')}</AppText>}

        {err && <AppText style={styles.error}>{err}</AppText>}

        {asking && (
          <Pressable accessibilityRole="button" onPress={() => setAsking(false)} style={styles.textBtn}>
            <AppText style={styles.textBtnText}>{t('Abbrechen')}</AppText>
          </Pressable>
        )}

      </ScrollView>

      {/* Hauptaktion fest unten, eine je Phase (Konsistenzprüfung 15.11., O5): vorher Route zum Treffpunkt,
          am Tag Jetzt losfahren, während der Fahrt Zur Navigation, danach Nochmal fahren */}
      {(main || routeMain) && (
        <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.m }]}>
          {main ? (
            <>
              <Pressable accessibilityRole="button" onPress={main.onPress} disabled={!!busy || main.disabled} style={[styles.primary, main.disabled && styles.disabled]}>
                {busy === 'ask' || busy === 'start' || busy === 'yes' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{main.label}</AppText>}
              </Pressable>
              {main.hint && <AppText muted style={styles.center}>{main.hint}</AppText>}
            </>
          ) : (
            meetAt && <MeetingRoute to={meetAt} place={meetingName} primary />
          )}
        </View>
      )}
      {!a.isOwner && <ReportSheet visible={report} kind="ausfahrt" refId={a.id} onClose={() => setReport(false)} />}
      {/* ⋯ Weitere Aktionen (Koray 14.11.): Ändern, Lead, Absagen rot unten */}
      <ActionSheet
        visible={more}
        title={a.name}
        items={[
          ...(isLead && a.rideStatus === 'geplant'
            ? ([
                { key: 'zeit', icon: 'clock', label: t('Abfahrt ändern'), onPress: () => setTimeSheet(true) },
                { key: 'ort', icon: 'mappin.and.ellipse', label: t('Treffpunkt ändern'), onPress: () => setPlaceSheet(true) },
              ] as SheetItem[])
            : []),
          ...(a.isOwner && a.rideStatus === 'geplant' && members.length > 1 ? ([{ key: 'lead', icon: 'person.line.dotted.person', label: t('Lead übergeben'), hint: t('Wer die Lead hat, startet die Ausfahrt'), onPress: () => setLeadSheet(true) }] as SheetItem[]) : []),
          ...(canTakeLead ? ([{ key: 'take', icon: 'person.line.dotted.person', label: t('Lead übernehmen'), hint: tr('{ownerName} ist noch nicht gestartet', { ownerName: a.ownerName }), onPress: () => void run('take', () => takeLead(a.id)) }] as SheetItem[]) : []),
          ...(!a.isOwner ? ([{ key: 'melden', icon: 'exclamationmark.bubble', label: t('Ausfahrt melden'), onPress: () => setReport(true) }] as SheetItem[]) : []),
          ...((a.myStatus === 'angefragt' || a.myStatus === 'eingeladen' || (a.myStatus === 'zugesagt' && !a.isOwner) || a.isOwner) && !inThisRide
            ? ([
                {
                  key: 'absagen',
                  icon: 'xmark.circle',
                  danger: true,
                  label: a.isOwner ? tr('Ausfahrt absagen') : a.myStatus === 'angefragt' ? tr('Anfrage zurückziehen') : a.myStatus === 'eingeladen' ? tr('Absagen') : tr('Doch nicht mitfahren'),
                  // Gefährliches nennt die Folge (Konsistenzprüfung 15.11., O2)
                  hint: a.isOwner ? tr('Alle Teilnehmer bekommen eine Mitteilung') : tr('{ownerName} bekommt eine Mitteilung', { ownerName: a.ownerName }),
                  onPress: () => setConfirm(true),
                },
              ] as SheetItem[])
            : []),
        ]}
        onClose={() => setMore(false)}
      />
      {/* Teilnehmer antippen */}
      <ActionSheet
        visible={!!person}
        title={person?.name}
        items={
          person
            ? [
                { key: 'nachricht', icon: 'bubble.left', label: t('Nachricht'), onPress: () => router.push({ pathname: '/nachrichten/[id]', params: { id: person.userId } }) },
                ...(isLead && dayMode && !person.invited && !dayOf(person.userId)?.arrived
                  ? ([{ key: 'ping', icon: 'bell', label: t('Anpingen'), hint: t('Fragt, wann er da ist'), onPress: () => void run(`ping-${person.userId}`, () => pingMember(a.id, person.userId)) }] as SheetItem[])
                  : []),
                ...(a.isOwner && a.rideStatus === 'geplant'
                  ? ([
                      {
                        key: 'raus',
                        icon: 'person.crop.circle.badge.xmark',
                        danger: true,
                        label: person.invited ? tr('Einladung zurückziehen') : tr('Aus der Ausfahrt nehmen'),
                        hint: tr('{name} bekommt eine Mitteilung', { name: person.name }),
                        onPress: () => void run(`rm-${person.userId}`, () => removeFromRide(a.id, person.userId)),
                      },
                    ] as SheetItem[])
                  : []),
              ]
            : []
        }
        onClose={() => setPerson(null)}
      />
      {/* Abfahrt ändern in Schritten */}
      <ActionSheet
        visible={timeSheet}
        title={t('Abfahrt ändern')}
        subtitle={tr('Jetzt {v0}. Alle bekommen eine Mitteilung.', { v0: clock(a.startsAt) })}
        items={[-30, -15, 15, 30, 60].map((d) => {
          const t = new Date(a.startsAt.getTime() + d * 60000);
          return { key: `t${d}`, icon: d < 0 ? 'arrow.uturn.backward' : 'arrow.uturn.forward', label: clock(t), hint: d < 0 ? tr('{v0} Minuten früher', { v0: -d }) : tr('{d} Minuten später', { d }), onPress: () => void run('zeit', () => changeRide(a.id, t, null)) } as SheetItem;
        })}
        onClose={() => setTimeSheet(false)}
      />
      {/* Treffpunkt ändern */}
      <ActionSheet
        visible={placeSheet}
        title={t('Treffpunkt ändern')}
        subtitle={t('Alle bekommen eine Mitteilung, wer unterwegs ist, wird neu geführt.')}
        items={[
          {
            key: 'hier',
            icon: 'location.fill',
            label: t('Hier, an meinem Standort'),
            onPress: () =>
              void run('ort', async () => {
                const p = await here();
                const name = await reverseName(p);
                await changeRide(a.id, null, { name, lat: p[0], lon: p[1] });
              }),
          },
          ...(a.start ? ([{ key: 'start', icon: 'flag', label: startName ? tr('{startName}, Start der Tour', { startName }) : tr('Start der Tour'), onPress: () => void run('ort', () => changeRide(a.id, null, { name: startName ?? tr('Start der Tour'), lat: a.start![0], lon: a.start![1] })) }] as SheetItem[]) : []),
        ]}
        onClose={() => setPlaceSheet(false)}
      />
      {/* Lead übergeben */}
      <ActionSheet
        visible={leadSheet}
        title={t('Lead übergeben')}
        subtitle={t('Wer die Lead hat, ändert Abfahrt und Treffpunkt, pingt an und startet.')}
        items={members
          .filter((m) => m.userId !== me)
          .map((m) => ({ key: m.userId, icon: 'person', label: m.name, onPress: () => void run('lead', () => giveLead(a.id, m.userId)) }) as SheetItem)}
        onClose={() => setLeadSheet(false)}
      />
      {/* Starten, obwohl noch nicht alle da sind: einmal nachfragen */}
      <ConfirmSheet
        visible={startAsk}
        title={t('Möchtest du ohne alle losfahren?')}
        text={tr('{v0}. Wer fehlt, bekommt eine Mitteilung und wird direkt zur Gruppe geführt.', { v0: missing.map((m) => { const d = dayOf(m.userId); return d?.etaMin != null ? `${m.name} in ${d.etaMin} min` : tr('{name} noch nicht da', { name: m.name }); }).join(', ') })}
        confirmLabel={t('Trotzdem losfahren')}
        danger={false}
        onConfirm={() => void startGroup()}
        onClose={() => setStartAsk(false)}
      />
      {/* Angepingt: Wann bist du da? */}
      <ActionSheet
        visible={pingOpen && joined && !isLead && a.rideStatus === 'geplant'}
        title={t('Wann bist du da?')}
        subtitle={tr('{meetingName}, Abfahrt {v1}. Teile deinen Standort bis zur Ankunft, dann sieht die Gruppe, wann du kommst.', { meetingName, v1: clock(a.startsAt) })}
        items={[
          {
            key: 'teilen',
            icon: 'location.fill',
            label: t('Teilen und hinfahren'),
            hint: t('Die Gruppe sieht deinen Standort bis zur Ankunft'),
            onPress: () =>
              void run('teilen', async () => {
                if (!meetAt) return;
                startSharing(a.id, meetAt);
                await navigateToMeeting(meetAt, meetingName, 'schnell');
              }),
          },
          { key: 'ohne', icon: 'figure.wave', label: t('Fahrt ohne mich los'), hint: t('Schickt eine Nachricht an die Gruppe'), onPress: () => void run('ohne', () => sendNachricht(a.id, tr('Fahrt ohne mich los, ich komme nicht rechtzeitig.'))) },
          { key: 'chat', icon: 'bubble.left', label: t('Nachricht'), onPress: openChat },
        ]}
        onClose={() => setPingOpen(false)}
      />

      {/* Rückfrage als Blatt wie überall (Prüfung 11.11.) */}
      <ConfirmSheet
        visible={confirm}
        title={a.isOwner ? tr('Möchtest du diese Ausfahrt wirklich absagen?') : a.myStatus === 'angefragt' ? tr('Möchtest du deine Anfrage wirklich zurückziehen?') : a.myStatus === 'eingeladen' ? tr('Möchtest du die Einladung wirklich absagen?') : tr('Möchtest du wirklich nicht mehr mitfahren?')}
        text={a.isOwner ? tr('Alle, die zugesagt haben, sehen die Ausfahrt dann als abgesagt.') : undefined}
        confirmLabel={a.isOwner ? tr('Absagen') : a.myStatus === 'angefragt' ? tr('Zurückziehen') : tr('Absagen')}
        onConfirm={() =>
          void run('cancel', async () => {
            if (a.isOwner) {
              await cancelAusfahrt(a.id);
              back();
            } else if (a.myStatus === 'eingeladen') await declineInvite(a.id);
            else await withdrawAusfahrt(a.id);
          })
        }
        onClose={() => setConfirm(false)}
      />
      {closed.sheet}
    </View>
  );
}

/**
 * Mitglieder einladen (TestFlight Review, Koray 13.11.): vor dem Tippen stehen deine Kontakte als Vorschläge da,
 * beim Tippen gefiltert, Kontakte immer oben, dann weitere Fahrer. Jede Zeile hat ihr eigenes Einladen, das Feld
 * bleibt offen, so lädst du mehrere nacheinander ein. Das X schließt, ebenso Tippen daneben bei leerem Feld.
 * Beim Öffnen rollt die Ansicht mit der Tastatur nach oben, damit vier bis fünf Vorschläge Platz haben.
 */
function InviteBox({ exclude, onInvite, busyId, contacts, onPlaced, onClose, onLink }: { exclude: Set<string>; onInvite: (p: FoundProfile) => Promise<boolean>; busyId: string | null; contacts: Contact[]; onPlaced: (y: number) => void; onClose: () => void; onLink: () => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundProfile[]>([]);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const placed = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      findProfiles(q)
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const n = q.trim().toLowerCase();
  const open = (id: string) => !exclude.has(id) || done.has(id);
  const mine: FoundProfile[] = contacts.filter((c) => open(c.id) && (!n || c.name.toLowerCase().includes(n))).map((c) => ({ id: c.id, displayName: c.name, car: c.car }));
  const ids = new Set(mine.map((p) => p.id));
  const more = n.length >= 2 ? found.filter((p) => open(p.id) && !ids.has(p.id)) : [];
  const shown = [...mine, ...more];
  return (
    <Animated.View
      entering={FadeIn.duration(Motion.enter)}
      style={styles.inviteBox}
      onLayout={(e) => {
        if (placed.current) return;
        placed.current = true;
        onPlaced(e.nativeEvent.layout.y);
      }}>
      <View style={styles.row}>
        <TextInput maxFontSizeMultiplier={1.2}
          value={q}
          onChangeText={setQ}
          placeholder={t('Name eines Fahrers')}
          placeholderTextColor={Colors.muted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onBlur={() => {
            if (!q.trim() && done.size === 0) onClose();
          }}
          style={[styles.input, styles.inputOnSurface, styles.flex]}
          accessibilityLabel={t('Fahrer zum Einladen suchen')}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('Einladen schließen')} hitSlop={4} onPress={onClose} style={styles.roundBtn}>
          <SymbolView name="xmark" size={16} weight="semibold" tintColor={Colors.text} />
        </Pressable>
      </View>
      {!n && mine.length > 0 && <AppText style={styles.label}>{t('Deine Kontakte')}</AppText>}
      {!n && mine.length === 0 && <AppText variant="caption" muted>{t('Tipp den Namen eines Fahrers. Kontakte aus Drivers stehen hier künftig gleich oben.')}</AppText>}
      {n.length >= 2 && shown.length === 0 && <AppText variant="caption" muted>{t('Kein Fahrer mit diesem Namen.')}</AppText>}
      {shown.map((p) => {
        const sent = done.has(p.id);
        return (
          <Animated.View key={p.id} entering={FadeIn.duration(Motion.enter)} layout={LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)} style={styles.member}>
            <Avatar name={p.displayName} userId={p.id} size={36} />
            <View style={styles.flex}>
              <AppText style={styles.name}>{p.displayName}</AppText>
              {p.car ? <AppText variant="caption" muted numberOfLines={1}>{p.car}</AppText> : null}
            </View>
            <AddButton
              label={sent ? tr('{name} eingeladen', { name: p.displayName }) : tr('{name} einladen', { name: p.displayName })}
              busy={busyId === p.id}
              done={sent}
              disabled={!!busyId}
              onPress={() => void onInvite(p).then((ok) => ok && setDone((d) => new Set(d).add(p.id)))}
            />
          </Animated.View>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityHint={t('Wer den Link öffnet, fragt an. Du nimmst an.')} onPress={onLink} style={styles.linkRow}>
        <SymbolView name="square.and.arrow.up" size={20} weight="semibold" tintColor={Colors.text} />
        <AppText style={styles.secondaryText}>{t('Link teilen, etwa in WhatsApp')}</AppText>
      </Pressable>
      <AppText variant="caption" muted>{t('Die Einladung ist eine Anfrage. Erst nach der Zusage sind Funk und Live Karte dabei.')}</AppText>
    </Animated.View>
  );
}



const styles = StyleSheet.create({
  selfStart: { alignSelf: 'flex-start' },
  hereCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l, minHeight: 72, borderRadius: Radius.l, backgroundColor: Colors.goodTint, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m },
  hereIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.good, alignItems: 'center', justifyContent: 'center' },
  hereTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.good },
  hereText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  root: { flex: 1, backgroundColor: Colors.ground },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.xl },
  flex: { flex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: Spacing.m, paddingHorizontal: Spacing.xl, gap: Spacing.s, backgroundColor: Colors.ground },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  change: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  here: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.good },
  eta: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  pingBtn: { height: 40, paddingHorizontal: Spacing.m, borderRadius: 20, backgroundColor: Colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pingText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  addCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 44 },
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

/** Netzfehler in Du Form statt „fetch failed: Abgebrochen“ */
function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return /fetch|network|abgebrochen|cancel|timed out|offline/i.test(m) ? tr('Keine Verbindung. Wir versuchen es gleich nochmal.') : m;
}
