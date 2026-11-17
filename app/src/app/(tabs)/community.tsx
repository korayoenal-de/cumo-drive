/**
 * Community (Konzept Koray 9.11.): Karte mit Pins und Blatt darüber. Oben ein Umschalter
 * Routen oder Ausfahrten; er filtert Karte und Liste zugleich.
 * Routen: veröffentlichte Touren zum Nachfahren (Tippen öffnet sie im Planer, Lesezeichen speichert).
 * Ausfahrten: anstehende Gruppenfahrten mit Zeit und Treffpunkt; Mitfahren anfragen, der
 * Organisator nimmt an, danach Chat und am Tag die Gruppenfahrt.
 * Drivers (Koray 10.11.): Mitglieder an ihrem Wohnort, Fuhrpark und Nachricht schreiben.
 */
import { Kennzahlen, SeatsBadge } from '@/components/ui/kennzahlen';
import { fahrzeit, meta as fmtMeta, strecke, wann } from '@/lib/format';
import { seenTab } from '@/lib/fly';
import { haptic } from '@/lib/haptics';
import { flyFrom } from '@/components/ui/morph-action';
import { IconLabel } from '@/components/ui/btn-icon';
import { useRideFun } from '@/lib/ride-fun';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { EASE_OUT, SOFT_LAYOUT } from '@/components/ui/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityMap, type CommunityPin } from '@/components/community/community-map';
import { ContactRequests, DriverCard, ringColor } from '@/components/community/driver-card';
import { MeetingRoute } from '@/components/group/meeting-route';
import { refreshContacts, useContacts } from '@/lib/contacts';
import { DateBlock, RideStatus } from '@/components/community/ride-bits';
import { FromBadge, FunMark, GoodBadge, RouteThumb } from '@/components/tours/tour-bits';
import { Chip, ChipRow, ChipGroup } from '@/components/ui/chip';
import { MapSheet, type Detent } from '@/components/ui/map-sheet';
import { ReportSheet } from '@/components/moderation/report-sheet';
import { usePrivacy } from '@/components/settings/community-profile';
import { ActionSheet, ConfirmSheet, type SheetItem } from '@/components/ui/action-sheet';
import { PublishSheet } from '@/components/tours/tour-card';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { arrival, ausfahrtTour, clock, freeSeats, listAusfahrten, relDay, shortDate, showCancelled, type Ausfahrt } from '@/lib/ausfahrten';
import { approachMinutes, departAt, syncRideReminders, currentSpot } from '@/lib/ride-reminders';
import { useSession } from '@/lib/auth';
import { kmBetween, listConversations, listDrivers, refreshUnread, useUnreadMessages, type Driver } from '@/lib/drivers';
import { copyCommunityTour, listCommunity, loadCommunityTour, removeKeepPublished, withdrawCommunityTour, type CommunityTour } from '@/lib/community';
import { deleteTour, saveTour, syncLibrary, useLibrary, type SavedTour } from '@/lib/library';
import { showToast } from '@/lib/toast';
import { requestCommunityLine, setListReach, useCommunityLine, useInReach } from '@/lib/community-lines';
import { kmToLine } from '@/lib/map-hit';
import { OverlapRail } from '@/components/community/overlap-rail';
import { setEditTour } from '@/lib/edit-tour';
import { InvitesList, useInviteCount } from '@/components/group/invites-banner';
import { formatKm, type LatLon } from '@/lib/tour';
import { looksLikeAddress, searchAddress } from '@/lib/address-search';
import { searchTowns, type Place } from '@/lib/geocode';
import { tr } from '@/i18n';

type Seg = 'routen' | 'ausfahrten' | 'drivers';
type Sort = 'neu' | 'kurven' | 'kurz' | 'lang';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'neu', label: tr('Neueste') },
  { id: 'kurven', label: tr('Kurvigste') },
  { id: 'kurz', label: tr('Kurz') },
  { id: 'lang', label: tr('Lang') },
];

/** Umkreis für die Ortssuche in Routen */
const NEAR_KM = 50;

export default function Community() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<Seg>('routen');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAll, setShareAll] = useState(false);
  const [toPublish, setToPublish] = useState<SavedTour | null>(null);
  // Plakette für Neues (veröffentlicht, Ausfahrt angelegt) verschwindet beim Öffnen des Tabs
  useFocusEffect(useCallback(() => seenTab('community'), []));
  const myTours = useLibrary();
  const [tours, setTours] = useState<CommunityTour[] | null>(null);
  const [rides, setRides] = useState<Ausfahrt[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [dq, setDq] = useState('');
  // Drivers: alle oder nur Kontakte (TestFlight Review, Koray 13.11.)
  const [dseg, setDseg] = useState<'alle' | 'kontakte'>('alle');
  const contacts = useContacts();
  const unread = useUnreadMessages();
  // Ungelesene je Fahrer für die Plakette in der Liste Drivers; neu geladen, wenn sich die Gesamtzahl ändert
  const [unreadBy, setUnreadBy] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!unread) return;
    let alive = true;
    listConversations()
      .then((l) => alive && setUnreadBy(Object.fromEntries(l.filter((c) => c.unread > 0).map((c) => [c.partner, c.unread]))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [unread]);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Ort, Adresse oder PLZ in der Suche: Routen mit Start im Umkreis (Koray 10.11.)
  const [near, setNear] = useState<{ q: string; place: Place } | null>(null);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3 && !/^\d{4,5}$/.test(t)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      (looksLikeAddress(t) ? searchAddress(t, undefined, ctrl.signal) : searchTowns(t, undefined, ctrl.signal))
        .then((l) => setNear(l[0] ? { q: t, place: l[0] } : null))
        .catch(() => undefined);
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  const nearNow = near && near.q === q.trim() ? near.place : null;
  const [sort, setSort] = useState<Sort>('neu');
  const [detent, setDetent] = useState<Detent>(1);
  const detentRef = useRef<Detent>(1);
  useEffect(() => {
    detentRef.current = detent;
  }, [detent]);
  const scroll = useRef<ScrollViewInstance>(null);
  /** Lage der Liste Drivers im Blatt und jeder Karte darin, zum Hinrollen beim Aufklappen */
  const bodyY = useRef(0);
  const driverY = useRef(new Map<string, number>());
  const [selected, setSelected] = useState<string | null>(null);
  const [line, setLine] = useState<LatLon[] | null>(null);
  /** Überlagernde Touren an der getippten Stelle (Koray 17.11.): Reihe über dem Blatt, null ohne Überlagerung */
  const [stack, setStack] = useState<string[] | null>(null);
  const [stackLines, setStackLines] = useState<Record<string, LatLon[]>>({});
  const tapSeq = useRef(0);
  const lines = useRef(new Map<string, LatLon[]>());
  const selRef = useRef<string | null>(null);
  const userId = session?.user.id;
  const win = useWindowDimensions();

  // Routenkarten laden ihre Linie erst, wenn sie in Sichtweite kommen: Scrollposition plus Bildschirmhöhe
  useEffect(() => setListReach(win.height), [win.height]);
  const onScrollY = useCallback((y: number) => setListReach(y + win.height), [win.height]);

  const load = useCallback(() => {
    listCommunity()
      .then((l) => {
        setTours(l);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message));
    // private Ausfahrten stehen nur unter Touren, nicht in der Community (Koray 13.11.)
    // abgesagte bleiben bis zum geplanten Tag sichtbar, damit Teilnehmer die Absage sehen (Koray 17.11.)
    listAusfahrten().then((l) => l.filter((x) => !x.isOver || showCancelled(x)))
      .then((l) => setRides(l.filter((r) => r.isPublic)))
      .catch(() => setRides((r) => r ?? []));
    listDrivers()
      .then(setDrivers)
      .catch(() => setDrivers((d) => d ?? []));
    void refreshContacts();
    void refreshUnread();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 60000);
      return () => clearInterval(t);
      // neu laden, wenn sich das Konto ändert
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, userId]),
  );

  const shownTours = useMemo(() => {
    const n = q.trim().toLowerCase();
    const closeBy = (t: CommunityTour) => !!nearNow && t.start_lat != null && t.start_lon != null && kmBetween([t.start_lat, t.start_lon], nearNow.p) <= NEAR_KM;
    const l = (tours ?? []).filter((t) => !n || t.name.toLowerCase().includes(n) || (t.author ?? '').toLowerCase().includes(n) || (t.description ?? '').toLowerCase().includes(n) || closeBy(t));
    const density = (t: CommunityTour) => (t.curves ?? 0) / Math.max(1, Number(t.km));
    if (sort === 'kurven') l.sort((a, b) => density(b) - density(a));
    if (sort === 'kurz') l.sort((a, b) => Number(a.km) - Number(b.km));
    if (sort === 'lang') l.sort((a, b) => Number(b.km) - Number(a.km));
    return l;
  }, [tours, q, sort, nearNow]);

  // Drivers: nach Nähe zum eigenen Wohnort, sonst nach Name; Suche über Name, Ort und Auto
  const shownDrivers = useMemo(() => {
    const me = drivers?.find((d) => d.isMe);
    const n = dq.trim().toLowerCase();
    const l = (drivers ?? []).filter((d) => dseg === 'alle' || contacts.byId.get(d.id) === 'kontakt').filter((d) => !n || d.name.toLowerCase().includes(n) || (d.homeName ?? '').toLowerCase().includes(n) || (d.car ?? '').toLowerCase().includes(n) || (d.garage ?? []).some((g) => g.name.toLowerCase().includes(n)));
    const dist = (d: Driver) => (me?.home && d.home ? kmBetween(me.home, d.home) : Number.POSITIVE_INFINITY);
    return l.sort((a, b) => Number(b.isMe) - Number(a.isMe) || dist(a) - dist(b) || a.name.localeCompare(b.name, 'de'));
  }, [drivers, dq, dseg, contacts]);
  const contactCount = (drivers ?? []).filter((d) => contacts.byId.get(d.id) === 'kontakt').length;
  const others = (drivers ?? []).filter((d) => !d.isMe).length;

  const pins: CommunityPin[] = useMemo(() => {
    if (seg === 'drivers') {
      // gleicher Ort: leicht im Kreis versetzt, damit sich die Kreise nicht verdecken
      const seen = new Map<string, number>();
      return shownDrivers
        .filter((d): d is Driver & { home: LatLon } => !!d.home)
        .map((d) => {
          const key = `${d.home[0]},${d.home[1]}`;
          const i = seen.get(key) ?? 0;
          seen.set(key, i + 1);
          const a = i * 2.4;
          const r = i ? 0.004 * Math.sqrt(i) : 0;
          return { id: d.id, kind: 'driver' as const, p: [d.home[0] + r * Math.cos(a), d.home[1] + (r * Math.sin(a)) / Math.cos((d.home[0] * Math.PI) / 180)] as LatLon, label: d.name, ring: ringColor(d) };
        });
    }
    if (seg === 'routen')
      return shownTours.filter((t) => t.start_lat != null && t.start_lon != null).map((t) => ({ id: t.id, kind: 'route', p: [t.start_lat as number, t.start_lon as number], label: `${formatKm(Number(t.km), 0)} km` }));
    return (rides ?? [])
      .filter((r) => !r.isCancelled)
      .map((r) => ({ r, p: r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : r.start }))
      .filter((x): x is { r: Ausfahrt; p: LatLon } => !!x.p)
      .map(({ r, p }) => ({ id: r.id, kind: 'ausfahrt', p, label: shortDate(r.startsAt), count: r.taken }));
  }, [seg, shownTours, rides, shownDrivers]);

  const inviteCount = useInviteCount();
  const openRequests = (rides ?? []).reduce((n, r) => n + (r.isOwner ? r.openRequests : 0), 0);
  const selTour = seg === 'routen' ? tours?.find((t) => t.id === selected) ?? null : null;
  const selRide = seg === 'ausfahrten' ? rides?.find((r) => r.id === selected) ?? null : null;
  const meDriver = drivers?.find((d) => d.isMe) ?? null;

  const select = (id: string | null, fromList = false) => {
    Keyboard.dismiss();
    if (fromList || !id) setStack(null);
    selRef.current = id;
    setSelected(id);
    if (!id) {
      setLine(null);
      return;
    }
    if (seg === 'drivers') {
      // Fahrer klappen in der Liste an ihrer Stelle auf (Koray 10.11.); vom Pin aus fährt das Blatt hoch
      // und die Liste rollt zur Karte, sodass sie oben nie angeschnitten ist
      setLine(null);
      if (!fromList) setDetent(2);
      setTimeout(() => {
        const y = driverY.current.get(id);
        if (y != null && (detentRef.current === 2 || !fromList)) scroll.current?.scrollTo({ y: Math.max(0, bodyY.current + y - Spacing.s), animated: true });
      }, fromList ? 60 : 380);
      return;
    }
    setDetent(0);
    const cached = lines.current.get(id);
    if (cached) {
      setLine(cached);
      return;
    }
    setLine(null);
    // Routen teilen sich den Speicher mit den Karten der Liste (Streckenbild und Fahrspaß)
    const tour = seg === 'routen' ? tours?.find((t) => t.id === id) : undefined;
    const got: Promise<LatLon[] | null> = tour
      ? requestCommunityLine(tour).then((v) => v?.line ?? null)
      : seg === 'ausfahrten'
        ? ausfahrtTour(id).then((full) => (full ? full.tour.linie.flatMap((l) => l.p) : null))
        : Promise.resolve(null);
    got
      .then((pts) => {
        if (!pts) return;
        lines.current.set(id, pts);
        if (selRef.current === id) setLine(pts);
      })
      .catch(() => undefined);
  };

  const switchSeg = (s: Seg) => {
    if (s === seg) return;
    Keyboard.dismiss();
    setSeg(s);
    selRef.current = null;
    setSelected(null);
    setLine(null);
    setStack(null);
    setDetent(1);
  };

  /**
   * Tipp auf die Karte der Touren (Koray 17.11., überlagernde Touren): welche Touren laufen unter dem Finger?
   * Geprüft werden die Linien der Touren, die von der Stelle aus erreichbar starten (höchstens 12, nächste zuerst).
   * Eine Tour: wie bisher wählen. Mehrere: die Reihe über dem Blatt, die getroffene Marke vorne, dann die nächste Linie.
   */
  const onMapTap = (tapAt: LatLon | null, pinId: string | null, radiusKm: number) => {
    const seq = ++tapSeq.current;
    // Tipp auf eine Marke kommt ohne Kartenort: dann zählt der Start der Tour (Koray 17.11.: sonst kam die Reihe
    // beim Tipp auf den Pin nie, obwohl dort mehrere Touren beginnen)
    const pinTour = pinId ? tours?.find((x) => x.id === pinId) : undefined;
    // getroffene Marke: ihr echter Start (Marken am selben Ort liegen nebeneinander versetzt)
    const at: LatLon | null = (pinTour && pinTour.start_lat != null && pinTour.start_lon != null ? [pinTour.start_lat, pinTour.start_lon] : null) ?? tapAt;
    if (seg !== 'routen' || !at) {
      setStack(null);
      select(pinId);
      return;
    }
    // die getroffene Marke sofort zeigen, die Prüfung der Linien folgt
    if (pinId) select(pinId);
    const near = (tours ?? [])
      .filter((x) => x.start_lat != null && x.start_lon != null)
      .map((x) => ({ x, d: kmBetween([x.start_lat as number, x.start_lon as number], at) }))
      .filter((v) => v.d <= Math.max(Number(v.x.km), 10))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12)
      .map((v) => v.x);
    void Promise.all(near.map((x) => requestCommunityLine(x).then((v) => ({ x, v, d: v ? kmToLine(v.line, at) : Number.POSITIVE_INFINITY })))).then((rs) => {
      if (tapSeq.current !== seq) return;
      const hits = rs.filter((r) => r.d <= radiusKm).sort((a, b) => a.d - b.d);
      const ids = hits.map((r) => r.x.id);
      if (pinId) {
        const i = ids.indexOf(pinId);
        if (i > 0) ids.splice(i, 1);
        if (i !== 0) ids.unshift(pinId);
      }
      if (ids.length < 2) {
        setStack(null);
        if (!pinId) select(ids[0] ?? null);
        return;
      }
      const ls: Record<string, LatLon[]> = {};
      for (const r of hits) if (r.v) ls[r.x.id] = r.v.line;
      setStackLines(ls);
      setStack(ids);
      haptic('rastung');
      if (selRef.current !== ids[0]) select(ids[0]);
    });
  };
  const stackTours = stack ? stack.map((id) => tours?.find((x) => x.id === id)).filter((x): x is CommunityTour => !!x) : [];
  const otherLines = stack ? stack.filter((id) => id !== selected).map((id) => stackLines[id]).filter((l): l is LatLon[] => !!l) : undefined;

  const topH = insets.top + Spacing.s + 48;

  // Die weiße Fläche ist eine einzige und gleitet zur gewählten Ansicht (Regel „Auswahl gleitet“, 11.11.)
  const segBoxes = useSharedValue<Partial<Record<Seg, { x: number; w: number }>>>({});
  const thumbX = useSharedValue(0);
  const thumbW = useSharedValue(0);
  const thumbPlaced = useSharedValue(false);
  /** Solange die gleitende Fläche nicht gemessen ist, trägt die aktive Ansicht ihre weiße Fläche selbst */
  const [thumbReady, setThumbReady] = useState(false);
  /** Fläche auf den Kasten setzen: beim ersten Mal sofort, danach mit Feder */
  const moveThumb = useCallback(
    (b: { x: number; w: number } | undefined) => {
      if (!b || b.w <= 0) return;
      if (thumbPlaced.get()) {
        // gleiten ohne Feder (Koray 17.11., Leinwand „Gleitende Auswahl“, Variante Gleiten): kein Nachfedern mehr
        thumbX.set(withTiming(b.x, { duration: Motion.enter, easing: EASE_OUT }));
        thumbW.set(withTiming(b.w, { duration: Motion.enter, easing: EASE_OUT }));
      } else {
        thumbX.set(b.x);
        thumbW.set(b.w);
        thumbPlaced.set(true);
      }
    },
    [thumbX, thumbW, thumbPlaced],
  );
  const onSegBox = (id: Seg) => (x: number, w: number) => {
    segBoxes.set({ ...segBoxes.get(), [id]: { x, w } });
    // den gemessenen Kasten direkt nehmen: der gerade gesetzte Wert ist beim Zurücklesen noch nicht da (Fehler 11.11.)
    if (id === seg && w > 0) {
      moveThumb({ x, w });
      setThumbReady(true);
    }
  };
  useEffect(() => moveThumb(segBoxes.get()[seg]), [seg, segBoxes, moveThumb]);
  const thumbStyle = useAnimatedStyle(() => ({ width: thumbW.get(), opacity: thumbW.get() > 0 ? 1 : 0, transform: [{ translateX: thumbX.get() }] }));

  const segControl = (
    <View style={styles.seg} accessibilityRole="tablist">
      <Animated.View pointerEvents="none" style={[styles.segThumb, thumbStyle]} />
      <SegItem label={tr('Touren')} icon="point.topleft.down.to.point.bottomright.curvepath" count={tours?.length ?? null} on={seg === 'routen'} onPress={() => switchSeg('routen')} onBox={onSegBox('routen')} ownFill={!thumbReady} />
      <SegItem label={tr('Ausfahrten')} icon="calendar" count={userId ? rides?.filter((r) => !r.isCancelled).length ?? null : null} badge={openRequests + inviteCount} on={seg === 'ausfahrten'} onPress={() => switchSeg('ausfahrten')} onBox={onSegBox('ausfahrten')} ownFill={!thumbReady} />
      <SegItem label={tr('Drivers')} icon="person.2" count={userId ? drivers?.length ?? null : null} badge={unread} on={seg === 'drivers'} onPress={() => switchSeg('drivers')} onBox={onSegBox('drivers')} ownFill={!thumbReady} />
    </View>
  );

  const header = (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <AppText style={styles.kicker}>{seg === 'routen' ? tr('Touren zum Nachfahren') : seg === 'ausfahrten' ? tr('Gemeinsame Ausfahrten') : 'Drivers'}</AppText>
        {/* Eigene Tour teilen oder eine neue erstellen (Koray 15.11.), gleiche Form wie Anlegen und Nachrichten */}
        {seg === 'routen' && userId && (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('Tour teilen')} hitSlop={4} onPress={() => setShareOpen(true)} style={styles.addBtn}>
            <SymbolView name="plus" size={16} weight="semibold" tintColor={Colors.text} />
            <AppText style={styles.addText}>{tr('Teilen')}</AppText>
          </Pressable>
        )}
        {seg === 'drivers' && userId && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Nachrichten${unread ? `, ${unread} ungelesen` : ''}`} hitSlop={4} onPress={() => router.push('/nachrichten')} style={styles.addBtn}>
            <SymbolView name="bubble.left.and.bubble.right" size={16} weight="semibold" tintColor={Colors.text} />
            <AppText style={styles.addText}>{tr('Nachrichten')}</AppText>
            {unread > 0 && (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{unread}</AppText>
              </View>
            )}
          </Pressable>
        )}
        {seg === 'ausfahrten' && userId && (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('Ausfahrt anlegen')} hitSlop={4} onPress={() => router.push('/ausfahrt/neu')} style={styles.addBtn}>
            <SymbolView name="plus" size={16} weight="semibold" tintColor={Colors.text} />
            <AppText style={styles.addText}>{tr('Anlegen')}</AppText>
          </Pressable>
        )}
      </View>
      {selTour && <RouteCard key={selTour.id} t={selTour} mine={userId === selTour.owner} big onChanged={() => { select(null); load(); }} />}
      {selRide && <RideCard key={selRide.id} r={selRide} big />}
    </View>
  );

  // Eigene Touren zum Teilen: noch nicht veröffentlicht, nicht unverändert aus der Community, die neuesten zuerst.
  // Vorschau mit den acht neuesten, „Alle anzeigen“ öffnet die ganze Liste (Koray 15.11.)
  const shareableAll = myTours
    .filter((t) => !t.published && t.folder !== 'Community' && t.folder !== 'Gefahren')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shareable = shareableAll.slice(0, 8);
  const tourItem = (t: SavedTour): SheetItem => ({
    key: t.id,
    icon: 'bookmark',
    label: t.name,
    hint: fmtMeta(strecke(t.laenge_km), t.minutes ? fahrzeit(t.minutes) : null),
    onPress: () => setToPublish(t),
  });
  const shareItems: SheetItem[] = [
    ...shareable.map(tourItem),
    // immer da (Koray 15.11.): auch bei wenigen Touren der Weg zur ganzen Liste
    { key: 'alle', icon: 'list.bullet' as const, label: tr('Alle Touren'), hint: shareableAll.length === 1 ? tr('1 Tour zum Teilen') : tr('{n} Touren zum Teilen', { n: shareableAll.length }), onPress: () => setShareAll(true) },
    { key: 'neu', icon: 'plus' as const, label: tr('Neue Tour erstellen'), hint: tr('Im Planer, danach hier teilen'), onPress: () => router.navigate('/') },
  ];

  return (
    <View style={styles.root}>
      <ActionSheet
        visible={shareOpen}
        title={tr('In der Community teilen')}
        subtitle={shareable.length ? tr('Welche deiner Touren sollen andere nachfahren können?') : tr('Du hast noch keine eigene Tour gespeichert.')}
        items={shareItems}
        onClose={() => setShareOpen(false)}
      />
      <ActionSheet visible={shareAll} title={tr('Alle deine Touren')} subtitle={tr('Welche soll andere nachfahren können?')} items={shareableAll.map(tourItem)} onClose={() => setShareAll(false)} scroll />
      {toPublish && <PublishSheet key={toPublish.id} tour={toPublish} visible onClose={() => setToPublish(null)} onPublished={load} />}
      <MapSheet
        scrollRef={scroll}
        detent={detent}
        onDetentChange={setDetent}
        grabberLabel={seg === 'routen' ? tr('Liste der Touren') : seg === 'ausfahrten' ? tr('Liste der Ausfahrten') : tr('Liste der Drivers')}
        onScrollY={onScrollY}
        topReserve={topH + Spacing.s}
        header={header}
        background={(covered) => (
          <>
            <CommunityMap pins={pins} selected={selected} onSelect={select} onTap={onMapTap} others={otherLines} keepView={stackTours.length > 1} line={line} bottom={covered} top={topH} style={StyleSheet.absoluteFill} />
            {stackTours.length > 1 && <OverlapRail tours={stackTours} active={selected} onPick={(id) => select(id)} bottom={covered + Spacing.s} />}
          </>
        )}>
        {seg === 'routen' ? (
          <View style={styles.body}>
            <TextInput maxFontSizeMultiplier={1.2} value={q} onChangeText={setQ} placeholder={tr('Tour, Fahrer, Ort oder PLZ suchen')} placeholderTextColor={Colors.muted} style={styles.search} accessibilityLabel={tr('Routen durchsuchen')} returnKeyType="search" />
            <ChipRow>
              {SORTS.map((s) => (
                <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
              ))}
            </ChipRow>
            {err && <AppText style={styles.error}>{tr('Community konnte nicht geladen werden: ')}{err}</AppText>}
            {tours === null && !err && <ActivityIndicator color={Colors.muted} />}
            {tours?.length === 0 && (
              <View style={styles.card}>
                <AppText variant="title">{tr('Noch keine Routen veröffentlicht')}</AppText>
                <AppText muted>{tr('Sei der Erste: Tippe oben auf Teilen und wähle eine deiner Touren.')}</AppText>
              </View>
            )}
            {nearNow && <AppText muted>{tr('Auch Routen mit Start im Umkreis von ')}{NEAR_KM} km um {nearNow.name}</AppText>}
            {tours && tours.length > 0 && shownTours.length === 0 && <AppText muted>{nearNow ? tr('Keine Route startet im Umkreis von {NEAR_KM} km um {name}.', { NEAR_KM, name: nearNow.name }) : tr('Keine Route passt zur Suche.')}</AppText>}
            {shownTours
              .filter((t) => t.id !== selected)
              .map((t) => (
                <RouteCard key={t.id} t={t} mine={userId === t.owner} onChanged={load} />
              ))}
          </View>
        ) : seg === 'drivers' ? (
          <View
            style={styles.body}
            onLayout={(e) => {
              bodyY.current = e.nativeEvent.layout.y;
            }}>
            {!userId ? (
              <View style={styles.card}>
                <AppText variant="title">{tr('Drivers mit Konto')}</AppText>
                <AppText muted>{tr('Melde dich an, um andere Mitglieder zu sehen und anzuschreiben.')}</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.secondary}>
                  <AppText style={styles.secondaryText}>{tr('Anmelden')}</AppText>
                </Pressable>
              </View>
            ) : drivers === null ? (
              <ActivityIndicator color={Colors.muted} />
            ) : (
              <>
                {meDriver && !meDriver.home && (
                  <View style={styles.card}>
                    <AppText variant="title">{tr('Zeig dich auf der Karte')}</AppText>
                    <AppText muted>{tr('Trag deinen Wohnort in deinem Profil ein. Andere sehen dich dann dort, nur als Ortsmitte.')}</AppText>
                    <Pressable accessibilityRole="button" onPress={() => router.push('/profil')} style={styles.secondary}>
                      <AppText style={styles.secondaryText}>{tr('Wohnort angeben')}</AppText>
                    </Pressable>
                  </View>
                )}
                <ContactRequests list={contacts.list} />
                <ChipGroup style={styles.dsegRow}>
                  <Chip label={tr('Alle {others}', { others })} active={dseg === 'alle'} onPress={() => setDseg('alle')} />
                  <Chip label={tr('Kontakte {contactCount}', { contactCount })} active={dseg === 'kontakte'} onPress={() => setDseg('kontakte')} />
                </ChipGroup>
                {dseg === 'kontakte' && contactCount === 0 ? (
                  <View style={styles.card}>
                    <AppText variant="title">{tr('Noch keine Kontakte')}</AppText>
                    <AppText muted>{tr('Tippe bei einem Fahrer auf das Plus. Sobald er bestätigt, steht er hier und beim Einladen zu Gruppenfahrten ganz oben.')}</AppText>
                    <Pressable accessibilityRole="button" onPress={() => setDseg('alle')} style={styles.secondary}>
                      <AppText style={styles.secondaryText}>{tr('Fahrer entdecken')}</AppText>
                    </Pressable>
                  </View>
                ) : (
                  <TextInput maxFontSizeMultiplier={1.2} value={dq} onChangeText={setDq} placeholder={dseg === 'kontakte' ? tr('Kontakte durchsuchen') : tr('Name, Ort oder Auto suchen')} placeholderTextColor={Colors.muted} style={styles.search} accessibilityLabel={dseg === 'kontakte' ? tr('Kontakte durchsuchen') : tr('Drivers durchsuchen')} returnKeyType="search" />
                )}
                {shownDrivers.length === 0 && (dseg === 'alle' || contactCount > 0) && <AppText muted>{dseg === 'kontakte' ? tr('Kein Kontakt passt zur Suche.') : tr('Kein Mitglied passt zur Suche.')}</AppText>}
                {shownDrivers.map((d) => (
                  <View
                    key={d.id}
                    onLayout={(e) => {
                      driverY.current.set(d.id, e.nativeEvent.layout.y);
                    }}>
                    {d.id === selected ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`${d.name} zuklappen`} onPress={() => select(null)}>
                        <DriverCard d={d} big />
                      </Pressable>
                    ) : (
                      <DriverCard d={d} unread={unread ? (unreadBy[d.id] ?? 0) : 0} onPress={() => select(d.id, true)} />
                    )}
                  </View>
                ))}
              </>
            )}
          </View>
        ) : (
          <View style={styles.body}>
            {/* Einladungen zu Gruppenfahrten stehen hier oben, nicht mehr über jedem Screen (Koray 11.11.) */}
            {userId && <InvitesList rides={rides} onChanged={load} />}
            {!userId ? (
              <View style={styles.card}>
                <AppText variant="title">{tr('Ausfahrten mit Konto')}</AppText>
                <AppText muted>{tr('Melde dich an, um anstehende Ausfahrten zu sehen und mitzufahren.')}</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.secondary}>
                  <AppText style={styles.secondaryText}>{tr('Anmelden')}</AppText>
                </Pressable>
              </View>
            ) : rides === null ? (
              <ActivityIndicator color={Colors.muted} />
            ) : rides.length === 0 ? (
              <View style={styles.card}>
                <AppText variant="title">{tr('Noch keine Ausfahrten geplant')}</AppText>
                <AppText muted>{tr('Lade andere zu deiner Lieblingstour ein: mit Zeit, Treffpunkt und freien Plätzen.')}</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/ausfahrt/neu')} style={styles.secondary}>
                  <AppText style={styles.secondaryText}>{tr('Ausfahrt anlegen')}</AppText>
                </Pressable>
              </View>
            ) : (
              <RideSections rides={rides.filter((r) => r.id !== selected)} />
            )}
          </View>
        )}
      </MapSheet>

      {/* Der Umschalter steht immer fest über der Karte, auch bei ganz offenem Blatt (Koray 10.11.) */}
      <View style={[styles.segWrap, { top: insets.top + Spacing.s }]} pointerEvents="box-none">
        {segControl}
      </View>
    </View>
  );
}

/**
 * Glaspille (Konzept A, Koray 10.11.): aktive Ansicht weiß mit Wort und Zahl, die anderen nur als
 * Symbol. Beim Wechsel gleitet die weiße Fläche mit Feder, das Wort blendet auf.
 */
function SegItem({ label, icon, count, badge, on, onPress, onBox, ownFill }: { ownFill: boolean; label: string; icon: SFSymbol; count: number | null; badge?: number; on: boolean; onPress: () => void; onBox: (x: number, w: number) => void }) {
  return (
    <Animated.View
      layout={SOFT_LAYOUT}
      onLayout={(e) => onBox(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}${count != null ? `, ${count}` : ''}${badge ? tr(', {badge} offene Anfragen', { badge }) : ''}`}
        hitSlop={4}
        onPress={onPress}
        style={[styles.segItem, on && styles.segOn, on && ownFill && styles.segFill]}>
        <View>
          <SymbolView name={icon} size={20} weight="semibold" tintColor={on ? Colors.ground : Colors.muted} />
          {!on && !!badge && <View style={styles.badgeDot} />}
        </View>
        {on && (
          <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.segLabel}>
            <AppText style={styles.segText}>{label}</AppText>
            {count != null && <AppText style={styles.segCount}>{count}</AppText>}
            {!!badge && (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{badge}</AppText>
              </View>
            )}
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function usePress() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    onPressIn: () => scale.set(withSpring(Motion.pressScale, Motion.press)),
    onPressOut: () => scale.set(withSpring(1, Motion.press)),
  };
}

/**
 * Route der Community, Aufbau wie TourCard in Meine Touren (Koray 10.11.): Mini Streckenbild, Name,
 * Metazeile, Plakette (eigene grün „Von dir“, fremde grau mit Initiale), Fahrspaß mit Zahl und rechts
 * das Lesezeichen zum Übernehmen. Tippen öffnet die Route im Planer. Linie, Streckenbild und Fahrspaß
 * lädt die Karte erst, wenn sie in Sichtweite kommt (lib/community-lines.ts).
 * Die Beschreibung steht nur in der großen Karte: in der Liste bliebe sonst jede Karte anders hoch,
 * die ruhige Reihe wie in Meine Touren ginge verloren. Die Suche findet sie trotzdem.
 */
const RouteCard = memo(function RouteCard({ t, mine, big, onChanged }: { t: CommunityTour; mine: boolean; big?: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState<'open' | 'save' | 'withdraw' | null>(null);
  const keepRef = useRef<ComponentRef<typeof View>>(null);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(false);
  // Gespeichert heißt: liegt in Meine Touren (übernommen unter Community, eigene als veröffentlichte Tour)
  const library = useLibrary();
  const kept = useMemo(() => library.find((x) => x.communityId === t.id || (x.name === t.name && (x.folder === 'Community' || (mine && x.published)))) ?? null, [library, t.id, t.name, mine]);
  const saved = !!kept;
  const [err, setErr] = useState<string | null>(null);
  const [top, setTop] = useState<number | null>(null);
  const press = usePress();
  const inReach = useInReach(big ? 0 : top);
  const data = useCommunityLine(t, !!big || inReach);
  // Linie nur aufblenden, wenn sie wirklich nachkommt; aus dem Speicher steht sie gleich da
  const [fade] = useState(() => data == null);
  const km = Number(t.km);
  const author = t.author?.trim() || null;
  // Meta Zeile wie überall: Strecke und Fahrzeit, Fahrspaß rechts (Konsistenzprüfung 15.11., K3, K9)
  const meta = useMemo(() => fmtMeta(strecke(km), t.minutes ? fahrzeit(t.minutes) : null), [km, t.minutes]);
  const badge = mine ? <GoodBadge label={tr('Von dir')} /> : <FromBadge author={author} />;

  const open = async () => {
    if (busy) return;
    setBusy('open');
    setErr(null);
    try {
      const full = await loadCommunityTour(t.id);
      const now = new Date().toISOString();
      // ungespeicherte Kopie: ohne id, Speichern im Planer legt sie unter Community in Meine Touren
      setEditTour({ ...full.tour, name: t.name, author: t.author?.trim() || undefined, communityId: t.id, id: '', folder: 'Community', createdAt: now, updatedAt: now, curves: t.curves ?? undefined, profile: full.profile }, { label: 'Community', href: '/community' });
      router.navigate('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const keep = async () => {
    if (busy) return;
    setErr(null);
    // Lesezeichen schaltet um (Koray 10.11.): gespeichert heißt hier wieder entfernen, mit Rückgängig
    if (kept) {
      // Bearbeitete Kopie nicht über das Lesezeichen löschen: die eigenen Änderungen gingen sonst verloren
      // (Koray 11.11.). Erkannt an der Länge, die nach dem Bearbeiten nicht mehr zum Original passt.
      if (!kept.published && Math.abs(kept.laenge_km - t.km) > 0.5) {
        showToast(tr('Du hast diese Tour bearbeitet. Deine Fassung bleibt unter Touren.'), { action: { label: tr('Ansehen'), onPress: () => router.navigate('/touren') } });
        return;
      }
      try {
        // eigene veröffentlichte Tour: nur aus Meine Touren, in der Community bleibt sie
        if (kept.published) await removeKeepPublished(kept);
        else deleteTour(kept.id);
        showToast(tr('Aus Touren entfernt'), kept.published ? {} : { action: { label: tr('Rückgängig'), onPress: () => {
                saveTour(kept, kept.folder);
                void syncLibrary();
              } } });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    setBusy('save');
    try {
      await copyCommunityTour(t);
      // Merken (Muster A, Koray 17.11.): das Touren Symbol fliegt vom Lesezeichen in den Touren Tab
      flyFrom(keepRef.current, { target: 'touren', icon: { tab: 'touren' }, bg: Colors.surface2, fg: Colors.text });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  // Eigene Routen lassen sich nicht merken, sie liegen schon unter Touren (Koray 11.11.). An der Stelle steht
  // das Zeichen für veröffentlicht; Tippen fragt, ob die Route aus der Community soll (Koray 11.11. abends)
  const bookmark = mine ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('{name} ist veröffentlicht. Aus der Community nehmen', { name: t.name })}
      onPress={() => {
        if (!busy) setConfirm(true);
      }}
      hitSlop={4}
      style={({ pressed }) => [styles.round, styles.roundMine, pressed && styles.pressed]}>
      {busy === 'withdraw' ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name="eye.fill" size={20} tintColor={Colors.good} weight="semibold" />}
    </Pressable>
  ) : (
    <Pressable
      ref={keepRef}
      accessibilityRole="button"
      accessibilityLabel={saved ? tr('{name} aus Touren entfernen', { name: t.name }) : tr('{name} unter Touren speichern', { name: t.name })}
      accessibilityState={{ selected: saved, busy: busy === 'save' }}
      onPress={() => void keep()}
      hitSlop={4}
      style={({ pressed }) => [styles.round, saved && styles.roundSaved, pressed && styles.pressed]}>
      {busy === 'save' ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} size={20} tintColor={saved ? Colors.signal : Colors.text} weight="semibold" />}
    </Pressable>
  );

  // Rückfrage als Blatt wie überall (Prüfung 11.11.), nicht mehr „Nochmal tippen“
  const withdrawSheet = (
  <ConfirmSheet
    visible={confirm}
    title={tr('Möchtest du diese Tour wirklich aus der Community entfernen?')}
    text={tr('Andere können sie dann nicht mehr öffnen. Unter Touren bleibt sie dir erhalten.')}
    confirmLabel={tr('Entfernen')}
    onConfirm={() => {
      setBusy('withdraw');
      withdrawCommunityTour(t.id)
        .then(() => onChanged?.())
        .catch((e: Error) => setErr(e.message))
        .finally(() => setBusy(null));
    }}
    onClose={() => setConfirm(false)}
  />
  );

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={2}>{t.name}</AppText>
            {badge}
          </View>
          {bookmark}
        </View>
        <Kennzahlen km={km} minutes={t.minutes} fun={data?.fun} />
        {t.description ? <AppText style={styles.desc} numberOfLines={3}>{t.description}</AppText> : null}
        <Pressable accessibilityRole="button" onPress={() => void open()} style={styles.primary}>
          {busy === 'open' ? (
            <ActivityIndicator color={Colors.onSignal} />
          ) : (
            <IconLabel icon={{ tab: 'planen' }} color={Colors.onSignal}>
              <AppText style={styles.primaryText}>{tr('Im Planer öffnen')}</AppText>
            </IconLabel>
          )}
        </Pressable>
        {!mine && (
          <Pressable accessibilityRole="button" onPress={() => setReport(true)} style={styles.textBtn}>
            <AppText style={styles.textBtnText}>{tr('Tour melden')}</AppText>
          </Pressable>
        )}
        {!mine && <ReportSheet visible={report} kind="tour" refId={t.id} onClose={() => setReport(false)} />}
        {/* Eigene Tour zurückziehen, auch wenn sie nicht mehr unter Touren liegt (Koray 10.11.) */}
        {mine && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!busy) setConfirm(true);
            }}
            style={styles.textBtn}>
            {busy === 'withdraw' ? <ActivityIndicator color={Colors.muted} /> : <AppText style={styles.textBtnText}>{tr('Aus der Community nehmen')}</AppText>}
          </Pressable>
        )}
        {withdrawSheet}
        {err && <AppText variant="caption" style={styles.error}>{err}</AppText>}
      </Animated.View>
    );
  }

  return (
    <Animated.View onLayout={(e) => setTop(Math.round(e.nativeEvent.layout.y))} style={[styles.tourCard, press.style]}>
      <View style={styles.tourRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${meta}, ${mine ? tr('von dir') : author ? tr('von {author}', { author }) : tr('aus der Community')}`}
          accessibilityHint={tr('Öffnet die Route auf der Karte, dort startest du die Fahrt')}
          onPress={() => void open()}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.tourMain}>
          <RouteThumb shape={data?.thumb} fade={fade} />
          <View style={styles.tourText}>
            <AppText style={styles.tourName} numberOfLines={2}>{t.name}</AppText>
            <AppText variant="caption" muted numberOfLines={1} style={styles.num}>{meta}</AppText>
            {badge}
          </View>
          {busy === 'open' && <ActivityIndicator color={Colors.muted} />}
        </Pressable>
        <FunMark score={data?.fun} reserve />
        {bookmark}
      </View>
      {err && <AppText variant="caption" style={styles.error}>{err}</AppText>}
      {mine && withdrawSheet}
    </Animated.View>
  );
});

/**
 * Ausfahrten nach Bedeutung (Koray 12.11.): oben, was heute oder morgen ansteht (mit Losfahrzeit),
 * dann „Deine nächsten“ (zugesagt oder eigene), dann „Offen für alle“. Plant dabei die Erinnerungen.
 */
function RideSections({ rides }: { rides: Ausfahrt[] }) {
  const { p } = usePrivacy();
  const home = p?.home ?? null;
  const mine = rides.filter((r) => r.isOwner || r.myStatus === 'zugesagt');
  const soon = mine.filter((r) => r.rideStatus === 'geplant' && (relDay(r.startsAt) === 'Heute' || relDay(r.startsAt) === 'Morgen'));
  const next = mine.filter((r) => !soon.includes(r));
  const other = rides.filter((r) => !mine.includes(r));
  const key = mine.map((r) => `${r.id}:${r.startsAt.getTime()}:${r.rideStatus}`).join('|');
  useEffect(() => {
    void syncRideReminders(mine, home);
    // nur bei echter Änderung der eigenen Fahrten oder des Wohnorts neu planen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, home?.[0], home?.[1]]);
  return (
    <>
      {soon.map((r) => <SoonCard key={r.id} r={r} home={home} />)}
      {next.length > 0 && <AppText style={styles.section}>{tr('Deine nächsten')}</AppText>}
      {next.map((r) => <RideCard key={r.id} r={r} />)}
      {other.length > 0 && mine.length > 0 && <AppText style={styles.section}>{tr('Offen für alle')}</AppText>}
      {other.map((r) => <RideCard key={r.id} r={r} />)}
    </>
  );
}

/** Heute oder morgen: Losfahrzeit aus der Anfahrt, Treffpunkt und Route dorthin. Heute vom aktuellen Standort
 *  (Tester 15.11.), morgen vom Wohnort, sonst gibt es noch keinen sinnvollen Ausgangspunkt. */
function SoonCard({ r, home }: { r: Ausfahrt; home: LatLon | null }) {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const today = relDay(r.startsAt) === 'Heute';
    void (today ? currentSpot() : Promise.resolve(home)).then((from) => approachMinutes(r, from)).then((m) => live && setMin(m));
    return () => {
      live = false;
    };
  }, [r, home]);
  const to = r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : r.start;
  const place = r.meeting?.name || tr('Start der Tour');
  const others = Math.max(0, r.taken - 1);
  return (
    <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityHint={tr('Öffnet die Ausfahrt')} onPress={() => router.push({ pathname: '/ausfahrt/[id]', params: { id: r.id } })} style={styles.soonHead}>
        <AppText style={styles.soonWhen}>{relDay(r.startsAt)}</AppText>
        <AppText style={styles.bigName} numberOfLines={2}>{r.name}</AppText>
      </Pressable>
      <View style={styles.metrics}>
        {min != null && <Metric label={tr('Losfahren')} value={clock(departAt(r, min))} />}
        <Metric label={tr('Treffpunkt')} value={clock(r.startsAt)} />
        {min != null && <Metric label={tr('Anfahrt')} value={min >= 60 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} H` : `${min} MIN`} />}
      </View>
      <AppText muted>{[place, r.isOwner ? tr('du organisierst') : `${r.ownerName}${others > 1 ? tr(' und {v0} weitere', { v0: others - 1 }) : ''}`].join('  ·  ')}</AppText>
      {/* eigene Navigation, Schnell voreingestellt (Koray 14.11.: nie Apple Karten oder Google Maps) */}
      {to ? <MeetingRoute to={to} place={place} /> : null}
    </Animated.View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText style={styles.metricLabel}>{label}</AppText>
      <AppText style={styles.metricValue}>{value}</AppText>
    </View>
  );
}

function rideAction(r: Ausfahrt): string {
  if (r.isCancelled) return tr('Ausfahrt ansehen');
  if (r.isOwner) return r.openRequests ? (r.openRequests === 1 ? tr('Anfrage ansehen') : tr('{openRequests} Anfragen ansehen', { openRequests: r.openRequests })) : tr('Ausfahrt ansehen');
  if (r.myStatus === 'zugesagt') return tr('Zur Ausfahrt');
  if (r.myStatus === 'angefragt') return tr('Anfrage ansehen');
  if (r.myStatus === 'eingeladen') return tr('Einladung ansehen');
  return freeSeats(r) > 0 ? tr('Mitfahren anfragen') : tr('Ausfahrt ansehen');
}

function RideCard({ r, big }: { r: Ausfahrt; big?: boolean }) {
  const press = usePress();
  const open = () => router.push({ pathname: '/ausfahrt/[id]', params: { id: r.id } });
  const arr = arrival(r);
  // Treffpunkt immer als Ort (K6); ohne gewählten Treffpunkt steht nichts statt „Rundtour“
  const where = r.meeting?.name ? tr('ab {name}', { name: r.meeting.name }) : null;
  const free = freeSeats(r);
  const fun = useRideFun(r.id);
  const status = !r.isOwner && (!r.myStatus || r.myStatus === 'abgesagt') && free > 0 ? null : <RideStatus r={r} />;

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <DateBlock d={r.startsAt} />
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={2}>{r.name}</AppText>
            <AppText muted numberOfLines={1}>{fmtMeta(wann(r.startsAt), where)}</AppText>
          </View>
        </View>
        <Kennzahlen km={r.km} minutes={r.minutes} fun={fun} />
        {!r.roundTrip && arr ? <AppText muted>{tr('Ankunft etwa {v0}{v1}', { v0: clock(arr), v1: r.goalName ? ` in ${r.goalName}` : '' })}</AppText> : null}
        <View style={styles.row}>
          <AppText muted style={styles.flex} numberOfLines={1}>{tr('Organisiert von ')}{r.isOwner ? 'dir' : r.ownerName}</AppText>
          {status ?? <SeatsBadge free={free} />}
        </View>
        <Pressable accessibilityRole="button" onPress={open} style={styles.primary}>
          <AppText style={styles.primaryText}>{rideAction(r)}</AppText>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={r.isCancelled ? tr('{name}, {v1} {v2} Uhr, abgesagt', { name: r.name, v1: shortDate(r.startsAt), v2: clock(r.startsAt) }) : tr('{name}, {v1} {v2} Uhr{v3}, {free} Plätze frei', { name: r.name, v1: shortDate(r.startsAt), v2: clock(r.startsAt), v3: r.km != null ? `, ${formatKm(r.km, 0)} km` : '', free })}
        onPress={open}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, styles.cardList, styles.row]}>
        <DateBlock d={r.startsAt} />
        <View style={styles.main}>
          <AppText style={styles.name} numberOfLines={2}>{r.name}</AppText>
          <AppText muted numberOfLines={1} style={styles.num}>
            {fmtMeta(wann(r.startsAt), r.km != null ? strecke(r.km) : null)}
          </AppText>
          <AppText muted numberOfLines={1}>{where ?? tr('Von {ownerName}', { ownerName: r.ownerName })}</AppText>
          {status ?? <SeatsBadge free={free} />}
        </View>
        <FunMark score={fun} reserve />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, marginTop: Spacing.m },
  soonHead: { gap: Spacing.xs },
  soonWhen: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  root: { flex: 1, backgroundColor: Colors.ground },
  flex: { flex: 1 },
  head: { gap: Spacing.m, paddingBottom: Spacing.s },
  headRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: Spacing.s },
  // Überschrift des Bereichs in der Headline Schrift (Koray 10.11.), wie Meine Touren
  kicker: { flex: 1, fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: Leading.h2, textTransform: 'uppercase', color: Colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: Size.icon, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  addText: { fontFamily: Fonts.bold, fontSize: Type.body },
  body: { gap: Spacing.s, paddingBottom: Spacing.xl },
  segWrap: { position: 'absolute', left: Spacing.l, right: Spacing.l, alignItems: 'flex-start' },
  seg: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', height: 44, padding: 4, gap: 2, borderRadius: 22, backgroundColor: Colors.overlaySurface, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' },
  segItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, minWidth: 40, paddingHorizontal: 11, borderRadius: 18 },
  segOn: { paddingLeft: 12, paddingRight: 14 },
  segFill: { backgroundColor: Colors.text },
  segThumb: { position: 'absolute', left: 0, top: 4, height: 36, borderRadius: 18, backgroundColor: Colors.text },
  segLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.ground },
  segCount: { fontFamily: Fonts.bold, fontSize: 12, color: Colors.ground, opacity: 0.55, fontVariant: ['tabular-nums'] },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.signal, borderWidth: 1.5, borderColor: Colors.overlaySurface },
  badgeText: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: 11, lineHeight: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  cardList: { paddingVertical: Spacing.m },
  main: { flex: 1, gap: 3, minHeight: 56, justifyContent: 'center' },
  num: { fontVariant: ['tabular-nums'] },
  desc: { color: Colors.text, opacity: 0.8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  roundMine: { backgroundColor: Colors.goodTint },
  roundSaved: { backgroundColor: Colors.signalTint },
  pressed: { opacity: 0.7 },
  // Routenkarte in der Liste: Maße wie TourCard in Meine Touren
  tourCard: { backgroundColor: Colors.surface, borderRadius: Radius.l + 4, padding: Spacing.m, gap: Spacing.m, overflow: 'hidden' },
  tourRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  tourMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 56 },
  tourText: { flex: 1, gap: 3 },
  tourName: { fontFamily: Fonts.semibold, fontSize: Type.title, lineHeight: 21 },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title },
  bigName: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, textTransform: 'uppercase' },
  metrics: { flexDirection: 'row', gap: Spacing.xxl },
  metric: { gap: 2 },
  metricLabel: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  metricValue: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, fontVariant: ['tabular-nums'] },
  dsegRow: { flexDirection: 'row', gap: Spacing.s },
  search: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.button },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.bold, fontSize: Type.button },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
  textBtn: { height: Size.chip, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: Spacing.xl },
  textBtnText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
});
