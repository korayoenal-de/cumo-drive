/**
 * Meine Touren: alle gespeicherten Touren aus App und Web Planer. Ohne Konto auf dem Gerät,
 * angemeldet zusätzlich im Konto und damit auch im Web Planer.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
import { importTourFile } from '@/lib/route-file';
import { countCurves } from '@/lib/stats';
import { flatten, formatKm, type Tour } from '@/lib/tour';

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

      <View style={styles.syncRow}>
        {sync.running && <ActivityIndicator color={Colors.muted} />}
        <AppText variant="caption" muted style={styles.flex}>
          {!session
            ? 'Auf diesem Gerät gespeichert. Melde dich in der Garage an, dann findest du deine Touren auch im Web Planer.'
            : sync.running
              ? 'Wird mit deinem Konto abgeglichen'
              : sync.error
                ? `Abgleich hat nicht geklappt: ${sync.error}`
                : 'Mit deinem Konto abgeglichen, auch im Web Planer.'}
        </AppText>
      </View>

      <View style={styles.gapS}>
        <Pressable accessibilityRole="button" onPress={() => void importFile()} style={styles.secondary}>
          <AppText style={styles.secondaryText}>GPX oder KML importieren</AppText>
        </Pressable>
        {importMsg && <AppText variant="caption" muted>{importMsg}</AppText>}
      </View>

      {list.length === 0 ? (
        <View style={styles.card}>
          <AppText variant="title">Noch keine Tour gespeichert</AppText>
          <AppText muted>Plan eine Route oder eine Schnelle Runde und tippe auf Speichern. Dann landet sie hier.</AppText>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/planen')} style={styles.primary}>
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
    </Screen>
  );
}

/** Höhenprofil und Export einer gespeicherten Tour, erst beim Aufklappen geladen. */
function TourDetails({ tour }: { tour: Tour }) {
  const line = useMemo(() => flatten(tour).map((x) => x.p), [tour]);
  return (
    <View style={styles.gapM}>
      <ElevationChart line={line} onSurface />
      <ExportRow tour={tour} onSurface />
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
  dangerText: { color: Colors.signal },
});
