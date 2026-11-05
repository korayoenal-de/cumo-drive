/**
 * Community: Touren, die andere Fahrer veröffentlicht haben. Tippen öffnet die Tour im Planer
 * (losfahren, speichern), das Lesezeichen übernimmt sie direkt in Meine Touren.
 */
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { copyCommunityTour, listCommunity, loadCommunityTour, type CommunityTour } from '@/lib/community';
import { formatMinutes } from '@/lib/intent';
import { setEditTour } from '@/lib/edit-tour';
import { formatKm } from '@/lib/tour';

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
          <CommunityCard key={t.id} t={t} mine={!!session && session.user.id === t.owner} />
        ))}
      </View>
    </Screen>
  );
}

/**
 * Karte einer Community Tour nach dem Muster von Meine Touren: Tippen öffnet die Tour im Planer
 * (dort Losfahren und Speichern), daneben nur das Lesezeichen zum direkten Übernehmen.
 */
function CommunityCard({ t, mine }: { t: CommunityTour; mine: boolean }) {
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
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

  return (
    <Animated.View style={[styles.card, cardStyle]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${meta}`}
          accessibilityHint="Öffnet die Tour auf der Karte, dort startest du die Fahrt"
          onPress={() => void open()}
          onPressIn={() => scale.set(withSpring(Motion.pressScale, Motion.press))}
          onPressOut={() => scale.set(withSpring(1, Motion.press))}
          style={styles.main}>
          <AppText style={styles.name} numberOfLines={2}>
            {t.name}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1} style={styles.num}>
            {meta}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {mine ? 'Von dir' : `Von ${t.author || 'einem Fahrer'}`}
          </AppText>
          {t.description ? (
            <AppText variant="caption" style={styles.desc} numberOfLines={2}>
              {t.description}
            </AppText>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? 'In Meine Touren gespeichert' : 'In Meine Touren speichern'}
          accessibilityState={{ disabled: saved, busy: busy === 'save' }}
          onPress={() => void keep()}
          hitSlop={4}
          style={[styles.round, saved && styles.roundSaved]}>
          {busy ? (
            <ActivityIndicator color={Colors.muted} />
          ) : (
            <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} size={19} tintColor={saved ? Colors.signal : Colors.text} weight="semibold" />
          )}
        </Pressable>
      </View>
      {err && <AppText variant="caption" style={styles.error}>{err}</AppText>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  list: { gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l + 4, padding: Spacing.m, paddingLeft: Spacing.l, gap: Spacing.s },
  main: { flex: 1, gap: 3, minHeight: 56, justifyContent: 'center' },
  num: { fontVariant: ['tabular-nums'] },
  desc: { color: Colors.text, opacity: 0.8, marginTop: 2 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  roundSaved: { backgroundColor: Colors.signalTint },
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
