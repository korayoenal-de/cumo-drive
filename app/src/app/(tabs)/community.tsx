/**
 * Community (Konzept Koray 9.11.): Karte mit Pins und Blatt darüber. Oben ein Umschalter
 * Routen oder Ausfahrten; er filtert Karte und Liste zugleich.
 * Routen: veröffentlichte Touren zum Nachfahren (Tippen öffnet sie im Planer, Lesezeichen speichert).
 * Ausfahrten: anstehende Gruppenfahrten mit Zeit und Treffpunkt; Mitfahren anfragen, der
 * Organisator nimmt an, danach Chat und am Tag die Gruppenfahrt.
 */
import { router, useFocusEffect } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityMap, type CommunityPin } from '@/components/community/community-map';
import { DateBlock, RideStatus } from '@/components/community/ride-bits';
import { Chip } from '@/components/ui/chip';
import { MapSheet, type Detent } from '@/components/ui/map-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { arrival, ausfahrtTour, clock, freeSeats, listAusfahrten, shortDate, type Ausfahrt } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { copyCommunityTour, listCommunity, loadCommunityTour, type CommunityTour } from '@/lib/community';
import { setEditTour } from '@/lib/edit-tour';
import { formatMinutes } from '@/lib/intent';
import { formatKm, type LatLon } from '@/lib/tour';

type Seg = 'routen' | 'ausfahrten';
type Sort = 'neu' | 'kurven' | 'kurz' | 'lang';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'kurven', label: 'Kurvigste' },
  { id: 'kurz', label: 'Kurz' },
  { id: 'lang', label: 'Lang' },
];

export default function Community() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<Seg>('routen');
  const [tours, setTours] = useState<CommunityTour[] | null>(null);
  const [rides, setRides] = useState<Ausfahrt[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('neu');
  const [detent, setDetent] = useState<Detent>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [line, setLine] = useState<LatLon[] | null>(null);
  const lines = useRef(new Map<string, LatLon[]>());
  const selRef = useRef<string | null>(null);
  const userId = session?.user.id;

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
    const l = (tours ?? []).filter((t) => !n || t.name.toLowerCase().includes(n) || (t.author ?? '').toLowerCase().includes(n) || (t.description ?? '').toLowerCase().includes(n));
    const density = (t: CommunityTour) => (t.curves ?? 0) / Math.max(1, Number(t.km));
    if (sort === 'kurven') l.sort((a, b) => density(b) - density(a));
    if (sort === 'kurz') l.sort((a, b) => Number(a.km) - Number(b.km));
    if (sort === 'lang') l.sort((a, b) => Number(b.km) - Number(a.km));
    return l;
  }, [tours, q, sort]);

  const pins: CommunityPin[] = useMemo(() => {
    if (seg === 'routen')
      return shownTours.filter((t) => t.start_lat != null && t.start_lon != null).map((t) => ({ id: t.id, kind: 'route', p: [t.start_lat as number, t.start_lon as number], label: `${formatKm(Number(t.km), 0)} km` }));
    return (rides ?? [])
      .map((r) => ({ r, p: r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : r.start }))
      .filter((x): x is { r: Ausfahrt; p: LatLon } => !!x.p)
      .map(({ r, p }) => ({ id: r.id, kind: 'ausfahrt', p, label: shortDate(r.startsAt), count: r.taken }));
  }, [seg, shownTours, rides]);

  const openRequests = (rides ?? []).reduce((n, r) => n + (r.isOwner ? r.openRequests : 0), 0);
  const selTour = seg === 'routen' ? tours?.find((t) => t.id === selected) ?? null : null;
  const selRide = seg === 'ausfahrten' ? rides?.find((r) => r.id === selected) ?? null : null;

  const select = (id: string | null) => {
    selRef.current = id;
    setSelected(id);
    if (!id) {
      setLine(null);
      return;
    }
    setDetent(0);
    const cached = lines.current.get(id);
    if (cached) {
      setLine(cached);
      return;
    }
    setLine(null);
    const kind = seg;
    (kind === 'routen' ? loadCommunityTour(id) : ausfahrtTour(id))
      .then((full) => {
        if (!full) return;
        const pts = full.tour.linie.flatMap((l) => l.p);
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

  const segControl = (
    <View style={styles.seg} accessibilityRole="tablist">
      <SegItem label="Routen" icon="point.topleft.down.to.point.bottomright.curvepath" count={tours?.length ?? null} on={seg === 'routen'} onPress={() => switchSeg('routen')} />
      <SegItem label="Ausfahrten" icon="calendar" count={userId ? rides?.length ?? null : null} badge={openRequests} on={seg === 'ausfahrten'} onPress={() => switchSeg('ausfahrten')} />
    </View>
  );

  const header = (
    <View style={styles.head}>
      {/* ganz offen liegt das Blatt oben an, dann steht der Umschalter im Blatt */}
      {detent === 2 && segControl}
      <View style={styles.headRow}>
        <AppText style={styles.kicker}>{seg === 'routen' ? 'Routen zum Nachfahren' : 'Gemeinsame Ausfahrten'}</AppText>
        {seg === 'ausfahrten' && userId && (
          <Pressable accessibilityRole="button" accessibilityLabel="Ausfahrt anlegen" hitSlop={4} onPress={() => router.push('/ausfahrt/neu')} style={styles.addBtn}>
            <SymbolView name="plus" size={16} weight="bold" tintColor={Colors.text} />
            <AppText style={styles.addText}>Anlegen</AppText>
          </Pressable>
        )}
      </View>
      {selTour && <RouteCard key={selTour.id} t={selTour} mine={userId === selTour.owner} big />}
      {selRide && <RideCard key={selRide.id} r={selRide} big />}
    </View>
  );

  return (
    <View style={styles.root}>
      <MapSheet
        detent={detent}
        onDetentChange={setDetent}
        grabberLabel={seg === 'routen' ? 'Liste der Routen' : 'Liste der Ausfahrten'}
        header={header}
        background={(covered) => (
          <CommunityMap pins={pins} selected={selected} onSelect={select} line={line} bottom={covered} top={topH} style={StyleSheet.absoluteFill} />
        )}>
        {seg === 'routen' ? (
          <View style={styles.body}>
            <TextInput value={q} onChangeText={setQ} placeholder="Routen, Regionen oder Fahrer suchen" placeholderTextColor={Colors.muted} style={styles.search} accessibilityLabel="Routen durchsuchen" returnKeyType="search" />
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
                <AppText muted>Sei der Erste: Öffne eine Tour unter Meine Touren und tippe auf Veröffentlichen.</AppText>
              </View>
            )}
            {tours && tours.length > 0 && shownTours.length === 0 && <AppText muted>Keine Route passt zur Suche.</AppText>}
            {shownTours
              .filter((t) => t.id !== selected)
              .map((t) => (
                <RouteCard key={t.id} t={t} mine={userId === t.owner} />
              ))}
          </View>
        ) : (
          <View style={styles.body}>
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

      {detent < 2 && (
        <View style={[styles.segWrap, { top: insets.top + Spacing.s }]} pointerEvents="box-none">
          {segControl}
        </View>
      )}
    </View>
  );
}

/**
 * Glaspille (Konzept A, Koray 10.11.): aktive Ansicht weiß mit Wort und Zahl, die anderen nur als
 * Symbol. Beim Wechsel gleitet die weiße Fläche mit Feder, das Wort blendet auf.
 */
function SegItem({ label, icon, count, badge, on, onPress }: { label: string; icon: SFSymbol; count: number | null; badge?: number; on: boolean; onPress: () => void }) {
  return (
    <Animated.View layout={LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness)}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}${count != null ? `, ${count}` : ''}${badge ? `, ${badge} offene Anfragen` : ''}`}
        hitSlop={4}
        onPress={onPress}
        style={[styles.segItem, on && styles.segOn]}>
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

/** Route: Tippen öffnet sie im Planer, das Lesezeichen übernimmt sie in Meine Touren. */
function RouteCard({ t, mine, big }: { t: CommunityTour; mine: boolean; big?: boolean }) {
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const press = usePress();
  const km = Number(t.km);
  const meta = [`${formatKm(km, 0)} km`, t.minutes ? formatMinutes(t.minutes) : null, t.curves ? `${t.curves} Kurven` : null].filter(Boolean).join('  ·  ');

  const open = async () => {
    if (busy) return;
    setBusy('open');
    setErr(null);
    try {
      const full = await loadCommunityTour(t.id);
      const now = new Date().toISOString();
      // ungespeicherte Kopie: ohne id, Speichern im Planer legt sie unter Community in Meine Touren
      setEditTour({ ...full.tour, name: t.name, id: '', folder: 'Community', createdAt: now, updatedAt: now, curves: t.curves ?? undefined, profile: full.profile });
      router.navigate('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const keep = async () => {
    if (busy || saved) return;
    setBusy('save');
    setErr(null);
    try {
      await copyCommunityTour(t);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const bookmark = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? 'In Meine Touren gespeichert' : 'In Meine Touren speichern'}
      accessibilityState={{ disabled: saved, busy: busy === 'save' }}
      onPress={() => void keep()}
      hitSlop={4}
      style={[styles.round, saved && styles.roundSaved]}>
      {busy === 'save' ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} size={19} tintColor={saved ? Colors.signal : Colors.text} weight="semibold" />}
    </Pressable>
  );

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={2}>{t.name}</AppText>
            <AppText variant="caption" muted numberOfLines={1}>{mine ? 'Von dir' : `Von ${t.author || 'einem Fahrer'}`}</AppText>
          </View>
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
        {err && <AppText variant="caption" style={styles.error}>{err}</AppText>}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, styles.cardList, press.style]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${meta}`}
          accessibilityHint="Öffnet die Route auf der Karte, dort startest du die Fahrt"
          onPress={() => void open()}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.main}>
          <AppText style={styles.name} numberOfLines={2}>{t.name}</AppText>
          <AppText variant="caption" muted numberOfLines={1} style={styles.num}>{meta}</AppText>
          <AppText variant="caption" muted numberOfLines={1}>{mine ? 'Von dir' : `Von ${t.author || 'einem Fahrer'}`}</AppText>
          {t.description ? <AppText variant="caption" style={styles.desc} numberOfLines={2}>{t.description}</AppText> : null}
        </Pressable>
        {bookmark}
      </View>
      {err && <AppText variant="caption" style={styles.error}>{err}</AppText>}
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
  kicker: { flex: 1, fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: Size.icon, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  addText: { fontFamily: Fonts.bold, fontSize: Type.body },
  body: { gap: Spacing.s, paddingBottom: Spacing.xl },
  segWrap: { position: 'absolute', left: Spacing.l, right: Spacing.l, alignItems: 'flex-start' },
  seg: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', height: 44, padding: 4, gap: 2, borderRadius: 22, backgroundColor: Colors.overlaySurface, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' },
  segItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, minWidth: 40, paddingHorizontal: 11, borderRadius: 18 },
  segOn: { backgroundColor: Colors.text, paddingLeft: 12, paddingRight: 14 },
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
});
