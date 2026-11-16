/**
 * Meine Touren: gespeicherte Touren aus App und Web Planer (ohne Konto auf dem Gerät, angemeldet
 * zusätzlich im Konto) und gefahrene Touren mit Fahrtstatistik je Fahrzeug.
 * Jede gespeicherte Tour ist eine Karte mit Mini Streckenbild: Tippen öffnet sie im Planer (dort
 * losfahren, als Gruppe fahren, ändern und speichern), daneben nur Teilen und Löschen.
 */
import { datum, fahrzeit, meta as fmtMeta, plaetze, strecke, wann } from '@/lib/format';
import { router, useFocusEffect, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { TypoTabs } from '@/components/planner/planner-parts';
import { RouteThumb } from '@/components/tours/tour-bits';
import { TourCard } from '@/components/tours/tour-card';
import { DateBlock } from '@/components/community/ride-bits';
import { clock, listAusfahrten, type Ausfahrt } from '@/lib/ausfahrten';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ConfirmSheet } from '@/components/ui/action-sheet';
import { Chip, ChipRow } from '@/components/ui/chip';
import { SwipeDelete } from '@/components/ui/swipe-delete';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { setEditTour } from '@/lib/edit-tour';
import { backfillAuthors } from '@/lib/community';
import { filterTours, folders, readLibrary, saveTour, syncLibrary, useLibrary, useSyncState, type SavedTour, type SortKey } from '@/lib/library';
import { deleteDrive, getDriveTracks, listDrives, type Drive } from '@/lib/drives';
import { thumbShape } from '@/lib/route-thumb';
import { fmtG } from '@/lib/ride-stats';
import { importTourFile } from '@/lib/route-file';
import { showToast } from '@/lib/toast';
import { countCurves } from '@/lib/stats';
import { flatten, formatKm, type LatLon } from '@/lib/tour';
import { tr } from '@/i18n';

/**
 * Anstehende Ausfahrten oben in Touren (Koray 13.11.): eigene und die, zu denen du eingeladen bist oder
 * angefragt hast. Private Ausfahrten stehen nur hier und nicht in der Community.
 */
function Upcoming() {
  const [rides, setRides] = useState<Ausfahrt[]>([]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listAusfahrten()
        .then((l) => alive && setRides(l.filter((a) => a.rideStatus !== 'beendet' && !a.isOver && (a.isOwner || a.myStatus === 'zugesagt' || a.myStatus === 'eingeladen' || a.myStatus === 'angefragt'))))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );
  if (!rides.length) return null;
  return (
    <View style={styles.upcoming}>
      <AppText style={styles.upLabel}>{tr('Anstehend')}</AppText>
      {rides.map((a) => {
        const state = a.isOwner
          ? fmtMeta(plaetze(Math.max(0, a.maxMembers - a.taken)).text, a.openRequests ? `${a.openRequests} ${a.openRequests === 1 ? 'Anfrage' : 'Anfragen'}` : null)
          : a.myStatus === 'eingeladen'
            ? tr('Einladung von {ownerName}', { ownerName: a.ownerName })
            : a.myStatus === 'angefragt'
              ? tr('Angefragt, wartet auf Antwort')
              : tr('Mit {ownerName}', { ownerName: a.ownerName });
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}, ${clock(a.startsAt)}, ${state}${a.isPublic ? '' : ', privat'}`}
            onPress={() => router.push({ pathname: '/ausfahrt/[id]', params: { id: a.id } })}
            style={({ pressed }) => [styles.upCard, pressed && { opacity: 0.85 }]}>
            <DateBlock d={a.startsAt} />
            <View style={styles.flex}>
              <AppText style={styles.upName} numberOfLines={1}>{a.name}</AppText>
              <AppText muted numberOfLines={1}>{fmtMeta(wann(a.startsAt), a.meeting?.name ? tr('ab {name}', { name: a.meeting.name }) : null, a.km != null ? strecke(a.km) : null)}</AppText>
              <AppText style={a.myStatus === 'eingeladen' || a.openRequests ? styles.upAttn : styles.upMuted} numberOfLines={1}>{state}</AppText>
            </View>
            {!a.isPublic && (
              <View style={styles.privat}>
                <SymbolView name="lock.fill" size={16} weight="semibold" tintColor={Colors.text} />
                <AppText style={styles.privatText}>{tr('Privat')}</AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Vergangene Ausfahrten unter Gefahren (Koray 14.11.): Tippen öffnet den Rückblick mit Chat und Nochmal fahren.
 * Nur wirklich gefahrene (Koray 15.11.): eine Ausfahrt, die nie gestartet wurde, gehört nicht unter Gefahren.
 */
function PastRides() {
  const [rides, setRides] = useState<Ausfahrt[]>([]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listAusfahrten()
        .then((l) => alive && setRides(l.filter((a) => a.isOver && !!a.startedAt && (a.isOwner || a.myStatus === 'zugesagt')).sort((x, y) => y.startsAt.getTime() - x.startsAt.getTime())))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );
  if (!rides.length) return null;
  return (
    <View style={styles.upcoming}>
      <AppText style={styles.upLabel}>{tr('Ausfahrten')}</AppText>
      {rides.map((a) => {
        const state = a.isOwner ? tr('Du hast geführt') : tr('Mit {ownerName}', { ownerName: a.ownerName });
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}, ${state}`}
            onPress={() => router.push({ pathname: '/ausfahrt/[id]', params: { id: a.id } })}
            style={({ pressed }) => [styles.upCard, pressed && { opacity: 0.85 }]}>
            <DateBlock d={a.startedAt ?? a.startsAt} />
            <View style={styles.flex}>
              <AppText style={styles.upName} numberOfLines={1}>{a.name}</AppText>
              <AppText muted numberOfLines={1}>{fmtMeta(a.km != null ? strecke(a.km) : null, a.meeting?.name ? tr('ab {name}', { name: a.meeting.name }) : null)}</AppText>
              <AppText style={styles.upMuted} numberOfLines={1}>{state}</AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'neu', label: tr('Neueste') },
  { id: 'spass', label: tr('Fahrspaß') },
  { id: 'name', label: tr('Name') },
  { id: 'laenge', label: tr('Strecke') },
];

/** Tour im Planer öffnen: dort steht sie auf der Karte, mit Losfahren und Gruppe. */
function openTour(t: SavedTour) {
  setEditTour(t, { label: 'Touren', href: '/touren' });
  router.navigate('/');
}

export default function Touren() {
  const list = useLibrary();
  const session = useSession();
  const sync = useSyncState();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('neu');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<'gespeichert' | 'gefahren'>('gespeichert');

  // GPX oder KML aus Dateien, Mail oder anderen Planern übernehmen
  const importFile = async () => {
    setImportMsg(null);
    try {
      const t = await importTourFile();
      if (!t) return;
      const curves = countCurves(flatten(t).map((x) => x.p));
      const saved = saveTour({ ...t, curves }, 'Importiert');
      setImportMsg(`${saved.name} importiert, ${formatKm(saved.laenge_km, 0)} km.`);
      if (session) void syncLibrary();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : tr('Import hat nicht geklappt.'));
    }
  };

  // Beim Öffnen des Tabs mit dem Konto abgleichen
  useFocusEffect(
    useCallback(() => {
      if (session) void syncLibrary().then(() => backfillAuthors(readLibrary()));
    }, [session]),
  );

  // Übernommene Touren erkennt man an der Plakette „Von …“, ein eigener Filter dafür entfällt (Koray 10.11.)
  const dirs = useMemo(() => folders(list).filter((d) => d !== 'Community'), [list]);
  const shown = useMemo(() => filterTours(list, q, folder, sort), [list, q, folder, sort]);

  return (
    <Screen>
      {/* Import als Symbol neben der Überschrift statt großem Knopf (Koray 8.11.) */}
      <View style={styles.titleRow}>
        <AppText variant="display" style={styles.flex} numberOfLines={1} adjustsFontSizeToFit>{tr('Touren')}</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('GPX oder KML importieren')}
          onPress={() => void importFile()}
          hitSlop={6}
          style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.75 }]}>
          <SymbolView name="square.and.arrow.down" size={20} weight="semibold" tintColor={Colors.text} />
        </Pressable>
      </View>
      {importMsg && <AppText variant="caption" muted>{importMsg}</AppText>}

      {session && <Upcoming />}

      {/* Wie im Planer: Reiter als große Schrift, aktiv hell, inaktiv grau (Koray 8.11.) */}
      <TypoTabs
        value={tab}
        options={[
          { id: 'gespeichert', label: tr('Gespeichert') },
          { id: 'gefahren', label: tr('Gefahren') },
        ]}
        onChange={setTab}
      />

      {tab === 'gefahren' ? (
        <>
          {session && <PastRides />}
          <Drives loggedIn={!!session} />
        </>
      ) : (
        <>

      {(sync.running || sync.error) && (
        <View style={styles.syncRow}>
          {sync.running && <ActivityIndicator color={Colors.muted} />}
          <AppText variant="caption" muted style={styles.flex}>
            {sync.running ? tr('Wird mit deinem Konto abgeglichen') : tr('Abgleich hat nicht geklappt: {error}', { error: sync.error })}
          </AppText>
        </View>
      )}


      {list.length === 0 ? (
        <View style={styles.card}>
          <AppText variant="title">{tr('Noch keine Tour gespeichert')}</AppText>
          <AppText muted>{tr('Plan eine Tour oder eine Rundtour und tippe auf Speichern. Dann landet sie hier.')}</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/')} style={styles.primary}>
            <AppText style={styles.primaryText}>{tr('Tour planen')}</AppText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.gapM}>
            <TextInput maxFontSizeMultiplier={1.2}
              value={q}
              onChangeText={setQ}
              placeholder={tr('Touren durchsuchen')}
              placeholderTextColor={Colors.muted}
              style={styles.search}
              accessibilityLabel={tr('Touren durchsuchen')}
              returnKeyType="search"
            />
            {/* Chips in einer Zeile, seitlich wischbar bis an den Rand (Koray 15.11.) */}
            {dirs.length > 0 && (
              <ChipRow>
                <Chip label={tr('Alle')} active={folder === null} onPress={() => setFolder(null)} />
                {dirs.map((d) => (
                  <Chip key={d} label={d} active={folder === d} onPress={() => setFolder(folder === d ? null : d)} />
                ))}
              </ChipRow>
            )}
            <ChipRow>
              {SORTS.map((s) => (
                <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
              ))}
            </ChipRow>
          </View>

          <View style={styles.list}>
            {shown.length === 0 && <AppText muted>{tr('Keine Tour passt zur Suche.')}</AppText>}
            {shown.map((t) => (
              <TourCard key={t.id} tour={t} onOpen={openTour} />
            ))}
          </View>
        </>
      )}
        </>
      )}
    </Screen>
  );
}

/** Spuren so vieler Fahrten auf einmal laden (die obersten der Liste, weitere beim Blättern nicht nötig) */
const TRACKS_FIRST = 30;

/** Gefahrene Touren aus dem Konto, filterbar nach Fahrzeug. */
function Drives({ loggedIn }: { loggedIn: boolean }) {
  const [list, setList] = useState<Drive[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [car, setCar] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState<Drive | null>(null);
  const [tracks, setTracks] = useState<Record<string, LatLon[]>>({});
  // Spuren der obersten Fahrten nachladen: die Liste steht sofort, die Streckenbilder kommen dazu
  const firstIds = useMemo(() => (list ?? []).slice(0, TRACKS_FIRST).map((d) => d.id).join(','), [list]);
  useEffect(() => {
    if (!firstIds) return;
    let live = true;
    getDriveTracks(firstIds.split(','))
      .then((t) => live && setTracks((old) => ({ ...old, ...t })))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [firstIds]);
  useFocusEffect(
    useCallback(() => {
      if (!loggedIn) return;
      listDrives()
        .then((l) => {
          setList(l);
          setErr(null);
        })
        .catch((e: Error) => setErr(e.message));
    }, [loggedIn]),
  );
  if (!loggedIn)
    return (
      <View style={styles.card}>
        <AppText variant="title">{tr('Fahrten mit Konto')}</AppText>
        <AppText muted>{tr('Melde dich unter Einstellungen an. Dann landet nach jeder Navigation die Fahrtstatistik hier, sortiert nach Fahrzeug.')}</AppText>
      </View>
    );
  const cars = [...new Map((list ?? []).filter((d) => d.vehicle_id).map((d) => [d.vehicle_id as string, d.vehicle_name || tr('Fahrzeug')])).entries()];
  const shown = (list ?? []).filter((d) => !car || d.vehicle_id === car);
  const totalKm = shown.reduce((s, d) => s + Number(d.km), 0);
  return (
    <View style={styles.gapM}>
      {cars.length > 0 && (
        <ChipRow>
          <Chip label={tr('Alle Fahrzeuge')} active={car === null} onPress={() => setCar(null)} />
          {cars.map(([id, name]) => (
            <Chip key={id} label={name} active={car === id} onPress={() => setCar(car === id ? null : id)} />
          ))}
        </ChipRow>
      )}
      {err && <AppText style={styles.dangerText}>{err}</AppText>}
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {list?.length === 0 && (
        <View style={styles.card}>
          <AppText muted>{tr('Noch keine Fahrt gespeichert. Nach jeder Navigation landet die Fahrtstatistik hier.')}</AppText>
        </View>
      )}
      {shown.length > 0 && (
        <AppText style={styles.total}>
          {strecke(totalKm)} in {shown.length} {shown.length === 1 ? tr('Fahrt') : tr('Fahrten')}
        </AppText>
      )}
      <View style={styles.list}>
        {shown.map((d) => {
          const line = tracks[d.id];
          return (
            // Von rechts nach links wischen zeigt Löschen, mit Rückfrage (Koray 15.11.)
            <Swipeable
              key={d.id}
              friction={1.6}
              rightThreshold={36}
              overshootRight={false}
              containerStyle={styles.swipeBox}
              renderRightActions={(prog, _tr, m) => (
                <SwipeDelete
                  progress={prog}
                  label={tr('Fahrt {name} löschen', { name: d.name })}
                  onPress={() => {
                    m.close();
                    setAskDelete(d);
                  }}
                />
              )}>
            <DriveCard line={line} label={d.name} onOpen={() => router.push(`/fahrt/${d.id}` as Href)} onDelete={() => setAskDelete(d)}>
              <View style={[styles.rowMain, styles.flex]}>
                <View style={styles.row}>
                  <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                    {d.name}
                  </AppText>
                  <AppText muted>{datum(new Date(d.started_at))}</AppText>
                </View>
                <AppText muted>
                  {fmtMeta(strecke(Number(d.km)), fahrzeit(d.moving_min), d.curves ? `${d.curves} Kurven` : null, d.max_lat_g ? tr('quer {v0}', { v0: fmtG(Number(d.max_lat_g)) }) : null, d.vehicle_name)}
                </AppText>
              </View>
            </DriveCard>
            </Swipeable>
          );
        })}
      </View>
      <ConfirmSheet
        visible={!!askDelete}
        title={tr('Möchtest du diese Fahrt wirklich löschen?')}
        text={askDelete ? tr('{name}, {v1}. Strecke, Statistik und Bewertung sind dann weg.', { name: askDelete.name, v1: datum(new Date(askDelete.started_at)) }) : undefined}
        confirmLabel={tr('Löschen')}
        onClose={() => setAskDelete(null)}
        onConfirm={() => {
          const d = askDelete;
          setAskDelete(null);
          if (!d) return;
          setList((l) => (l ? l.filter((x) => x.id !== d.id) : l));
          deleteDrive(d.id).catch((e: Error) => {
            showToast(tr('Löschen hat nicht geklappt: {message}', { message: e.message }), { tone: 'error' });
            listDrives().then(setList).catch(() => undefined);
          });
        }}
      />
    </View>
  );
}

/** Karte einer Fahrt mit Mini Streckenbild; Tippen öffnet den Rückblick mit Statistik (Koray 15.11.) */
function DriveCard({ line, label, onOpen, onDelete, children }: { line?: LatLon[]; label: string; onOpen?: () => void; onDelete?: () => void; children: React.ReactNode }) {
  const shape = useMemo(() => (line ? thumbShape(line) : null), [line]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={onOpen ? tr('Zeigt Strecke, Statistik und Bewertung der Fahrt') : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: tr('Löschen') }] : undefined}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete?.()}
      disabled={!onOpen}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, styles.driveRow, pressed && styles.pressed]}
    >
      <RouteThumb shape={shape} fade />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  upcoming: { gap: Spacing.s },
  upLabel: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  upCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  upName: { fontFamily: Fonts.bold, fontSize: Type.title },
  upMuted: { color: Colors.muted },
  upAttn: { color: Colors.signal, fontFamily: Fonts.semibold },
  privat: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: Colors.surface2 },
  privatText: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.text },
  driveRow: { flexDirection: 'row', alignItems: 'center' },
  swipeBox: { borderRadius: Radius.l, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  importBtn: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', gap: Spacing.s },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  list: { gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  rowMain: { gap: 2, minHeight: 44, justifyContent: 'center' },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title },
  search: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  danger: { backgroundColor: Colors.dangerTint },
  disabled: { opacity: 0.4 },
  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.pill, padding: 3 },
  segItem: { flex: 1, height: Size.chip, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface2 },
  segText: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  segTextOn: { fontFamily: Fonts.semibold, color: Colors.text },
  field: { minHeight: Size.input, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  area: { minHeight: 96, textAlignVertical: 'top' },
  tourCard: { backgroundColor: Colors.surface, borderRadius: Radius.l, paddingHorizontal: Spacing.m, paddingVertical: Spacing.m, gap: Spacing.s },
  head: { gap: 2, paddingHorizontal: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  pressed: { opacity: 0.7 },
  pillPrimary: { flex: 1, height: 44, paddingHorizontal: Spacing.m, borderRadius: 22, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  pillPrimaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
  pill: { height: 44, paddingHorizontal: Spacing.m, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: Colors.line },
  roundText: { fontFamily: Fonts.bold, fontSize: Type.button, lineHeight: 22 },
  choice: { flex: 1, height: 44, paddingHorizontal: Spacing.m, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  menu: { gap: Spacing.xs },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.s, paddingHorizontal: Spacing.l, borderRadius: Radius.m, backgroundColor: Colors.surface2 },
  itemText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  itemNote: { paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs },
  dangerSolid: { backgroundColor: Colors.signal },
  onSignal: { color: Colors.onSignal },
  confirm: { gap: Spacing.s, padding: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.dangerTint },
  total: { fontFamily: Fonts.semibold, fontSize: Type.body, fontVariant: ['tabular-nums'] },
  dangerText: { color: Colors.signal },
});
