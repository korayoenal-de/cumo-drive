/**
 * Karte einer gespeicherten Tour in Meine Touren.
 *
 * Bewusst reduziert: Die ganze Karte öffnet die Tour im Planer (dort Losfahren, als Gruppe fahren,
 * auf der Karte ändern und speichern). Rechts nur ein Symbol für die Optionen. Es öffnet ein
 * Bottom Sheet (Teilen als GPX oder KML, Community, Löschen). Veröffentlichen öffnet das Formular
 * im selben Sheet, Löschen fragt in einem ConfirmSheet nach, Erfolg meldet ein Toast.
 * Muster: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { SOFT_LAYOUT } from '@/components/ui/action-bar';
import { ActionSheet, ConfirmSheet, OptionsSheet, type SheetItem } from '@/components/ui/action-sheet';
import { FunGauge } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type, Size } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { publishTour, unpublishTour } from '@/lib/community';
import { loadProfile } from '@/lib/group/ride';
import { TOUR_FUN_NAMES, tourFunLevel } from '@/lib/fun-score';
import { NameDialog } from '@/components/planner/name-dialog';
import { deleteTour, renameTour, type SavedTour } from '@/lib/library';
import { useMyProfile } from '@/lib/profile';
import { ensureTourFun } from '@/lib/tour-fun-queue';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import { shareTourLink } from '@/lib/share-link';
import { showToast } from '@/lib/toast';
import { flatten, formatKm } from '@/lib/tour';

const SPRING = Motion.press;
const LAYOUT = SOFT_LAYOUT;

export function TourCard({ tour: t, onOpen }: { tour: SavedTour; onOpen: (t: SavedTour) => void }) {
  const [sheet, setSheet] = useState<'menu' | 'publish' | 'delete' | 'rename' | null>(null);
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  useEffect(() => ensureTourFun(t), [t]);
  const date = new Date(t.updatedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const meta = [`${formatKm(t.laenge_km, 0)} km`, t.curves ? `${t.curves} Kurven` : null, date].filter(Boolean).join('  ·  ');

  const exp = async (f: RouteFormat) => {
    try {
      await exportTour(t, f);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export hat nicht geklappt.', { tone: 'error' });
    }
  };
  const items: SheetItem[] = [
    { key: 'rename', icon: 'pencil', label: 'Umbenennen', onPress: () => setSheet('rename') },
    { key: 'link', icon: 'square.and.arrow.up', label: 'Link teilen', hint: 'Andere öffnen die Route direkt in CUMO DRIVE', onPress: () => void shareTourLink(t, t.profile ?? 'kurvig').catch(() => undefined) },
    { key: 'gpx', icon: 'point.topleft.down.to.point.bottomright.curvepath', label: 'Als GPX teilen', hint: 'Für Garmin, TomTom und andere Navis', onPress: () => void exp('gpx') },
    { key: 'kml', icon: 'map', label: 'Als KML teilen', hint: 'Für Google Earth und My Maps', onPress: () => void exp('kml') },
    {
      key: 'pub',
      icon: t.published ? 'person.2.slash' : 'person.2',
      label: t.published ? 'Aus der Community nehmen' : 'In der Community veröffentlichen',
      hint: t.published ? 'Andere sehen die Tour dann nicht mehr' : 'Andere können die Tour finden und fahren',
      onPress: () => setSheet('publish'),
    },
    { key: 'del', icon: 'trash', label: 'Tour löschen', hint: 'Vom Gerät und aus deinem Konto', danger: true, onPress: () => setSheet('delete') },
  ];

  return (
    <Animated.View layout={LAYOUT} entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={[styles.card, cardStyle]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${meta}`}
          accessibilityHint="Öffnet die Tour auf der Karte, dort startest du die Fahrt"
          onPress={() => onOpen(t)}
          onPressIn={() => scale.set(withSpring(Motion.pressScale, SPRING))}
          onPressOut={() => scale.set(withSpring(1, SPRING))}
          style={styles.main}>
          <RouteThumb tour={t} />
          <View style={styles.text}>
            <AppText style={styles.name} numberOfLines={2}>
              {t.name}
            </AppText>
            <AppText variant="caption" muted numberOfLines={1} style={styles.meta}>
              {meta}
            </AppText>
            {t.published && (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>In der Community</AppText>
              </View>
            )}
          </View>
        </Pressable>
        {t.fun != null && t.fun >= 0 && (
          <View style={styles.fun} accessible accessibilityLabel={`Fahrspaß ${t.fun} von 100, ${TOUR_FUN_NAMES[tourFunLevel(t.fun)]}`}>
            <FunGauge level={tourFunLevel(t.fun)} size={20} />
            <AppText style={styles.funText}>{t.fun}</AppText>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`Optionen für ${t.name}`} onPress={() => setSheet('menu')} hitSlop={4} style={({ pressed }) => [styles.round, pressed && styles.itemPressed]}>
          <SymbolView name="ellipsis" size={18} tintColor={Colors.text} weight="medium" />
        </Pressable>
      </View>

      <ActionSheet visible={sheet === 'menu'} title={t.name} subtitle={meta} items={items} onClose={() => setSheet((s) => (s === 'menu' ? null : s))} />
      <OptionsSheet
        visible={sheet === 'publish'}
        title={t.published ? 'Aus der Community nehmen?' : 'In der Community veröffentlichen'}
        subtitle={t.published ? 'Die Tour verschwindet aus der Community. Gespeichert bleibt sie bei dir.' : 'Alle sehen Strecke, Tourname und deinen Namen. Zurückziehen geht jederzeit.'}
        onClose={() => setSheet(null)}>
        <PublishForm
          tour={t}
          onDone={(text) => {
            setSheet(null);
            showToast(text);
          }}
        />
      </OptionsSheet>
      <NameDialog
        key={sheet === 'rename' ? 'offen' : 'zu'}
        visible={sheet === 'rename'}
        title="Tour umbenennen"
        subtitle="Der neue Name gilt auch im Konto, im Web Planer und in der Community."
        initial={t.name}
        onCancel={() => setSheet(null)}
        onSave={(n) => {
          setSheet(null);
          if (n !== t.name) {
            renameTour(t.id, n);
            showToast('Umbenannt');
          }
        }}
      />
      <ConfirmSheet
        visible={sheet === 'delete'}
        title="Möchtest du diese Tour wirklich löschen?"
        text={`${t.name} verschwindet vom Gerät und aus deinem Konto.`}
        confirmLabel="Löschen"
        onConfirm={() => {
          deleteTour(t.id);
          showToast('Tour gelöscht');
        }}
        onClose={() => setSheet(null)}
      />
    </Animated.View>
  );
}

/** Mini Karte der Strecke: Linie in Signalfarbe, Start als Punkt. */
function RouteThumb({ tour }: { tour: SavedTour }) {
  const S = 56;
  const pad = 8;
  const pts = useMemo(() => {
    const line = flatten(tour).map((x) => x.p);
    if (line.length < 2) return null;
    const step = Math.max(1, Math.floor(line.length / 120));
    const sample = line.filter((_, i) => i % step === 0 || i === line.length - 1);
    let s = 90, n = -90, w = 180, e = -180;
    for (const [la, lo] of sample) {
      s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
    }
    const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const spanX = (e - w) * k || 1e-6;
    const spanY = n - s || 1e-6;
    const f = (S - pad * 2) / Math.max(spanX, spanY);
    const ox = (S - spanX * f) / 2;
    const oy = (S - spanY * f) / 2;
    return sample.map(([la, lo]) => [ox + (lo - w) * k * f, oy + (n - la) * f] as const);
  }, [tour]);
  return (
    <View style={styles.thumb} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {pts && (
        <Svg width={S} height={S}>
          <Polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill="none" stroke={Colors.signal} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={pts[0][0]} cy={pts[0][1]} r={3} fill={Colors.text} />
        </Svg>
      )}
    </View>
  );
}

/** Veröffentlichen mit Name und kurzer Beschreibung, oder zurückziehen. */
function PublishForm({ tour, onDone }: { tour: SavedTour; onDone: (toast: string) => void }) {
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const [title, setTitle] = useState(tour.name);
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Fahrername vorbelegen: zuerst der Name aus dem Konto, sonst der aus der Gruppenfahrt (Koray 10.11.)
  const [touched, setTouched] = useState(false);
  const shownAuthor = touched ? author : author || profile?.displayName || '';
  useEffect(() => {
    void loadProfile().then((p) => {
      if (p?.name) setAuthor((a) => a || p.name);
    });
  }, []);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      onDone(done);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!session)
    return (
      <AppText variant="caption" muted style={styles.note}>
        Zum Veröffentlichen meldest du dich unter Einstellungen an.
      </AppText>
    );
  if (tour.published)
    return (
      <View style={styles.form}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => unpublishTour(tour), 'Aus der Community genommen')} style={({ pressed }) => [styles.primary, pressed && styles.itemPressed]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Aus der Community nehmen</AppText>}
        </Pressable>
        {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
      </View>
    );
  const can = !busy && !!shownAuthor.trim() && !!title.trim();
  return (
    <View style={styles.form}>
      <View style={styles.labeled}>
        <AppText style={styles.fieldLabel}>Name der Tour</AppText>
        <TextInput value={title} onChangeText={setTitle} placeholder="Name der Tour" placeholderTextColor={Colors.muted} style={styles.field} accessibilityLabel="Name der Tour" maxLength={120} />
      </View>
      <View style={styles.labeled}>
        <AppText style={styles.fieldLabel}>Dein Name als Fahrer</AppText>
        <TextInput
          value={shownAuthor}
          onChangeText={(v) => {
            setTouched(true);
            setAuthor(v);
          }}
          placeholder="So erscheinst du in der Community"
          placeholderTextColor={Colors.muted}
          style={styles.field}
          accessibilityLabel="Dein Name als Fahrer"
          maxLength={60}
        />
      </View>
      <AppText style={styles.fieldLabel}>Beschreibung (optional)</AppText>
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
      <Pressable accessibilityRole="button" disabled={!can} onPress={() =>
          void run(async () => {
            // neuer Name gilt auch in Meine Touren und im Konto
            const name = title.replace(/\s+/g, ' ').trim();
            if (name && name !== tour.name) renameTour(tour.id, name);
            await publishTour({ ...tour, name: name || tour.name }, shownAuthor, desc);
          }, 'In der Community veröffentlicht')
        } style={({ pressed }) => [styles.primary, !can && styles.disabled, pressed && styles.itemPressed]}>
        {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Veröffentlichen</AppText>}
      </Pressable>
      {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  labeled: { gap: Spacing.xs },
  fieldLabel: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted, marginLeft: Spacing.xs },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l + 4, padding: Spacing.m, gap: Spacing.m, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 56 },
  text: { flex: 1, gap: 3 },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title, lineHeight: 21 },
  meta: { fontVariant: ['tabular-nums'] },
  badge: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: Spacing.s, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Colors.goodTint },
  badgeText: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.good },
  thumb: { width: 56, height: 56, borderRadius: Radius.m, backgroundColor: Colors.ground, overflow: 'hidden' },
  fun: { alignItems: 'center', gap: 2, minWidth: 36 },
  funText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  round: { minWidth: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface2 },
  itemPressed: { opacity: 0.7, transform: [{ scale: Motion.pressScale }] },
  form: { gap: Spacing.s },
  field: { minHeight: Size.input, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  area: { minHeight: 88, textAlignVertical: 'top' },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
  disabled: { opacity: 0.4 },
  note: { paddingHorizontal: Spacing.xs },
  danger: { color: Colors.signal },
});
