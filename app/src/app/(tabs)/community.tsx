/**
 * Community (Konzept Koray 9.11.): Karte mit Pins und Blatt darüber. Oben ein Umschalter
 * Routen oder Ausfahrten; er filtert Karte und Liste zugleich.
 * Routen: veröffentlichte Touren zum Nachfahren (Tippen öffnet sie im Planer, Lesezeichen speichert).
 * Ausfahrten: anstehende Gruppenfahrten mit Zeit und Treffpunkt; Mitfahren anfragen, der
 * Organisator nimmt an, danach Chat und am Tag die Gruppenfahrt.
 * Drivers (Koray 10.11.): Mitglieder an ihrem Wohnort, Fuhrpark und Anschreiben.
 */
import { router, useFocusEffect } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityMap, type CommunityPin } from '@/components/community/community-map';
import { DriverCard, ringColor } from '@/components/community/driver-card';
import { DateBlock, RideStatus } from '@/components/community/ride-bits';
import { FromBadge, FunMark, GoodBadge, RouteThumb } from '@/components/tours/tour-bits';
import { Chip } from '@/components/ui/chip';
import { MapSheet, type Detent } from '@/components/ui/map-sheet';
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { arrival, ausfahrtTour, clock, freeSeats, listAusfahrten, shortDate, type Ausfahrt } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { kmBetween, listConversations, listDrivers, refreshUnread, useUnreadMessages, type Driver } from '@/lib/drivers';
import { copyCommunityTour, listCommunity, loadCommunityTour, removeKeepPublished, withdrawCommunityTour, type CommunityTour } from '@/lib/community';
import { deleteTour, saveTour, syncLibrary, useLibrary } from '@/lib/library';
import { showToast } from '@/lib/toast';
import { requestCommunityLine, setListReach, useCommunityLine, useInReach } from '@/lib/community-lines';
import { setEditTour } from '@/lib/edit-tour';
import { InvitesList, useInviteCount } from '@/components/group/invites-banner';
import { formatKm, type LatLon } from '@/lib/tour';
import { looksLikeAddress, searchAddress } from '@/lib/address-search';
import { searchTowns, type Place } from '@/lib/geocode';

type Seg = 'routen' | 'ausfahrten' | 'drivers';
type Sort = 'neu' | 'kurven' | 'kurz' | 'lang';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'kurven', label: 'Kurvigste' },
  { id: 'kurz', label: 'Kurz' },
  { id: 'lang', label: 'Lang' },
];

/** Umkreis für die Ortssuche in Routen */
const NEAR_KM = 50;

export default function Community() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<Seg>('routen');
  const [tours, setTours] = useState<CommunityTour[] | null>(null);
  const [rides, setRides] = useState<Ausfahrt[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [dq, setDq] = useState('');
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
    listAusfahrten()
      .then(setRides)
      .catch(() => setRides((r) => r ?? []));
    listDrivers()
      .then(setDrivers)
      .catch(() => setDrivers((d) => d ?? []));
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
    const l = (drivers ?? []).filter((d) => !n || d.name.toLowerCase().includes(n) || (d.homeName ?? '').toLowerCase().includes(n) || (d.car ?? '').toLowerCase().includes(n) || (d.garage ?? []).some((g) => g.name.toLowerCase().includes(n)));
    const dist = (d: Driver) => (me?.home && d.home ? kmBetween(me.home, d.home) : Number.POSITIVE_INFINITY);
    return l.sort((a, b) => Number(b.isMe) - Number(a.isMe) || dist(a) - dist(b) || a.name.localeCompare(b.name, 'de'));
  }, [drivers, dq]);

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
    setSeg(s);
    selRef.current = null;
    setSelected(null);
    setLine(null);
    setDetent(1);
  };

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
        thumbX.set(withSpring(b.x, Motion.snap));
        thumbW.set(withSpring(b.w, Motion.snap));
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
      <SegItem label="Routen" icon="point.topleft.down.to.point.bottomright.curvepath" count={tours?.length ?? null} on={seg === 'routen'} onPress={() => switchSeg('routen')} onBox={onSegBox('routen')} ownFill={!thumbReady} />
      <SegItem label="Ausfahrten" icon="calendar" count={userId ? rides?.length ?? null : null} badge={openRequests + inviteCount} on={seg === 'ausfahrten'} onPress={() => switchSeg('ausfahrten')} onBox={onSegBox('ausfahrten')} ownFill={!thumbReady} />
      <SegItem label="Drivers" icon="person.2" count={userId ? drivers?.length ?? null : null} badge={unread} on={seg === 'drivers'} onPress={() => switchSeg('drivers')} onBox={onSegBox('drivers')} ownFill={!thumbReady} />
    </View>
  );

  const header = (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <AppText style={styles.kicker}>{seg === 'routen' ? 'Routen zum Nachfahren' : seg === 'ausfahrten' ? 'Gemeinsame Ausfahrten' : 'Drivers'}</AppText>
        {seg === 'drivers' && userId && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Nachrichten${unread ? `, ${unread} ungelesen` : ''}`} hitSlop={4} onPress={() => router.push('/nachrichten')} style={styles.addBtn}>
            <SymbolView name="bubble.left.and.bubble.right" size={16} weight="semibold" tintColor={Colors.text} />
            <AppText style={styles.addText}>Nachrichten</AppText>
            {unread > 0 && (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{unread}</AppText>
              </View>
            )}
          </Pressable>
        )}
        {seg === 'ausfahrten' && userId && (
          <Pressable accessibilityRole="button" accessibilityLabel="Ausfahrt anlegen" hitSlop={4} onPress={() => router.push('/ausfahrt/neu')} style={styles.addBtn}>
            <SymbolView name="plus" size={16} weight="bold" tintColor={Colors.text} />
            <AppText style={styles.addText}>Anlegen</AppText>
          </Pressable>
        )}
      </View>
      {selTour && <RouteCard key={selTour.id} t={selTour} mine={userId === selTour.owner} big onChanged={() => { select(null); load(); }} />}
      {selRide && <RideCard key={selRide.id} r={selRide} big />}
    </View>
  );

  return (
    <View style={styles.root}>
      <MapSheet
        scrollRef={scroll}
        detent={detent}
        onDetentChange={setDetent}
        grabberLabel={seg === 'routen' ? 'Liste der Routen' : seg === 'ausfahrten' ? 'Liste der Ausfahrten' : 'Liste der Drivers'}
        onScrollY={onScrollY}
        topReserve={topH + Spacing.s}
        header={header}
        background={(covered) => (
          <CommunityMap pins={pins} selected={selected} onSelect={select} line={line} bottom={covered} top={topH} style={StyleSheet.absoluteFill} />
        )}>
        {seg === 'routen' ? (
          <View style={styles.body}>
            <TextInput maxFontSizeMultiplier={1.2} value={q} onChangeText={setQ} placeholder="Route, Fahrer, Ort oder PLZ suchen" placeholderTextColor={Colors.muted} style={styles.search} accessibilityLabel="Routen durchsuchen" returnKeyType="search" />
            <View style={styles.wrap}>
              {SORTS.map((s) => (
                <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
              ))}
            </View>
            {err && <AppText style={styles.error}>Community konnte nicht geladen werden: {err}</AppText>}
            {tours === null && !err && <ActivityIndicator color={Colors.muted} />}
            {tours?.length === 0 && (
              <View style={styles.card}>
                <AppText variant="title">Noch keine Routen veröffentlicht</AppText>
                <AppText muted>Sei der Erste: Öffne eine Tour unter Touren und tippe auf Veröffentlichen.</AppText>
              </View>
            )}
            {nearNow && <AppText muted>Auch Routen mit Start im Umkreis von {NEAR_KM} km um {nearNow.name}</AppText>}
            {tours && tours.length > 0 && shownTours.length === 0 && <AppText muted>{nearNow ? `Keine Route startet im Umkreis von ${NEAR_KM} km um ${nearNow.name}.` : 'Keine Route passt zur Suche.'}</AppText>}
            {shownTours
              .filter((t) => t.id !== selected)
              .map((t) => (
                <RouteCard key={t.id} t={t} mine={userId === t.owner} />
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
                <AppText variant="title">Drivers mit Konto</AppText>
                <AppText muted>Melde dich an, um andere Mitglieder zu sehen und anzuschreiben.</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.secondary}>
                  <AppText style={styles.secondaryText}>Anmelden</AppText>
                </Pressable>
              </View>
            ) : drivers === null ? (
              <ActivityIndicator color={Colors.muted} />
            ) : (
              <>
                {meDriver && !meDriver.home && (
                  <View style={styles.card}>
                    <AppText variant="title">Zeig dich auf der Karte</AppText>
                    <AppText muted>Trag deinen Wohnort in deinem Profil ein. Andere sehen dich dann dort, nur als Ortsmitte.</AppText>
                    <Pressable accessibilityRole="button" onPress={() => router.push('/profil')} style={styles.secondary}>
                      <AppText style={styles.secondaryText}>Wohnort angeben</AppText>
                    </Pressable>
                  </View>
                )}
                <TextInput maxFontSizeMultiplier={1.2} value={dq} onChangeText={setDq} placeholder="Name, Ort oder Auto suchen" placeholderTextColor={Colors.muted} style={styles.search} accessibilityLabel="Drivers durchsuchen" returnKeyType="search" />
                {shownDrivers.length === 0 && <AppText muted>Kein Mitglied passt zur Suche.</AppText>}
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
            {userId && <InvitesList />}
            {!userId ? (
              <View style={styles.card}>
                <AppText variant="title">Ausfahrten mit Konto</AppText>
                <AppText muted>Melde dich an, um anstehende Ausfahrten zu sehen und mitzufahren.</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.secondary}>
                  <AppText style={styles.secondaryText}>Anmelden</AppText>
                </Pressable>
              </View>
            ) : rides === null ? (
              <ActivityIndicator color={Colors.muted} />
            ) : rides.length === 0 ? (
              <View style={styles.card}>
                <AppText variant="title">Noch keine Ausfahrten geplant</AppText>
                <AppText muted>Lade andere zu deiner Lieblingstour ein: mit Zeit, Treffpunkt und freien Plätzen.</AppText>
                <Pressable accessibilityRole="button" onPress={() => router.push('/ausfahrt/neu')} style={styles.secondary}>
                  <AppText style={styles.secondaryText}>Ausfahrt anlegen</AppText>
                </Pressable>
              </View>
            ) : (
              rides.filter((r) => r.id !== selected).map((r) => <RideCard key={r.id} r={r} />)
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
      layout={LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)}
      onLayout={(e) => onBox(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}${count != null ? `, ${count}` : ''}${badge ? `, ${badge} offene Anfragen` : ''}`}
        hitSlop={4}
        onPress={onPress}
        style={[styles.segItem, on && styles.segOn, on && ownFill && styles.segFill]}>
        <View>
          <SymbolView name={icon} size={17} weight="bold" tintColor={on ? Colors.ground : Colors.muted} />
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
  const [confirm, setConfirm] = useState(false);
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
  const meta = useMemo(() => {
    const date = new Date(t.published_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
    return [`${formatKm(km, 0)} km`, t.curves ? `${t.curves} Kurven` : null, date].filter(Boolean).join('  ·  ');
  }, [km, t.curves, t.published_at]);
  const badge = mine ? <GoodBadge label="Von dir" /> : <FromBadge author={author} />;

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
        showToast('Du hast diese Route bearbeitet. Deine Fassung bleibt unter Touren.', { action: { label: 'Ansehen', onPress: () => router.navigate('/touren') } });
        return;
      }
      try {
        // eigene veröffentlichte Tour: nur aus Meine Touren, in der Community bleibt sie
        if (kept.published) await removeKeepPublished(kept);
        else deleteTour(kept.id);
        showToast('Aus Touren entfernt', kept.published ? {} : { action: { label: 'Rückgängig', onPress: () => {
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
      showToast('Gespeichert unter Touren');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const bookmark = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `${t.name} aus Touren entfernen` : `${t.name} unter Touren speichern`}
      accessibilityState={{ selected: saved, busy: busy === 'save' }}
      onPress={() => void keep()}
      hitSlop={4}
      style={({ pressed }) => [styles.round, saved && styles.roundSaved, pressed && styles.pressed]}>
      {busy === 'save' ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} size={19} tintColor={saved ? Colors.signal : Colors.text} weight="semibold" />}
    </Pressable>
  );

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={2}>{t.name}</AppText>
            {badge}
          </View>
          <FunMark score={data?.fun} />
          {bookmark}
        </View>
        <View style={styles.metrics}>
          <Metric label="Strecke" value={`${formatKm(km, 0)} KM`} />
          {t.minutes ? <Metric label="Fahrzeit" value={`${Math.floor(t.minutes / 60)}:${String(t.minutes % 60).padStart(2, '0')} H`} /> : null}
          {t.curves ? <Metric label="Kurven" value={String(t.curves)} /> : null}
        </View>
        {t.description ? <AppText style={styles.desc} numberOfLines={3}>{t.description}</AppText> : null}
        <Pressable accessibilityRole="button" onPress={() => void open()} style={styles.primary}>
          {busy === 'open' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Im Planer öffnen</AppText>}
        </Pressable>
        {/* Eigene Tour zurückziehen, auch wenn sie nicht mehr unter Touren liegt (Koray 10.11.) */}
        {mine && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!busy) setConfirm(true);
            }}
            style={styles.textBtn}>
            {busy === 'withdraw' ? <ActivityIndicator color={Colors.muted} /> : <AppText style={styles.textBtnText}>Aus der Community nehmen</AppText>}
          </Pressable>
        )}
        {/* Rückfrage als Blatt wie überall (Prüfung 11.11.), nicht mehr „Nochmal tippen“ */}
        <ConfirmSheet
          visible={confirm}
          title="Möchtest du diese Route wirklich aus der Community nehmen?"
          text="Andere können sie dann nicht mehr öffnen. Unter Touren bleibt sie dir erhalten."
          confirmLabel="Herausnehmen"
          onConfirm={() => {
            setBusy('withdraw');
            withdrawCommunityTour(t.id)
              .then(() => onChanged?.())
              .catch((e: Error) => setErr(e.message))
              .finally(() => setBusy(null));
          }}
          onClose={() => setConfirm(false)}
        />
        {err && <AppText variant="caption" style={styles.error}>{err}</AppText>}
      </Animated.View>
    );
  }

  return (
    <Animated.View onLayout={(e) => setTop(Math.round(e.nativeEvent.layout.y))} style={[styles.tourCard, press.style]}>
      <View style={styles.tourRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${meta}, ${mine ? 'von dir' : author ? `von ${author}` : 'aus der Community'}`}
          accessibilityHint="Öffnet die Route auf der Karte, dort startest du die Fahrt"
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
    </Animated.View>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText style={styles.metricLabel}>{label}</AppText>
      <AppText style={styles.metricValue}>{value}</AppText>
    </View>
  );
}

function rideAction(r: Ausfahrt): string {
  if (r.isOwner) return r.openRequests ? (r.openRequests === 1 ? 'Anfrage ansehen' : `${r.openRequests} Anfragen ansehen`) : 'Ausfahrt ansehen';
  if (r.myStatus === 'zugesagt') return 'Zur Ausfahrt';
  if (r.myStatus === 'angefragt') return 'Anfrage ansehen';
  if (r.myStatus === 'eingeladen') return 'Einladung ansehen';
  return freeSeats(r) > 0 ? 'Mitfahren anfragen' : 'Ausfahrt ansehen';
}

function RideCard({ r, big }: { r: Ausfahrt; big?: boolean }) {
  const press = usePress();
  const open = () => router.push({ pathname: '/ausfahrt/[id]', params: { id: r.id } });
  const arr = arrival(r);
  const where = r.meeting?.name ? `Treffpunkt ${r.meeting.name}` : r.roundTrip ? 'Rundtour' : null;
  const free = freeSeats(r);

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <DateBlock d={r.startsAt} />
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={2}>{r.name}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{[`${clock(r.startsAt)} Uhr`, where].filter(Boolean).join('  ·  ')}</AppText>
          </View>
        </View>
        <View style={styles.metrics}>
          {r.km != null && <Metric label="Strecke" value={`${formatKm(r.km, 0)} KM`} />}
          {arr && <Metric label={r.roundTrip ? 'Zurück' : 'Ankunft'} value={clock(arr)} />}
          <Metric label="Plätze" value={free > 0 ? `${free} FREI` : 'VOLL'} />
        </View>
        {!r.roundTrip && r.goalName ? <AppText variant="caption" muted>Ziel: {r.goalName}</AppText> : null}
        <View style={styles.row}>
          <AppText variant="caption" muted style={styles.flex} numberOfLines={1}>Organisiert von {r.isOwner ? 'dir' : r.ownerName}</AppText>
          <RideStatus r={r} />
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
        accessibilityLabel={`${r.name}, ${shortDate(r.startsAt)} ${clock(r.startsAt)} Uhr${r.km != null ? `, ${formatKm(r.km, 0)} km` : ''}, ${free} Plätze frei`}
        onPress={open}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, styles.cardList, styles.row]}>
        <DateBlock d={r.startsAt} />
        <View style={styles.main}>
          <AppText style={styles.name} numberOfLines={2}>{r.name}</AppText>
          <AppText variant="caption" muted numberOfLines={1} style={styles.num}>
            {[`${clock(r.startsAt)} Uhr`, r.km != null ? `${formatKm(r.km, 0)} km` : null, free > 0 ? `${free} frei` : 'voll'].filter(Boolean).join('  ·  ')}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>{where ?? `Von ${r.ownerName}`}</AppText>
        </View>
        <RideStatus r={r} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s, marginBottom: Spacing.xs },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  cardList: { paddingVertical: Spacing.m },
  main: { flex: 1, gap: 3, minHeight: 56, justifyContent: 'center' },
  num: { fontVariant: ['tabular-nums'] },
  desc: { color: Colors.text, opacity: 0.8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
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
  search: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.button },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.bold, fontSize: Type.button },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
  textBtn: { height: Size.chip, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', paddingHorizontal: Spacing.xl },
  textBtnText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
});
