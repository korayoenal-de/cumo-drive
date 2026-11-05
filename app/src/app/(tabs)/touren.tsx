/**
 * Meine Touren: gespeicherte Touren aus App und Web Planer (ohne Konto auf dem Gerät, angemeldet
 * zusätzlich im Konto) und gefahrene Touren mit Fahrtstatistik je Fahrzeug.
 * Eigene Touren lassen sich hier in der Community veröffentlichen.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ElevationChart } from '@/components/planner/elevation-chart';
import { ExportRow } from '@/components/planner/export-row';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { useSession } from '@/lib/auth';
import { deleteTour, filterTours, folders, saveTour, syncLibrary, useLibrary, useSyncState, type SavedTour, type SortKey } from '@/lib/library';
import { publishTour, unpublishTour } from '@/lib/community';
import { listDrives, type Drive } from '@/lib/drives';
import { loadProfile } from '@/lib/group/ride';
import { fmtG } from '@/lib/ride-stats';
import { importTourFile } from '@/lib/route-file';
import { countCurves } from '@/lib/stats';
import { flatten, formatKm } from '@/lib/tour';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'name', label: 'Name' },
  { id: 'laenge', label: 'Länge' },
];

export default function Touren() {
  const list = useLibrary();
  const session = useSession();
  const sync = useSyncState();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('neu');
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
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
      setOpen(saved.id);
      setImportMsg(`${saved.name} importiert, ${formatKm(saved.laenge_km, 0)} km.`);
      if (session) void syncLibrary();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Import hat nicht geklappt.');
    }
  };

  // Beim Öffnen des Tabs mit dem Konto abgleichen
  useFocusEffect(
    useCallback(() => {
      if (session) void syncLibrary();
    }, [session]),
  );

  const dirs = useMemo(() => folders(list), [list]);
  const shown = useMemo(() => filterTours(list, q, folder, sort), [list, q, folder, sort]);

  const drive = (t: SavedTour) => {
    setActiveTour(t, t.profile ?? 'kurvig');
    router.push('/navigation');
  };
  const show = (t: SavedTour) => {
    setActiveTour(t, t.profile ?? 'kurvig');
    router.push('/karte');
  };

  return (
    <Screen>
      <AppText variant="display">{'Meine\nTouren'}</AppText>

      <View style={styles.segment} accessibilityRole="tablist">
        {(
          [
            ['gespeichert', 'Gespeichert'],
            ['gefahren', 'Gefahren'],
          ] as const
        ).map(([id, label]) => (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)} style={[styles.segItem, tab === id && styles.segOn]}>
            <AppText style={[styles.segText, tab === id && styles.segTextOn]}>{label}</AppText>
          </Pressable>
        ))}
      </View>

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

      <View style={styles.gapS}>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => void importFile()} style={[styles.secondary, styles.flex]}>
            <AppText style={styles.secondaryText}>GPX oder KML importieren</AppText>
          </Pressable>
        </View>
        {importMsg && <AppText variant="caption" muted>{importMsg}</AppText>}
      </View>

      {list.length === 0 ? (
        <View style={styles.card}>
          <AppText variant="title">Noch keine Tour gespeichert</AppText>
          <AppText muted>Plan eine Route oder eine Schnelle Runde und tippe auf Speichern. Dann landet sie hier.</AppText>
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
            {shown.map((t) => {
              const isOpen = open === t.id;
              return (
                <View key={t.id} style={styles.card}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : t.id)} style={styles.rowMain}>
                    <AppText style={styles.name} numberOfLines={2}>
                      {t.name}
                    </AppText>
                    <AppText variant="caption" muted>
                      {[
                        `${formatKm(t.laenge_km, 0)} km`,
                        t.curves ? `${t.curves} Kurven` : null,
                        t.folder || null,
                        new Date(t.updatedAt).toLocaleDateString('de-DE'),
                        t.cloudId ? 'im Konto' : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </AppText>
                  </Pressable>
                  {isOpen && (
                    <View style={styles.gapS}>
                      <Pressable accessibilityRole="button" onPress={() => drive(t)} style={styles.primary}>
                        <AppText style={styles.primaryText}>Losfahren</AppText>
                      </Pressable>
                      <TourDetails tour={t} />
                      <View style={styles.row}>
                        <Pressable accessibilityRole="button" onPress={() => show(t)} style={[styles.secondary, styles.flex]}>
                          <AppText style={styles.secondaryText}>Auf der Karte</AppText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            if (confirm === t.id) {
                              deleteTour(t.id);
                              setConfirm(null);
                              setOpen(null);
                            } else setConfirm(t.id);
                          }}
                          style={[styles.secondary, styles.flex, confirm === t.id && styles.danger]}>
                          <AppText style={[styles.secondaryText, confirm === t.id && styles.dangerText]}>{confirm === t.id ? 'Wirklich löschen' : 'Löschen'}</AppText>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
        </>
      )}
    </Screen>
  );
}

/** Höhenprofil und Export einer gespeicherten Tour, erst beim Aufklappen geladen. */
function TourDetails({ tour }: { tour: SavedTour }) {
  const line = useMemo(() => flatten(tour).map((x) => x.p), [tour]);
  return (
    <View style={styles.gapM}>
      <ElevationChart line={line} onSurface />
      <ExportRow tour={tour} onSurface />
      <PublishBlock tour={tour} />
    </View>
  );
}

/** Tour in der Community veröffentlichen oder zurückziehen. */
function PublishBlock({ tour }: { tour: SavedTour }) {
  const session = useSession();
  const [form, setForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!form) return;
    void loadProfile().then((p) => {
      if (p?.name) setAuthor((a) => a || p.name);
    });
  }, [form]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      setForm(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!session)
    return (
      <AppText variant="caption" muted>
        Zum Veröffentlichen in der Community meldest du dich unter Einstellungen an.
      </AppText>
    );
  if (tour.published)
    return (
      <View style={styles.gapS}>
        <AppText variant="caption" style={styles.goodText}>
          In der Community veröffentlicht
        </AppText>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => unpublishTour(tour), 'Aus der Community zurückgezogen.')} style={styles.secondary}>
          <AppText style={styles.secondaryText}>Zurückziehen</AppText>
        </Pressable>
        {msg && <AppText variant="caption" muted>{msg}</AppText>}
      </View>
    );
  if (!form)
    return (
      <View style={styles.gapS}>
        <Pressable accessibilityRole="button" onPress={() => setForm(true)} style={styles.secondary}>
          <AppText style={styles.secondaryText}>In der Community veröffentlichen</AppText>
        </Pressable>
        {msg && <AppText variant="caption" muted>{msg}</AppText>}
      </View>
    );
  const can = !busy && !!author.trim();
  return (
    <View style={styles.gapS}>
      <AppText variant="label">Veröffentlichen</AppText>
      <TextInput value={author} onChangeText={setAuthor} placeholder="Dein Name in der Community" placeholderTextColor={Colors.muted} style={styles.field} accessibilityLabel="Name in der Community" maxLength={60} />
      <TextInput
        value={desc}
        onChangeText={setDesc}
        placeholder="Was macht die Tour aus? Beste Abschnitte, Stopps, Tageszeit"
        placeholderTextColor={Colors.muted}
        style={[styles.field, styles.area]}
        multiline
        maxLength={500}
        accessibilityLabel="Beschreibung"
      />
      <AppText variant="caption" muted>
        Alle sehen die Strecke, den Namen der Tour und deinen Namen. Du kannst sie jederzeit zurückziehen.
      </AppText>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={!can}
          onPress={() => void run(() => publishTour(tour, author, desc), 'Veröffentlicht, die Tour steht jetzt in der Community.')}
          style={[styles.primary, styles.flex, !can && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Veröffentlichen</AppText>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setForm(false)} style={[styles.secondary, styles.flex]}>
          <AppText style={styles.secondaryText}>Abbrechen</AppText>
        </Pressable>
      </View>
      {msg && <AppText variant="caption" muted>{msg}</AppText>}
    </View>
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
  flex: { flex: 1 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  list: { gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  rowMain: { gap: 2, minHeight: 44, justifyContent: 'center' },
  name: { fontFamily: Fonts.semibold, fontSize: 17 },
  search: { height: 48, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: 16 },
  primary: { height: 50, borderRadius: 25, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 24, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 15 },
  danger: { backgroundColor: Colors.signalTint },
  disabled: { opacity: 0.4 },
  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 999, padding: 3 },
  segItem: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface2 },
  segText: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.muted },
  segTextOn: { fontFamily: Fonts.semibold, color: Colors.text },
  field: { minHeight: 48, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: 16 },
  area: { minHeight: 96, textAlignVertical: 'top' },
  goodText: { color: Colors.good, fontFamily: Fonts.semibold },
  total: { fontFamily: Fonts.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  dangerText: { color: Colors.signal },
});
