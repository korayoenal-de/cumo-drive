/**
 * Meine Touren: gespeicherte Touren aus App und Web Planer (ohne Konto auf dem Gerät, angemeldet
 * zusätzlich im Konto) und gefahrene Touren mit Fahrtstatistik je Fahrzeug.
 * Jede gespeicherte Tour ist eine Karte mit Mini Streckenbild: Tippen öffnet sie im Planer (dort
 * losfahren, als Gruppe fahren, ändern und speichern), daneben nur Teilen und Löschen.
 */
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { TypoTabs } from '@/components/planner/planner-parts';
import { TourCard } from '@/components/tours/tour-card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { setEditTour } from '@/lib/edit-tour';
import { backfillAuthors } from '@/lib/community';
import { filterTours, folders, readLibrary, saveTour, syncLibrary, useLibrary, useSyncState, type SavedTour, type SortKey } from '@/lib/library';
import { listDrives, type Drive } from '@/lib/drives';
import { fmtG } from '@/lib/ride-stats';
import { importTourFile } from '@/lib/route-file';
import { countCurves } from '@/lib/stats';
import { flatten, formatKm } from '@/lib/tour';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'spass', label: 'Fahrspaß' },
  { id: 'name', label: 'Name' },
  { id: 'laenge', label: 'Länge' },
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
      setImportMsg(e instanceof Error ? e.message : 'Import hat nicht geklappt.');
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
        <AppText variant="display" style={styles.flex} numberOfLines={1} adjustsFontSizeToFit>Touren</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="GPX oder KML importieren"
          onPress={() => void importFile()}
          hitSlop={6}
          style={({ pressed }) => [styles.importBtn, pressed && { opacity: 0.75 }]}>
          <SymbolView name="square.and.arrow.down" size={20} weight="semibold" tintColor={Colors.text} />
        </Pressable>
      </View>
      {importMsg && <AppText variant="caption" muted>{importMsg}</AppText>}

      {/* Wie im Planer: Reiter als große Schrift, aktiv hell, inaktiv grau (Koray 8.11.) */}
      <TypoTabs
        value={tab}
        options={[
          { id: 'gespeichert', label: 'Gespeichert' },
          { id: 'gefahren', label: 'Gefahren' },
        ]}
        onChange={setTab}
      />

      {tab === 'gefahren' ? (
        <Drives loggedIn={!!session} />
      ) : (
        <>

      {(sync.running || sync.error) && (
        <View style={styles.syncRow}>
          {sync.running && <ActivityIndicator color={Colors.muted} />}
          <AppText variant="caption" muted style={styles.flex}>
            {sync.running ? 'Wird mit deinem Konto abgeglichen' : `Abgleich hat nicht geklappt: ${sync.error}`}
          </AppText>
        </View>
      )}


      {list.length === 0 ? (
        <View style={styles.card}>
          <AppText variant="title">Noch keine Tour gespeichert</AppText>
          <AppText muted>Plan eine Tour oder eine Rundtour und tippe auf Speichern. Dann landet sie hier.</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/')} style={styles.primary}>
            <AppText style={styles.primaryText}>Tour planen</AppText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.gapM}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Touren durchsuchen"
              placeholderTextColor={Colors.muted}
              style={styles.search}
              accessibilityLabel="Touren durchsuchen"
              returnKeyType="search"
            />
            {dirs.length > 0 && (
              <View style={styles.wrap}>
                <Chip label="Alle" active={folder === null} onPress={() => setFolder(null)} />
                {dirs.map((d) => (
                  <Chip key={d} label={d} active={folder === d} onPress={() => setFolder(folder === d ? null : d)} />
                ))}
              </View>
            )}
            <View style={styles.wrap}>
              {SORTS.map((s) => (
                <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
              ))}
            </View>
          </View>

          <View style={styles.list}>
            {shown.length === 0 && <AppText muted>Keine Tour passt zur Suche.</AppText>}
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

/** Gefahrene Touren aus dem Konto, filterbar nach Fahrzeug. */
function Drives({ loggedIn }: { loggedIn: boolean }) {
  const [list, setList] = useState<Drive[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [car, setCar] = useState<string | null>(null);
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
        <AppText variant="title">Fahrten mit Konto</AppText>
        <AppText muted>Melde dich unter Einstellungen an. Dann landet nach jeder Navigation die Fahrtstatistik hier, sortiert nach Fahrzeug.</AppText>
      </View>
    );
  const cars = [...new Map((list ?? []).filter((d) => d.vehicle_id).map((d) => [d.vehicle_id as string, d.vehicle_name || 'Fahrzeug'])).entries()];
  const shown = (list ?? []).filter((d) => !car || d.vehicle_id === car);
  const totalKm = shown.reduce((s, d) => s + Number(d.km), 0);
  return (
    <View style={styles.gapM}>
      {cars.length > 0 && (
        <View style={styles.wrap}>
          <Chip label="Alle Fahrzeuge" active={car === null} onPress={() => setCar(null)} />
          {cars.map(([id, name]) => (
            <Chip key={id} label={name} active={car === id} onPress={() => setCar(car === id ? null : id)} />
          ))}
        </View>
      )}
      {err && <AppText style={styles.dangerText}>{err}</AppText>}
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {list?.length === 0 && (
        <View style={styles.card}>
          <AppText muted>Noch keine Fahrt gespeichert. Nach jeder Navigation landet die Fahrtstatistik hier.</AppText>
        </View>
      )}
      {shown.length > 0 && (
        <AppText style={styles.total}>
          {formatKm(totalKm, 0)} km in {shown.length} {shown.length === 1 ? 'Tour' : 'Touren'}
        </AppText>
      )}
      <View style={styles.list}>
        {shown.map((d) => {
          const h = Math.floor(d.moving_min / 60);
          const m = d.moving_min % 60;
          return (
            <View key={d.id} style={styles.card}>
              <View style={styles.rowMain}>
                <View style={styles.row}>
                  <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                    {d.name}
                  </AppText>
                  <AppText variant="caption" muted>
                    {new Date(d.started_at).toLocaleDateString('de-DE')}
                  </AppText>
                </View>
                <AppText variant="caption" muted>
                  {[
                    `${formatKm(Number(d.km), 0)} km`,
                    h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`,
                    d.curves ? `${d.curves} Kurven` : null,
                    d.max_lat_g ? `quer ${fmtG(Number(d.max_lat_g))}` : null,
                    d.vehicle_name,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  importBtn: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
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
  danger: { backgroundColor: Colors.signalTint },
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
  confirm: { gap: Spacing.s, padding: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.signalTint },
  total: { fontFamily: Fonts.semibold, fontSize: Type.body, fontVariant: ['tabular-nums'] },
  dangerText: { color: Colors.signal },
});
