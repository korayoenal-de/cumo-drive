/**
 * Community: Touren, die andere Fahrer veröffentlicht haben. Ansehen, auf der Karte zeigen,
 * losfahren oder als Kopie in Meine Touren übernehmen. Veröffentlichen geht unter Meine Touren.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ElevationChart } from '@/components/planner/elevation-chart';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { useSession } from '@/lib/auth';
import { copyCommunityTour, listCommunity, loadCommunityTour, type CommunityTour } from '@/lib/community';
import { formatMinutes } from '@/lib/intent';
import { flatten, formatKm, PROFILES, type LatLon, type Profile, type Tour } from '@/lib/tour';

type Sort = 'neu' | 'kurven' | 'kurz' | 'lang';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'neu', label: 'Neueste' },
  { id: 'kurven', label: 'Kurvigste' },
  { id: 'kurz', label: 'Kurz' },
  { id: 'lang', label: 'Lang' },
];

export default function Community() {
  const session = useSession();
  const [list, setList] = useState<CommunityTour[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('neu');
  const [open, setOpen] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      listCommunity()
        .then((l) => {
          setList(l);
          setErr(null);
        })
        .catch((e: Error) => setErr(e.message));
    }, []),
  );

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = (list ?? []).filter((t) => !n || t.name.toLowerCase().includes(n) || (t.author ?? '').toLowerCase().includes(n) || (t.description ?? '').toLowerCase().includes(n));
    const density = (t: CommunityTour) => (t.curves ?? 0) / Math.max(1, Number(t.km));
    if (sort === 'kurven') l.sort((a, b) => density(b) - density(a));
    if (sort === 'kurz') l.sort((a, b) => Number(a.km) - Number(b.km));
    if (sort === 'lang') l.sort((a, b) => Number(b.km) - Number(a.km));
    return l;
  }, [list, q, sort]);

  return (
    <Screen>
      <AppText variant="display">Community</AppText>
      <AppText muted>Touren von anderen Fahrern. Deine eigenen Touren veröffentlichst du unter Meine Touren.</AppText>

      <View style={styles.gapM}>
        <TextInput value={q} onChangeText={setQ} placeholder="Touren, Regionen oder Fahrer suchen" placeholderTextColor={Colors.muted} style={styles.search} accessibilityLabel="Community Touren durchsuchen" returnKeyType="search" />
        <View style={styles.wrap}>
          {SORTS.map((s) => (
            <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
          ))}
        </View>
      </View>

      {err && <AppText style={styles.error}>Community konnte nicht geladen werden: {err}</AppText>}
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {list?.length === 0 && (
        <View style={styles.card}>
          <AppText variant="title">Noch keine Touren veröffentlicht</AppText>
          <AppText muted>Sei der Erste: Öffne eine Tour unter Meine Touren und tippe auf Veröffentlichen.</AppText>
        </View>
      )}
      {list && list.length > 0 && shown.length === 0 && <AppText muted>Keine Tour passt zur Suche.</AppText>}

      <View style={styles.list}>
        {shown.map((t) => (
          <CommunityCard key={t.id} t={t} mine={!!session && session.user.id === t.owner} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
        ))}
      </View>
    </Screen>
  );
}

function CommunityCard({ t, mine, open, onToggle }: { t: CommunityTour; mine: boolean; open: boolean; onToggle: () => void }) {
  const km = Number(t.km);
  const meta = [
    `${formatKm(km, 0)} km`,
    t.minutes ? formatMinutes(t.minutes) : null,
    t.curves ? `${t.curves} Kurven` : null,
    PROFILES.find((p) => p.id === t.profile)?.label,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.rowMain}>
        <AppText style={styles.name} numberOfLines={2}>
          {t.name}
        </AppText>
        <AppText variant="caption" muted>
          {meta}
        </AppText>
        <AppText variant="caption" muted>
          {mine ? 'Von dir' : `Von ${t.author || 'einem Fahrer'}`}, {new Date(t.published_at).toLocaleDateString('de-DE')}
        </AppText>
      </Pressable>
      {open && <CommunityDetails t={t} />}
    </View>
  );
}

function CommunityDetails({ t }: { t: CommunityTour }) {
  const [full, setFull] = useState<{ tour: Tour; profile: Profile } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    loadCommunityTour(t.id)
      .then((x) => alive && setFull({ tour: { ...x.tour, name: t.name }, profile: x.profile }))
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [t.id, t.name]);
  const line = useMemo<LatLon[]>(() => (full ? flatten(full.tour).map((x) => x.p) : []), [full]);

  const drive = () => {
    if (!full) return;
    setActiveTour(full.tour, full.profile);
    router.push('/navigation');
  };
  const show = () => {
    if (!full) return;
    setActiveTour(full.tour, full.profile);
    router.push('/karte');
  };
  const keep = async () => {
    setBusy(true);
    try {
      await copyCommunityTour(t);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.gapM}>
      {t.description ? <AppText>{t.description}</AppText> : null}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {!full && !err && <ActivityIndicator color={Colors.muted} />}
      {full && <ElevationChart line={line} onSurface />}
      <Pressable accessibilityRole="button" disabled={!full} onPress={drive} style={[styles.primary, !full && styles.disabled]}>
        <AppText style={styles.primaryText}>Losfahren</AppText>
      </Pressable>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={!full} onPress={show} style={[styles.secondary, styles.flex, !full && styles.disabled]}>
          <AppText style={styles.secondaryText}>Auf der Karte</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saved || busy} onPress={() => void keep()} style={[styles.secondary, styles.flex]}>
          {busy ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.secondaryText}>{saved ? 'In Meine Touren' : 'Speichern'}</AppText>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  list: { gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  rowMain: { gap: 2, minHeight: 44, justifyContent: 'center' },
  name: { fontFamily: Fonts.semibold, fontSize: 17 },
  search: { height: 48, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: 16 },
  primary: { height: 50, borderRadius: 25, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 24, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 15 },
  disabled: { opacity: 0.4 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
});
