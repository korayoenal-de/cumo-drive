/**
 * Karte einer gespeicherten Tour in Meine Touren.
 *
 * Bewusst reduziert: Die ganze Karte öffnet die Tour im Planer (dort Losfahren, als Gruppe fahren,
 * auf der Karte ändern und speichern). Rechts nur zwei Symbole: Teilen und Löschen.
 * Teilen klappt wie ein Aktionsmenü auf: das Symbol dreht sich und wird zum X, die Optionen
 * gleiten nacheinander herein (Export als GPX oder KML, in der Community veröffentlichen).
 * Löschen fragt ohne Dialog nach: Das Symbol wird zur roten Taste "Löschen", ein zweites Tippen
 * löscht, nach drei Sekunden ohne Tippen klappt es zurück.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { publishTour, unpublishTour } from '@/lib/community';
import { loadProfile } from '@/lib/group/ride';
import { deleteTour, type SavedTour } from '@/lib/library';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import { flatten, formatKm } from '@/lib/tour';

const SPRING = Motion.press;
const LAYOUT = LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness);

export function TourCard({ tour: t, onOpen }: { tour: SavedTour; onOpen: (t: SavedTour) => void }) {
  const [share, setShare] = useState(false);
  const [armed, setArmed] = useState(false);
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // Löschen ist nur kurz scharf
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  const date = new Date(t.updatedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const meta = [`${formatKm(t.laenge_km, 0)} km`, t.curves ? `${t.curves} Kurven` : null, date].filter(Boolean).join('  ·  ');

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

        <View style={styles.tools}>
          <MorphButton open={share} icon="square.and.arrow.up" label={share ? 'Teilen schließen' : 'Teilen'} onPress={() => { setArmed(false); setShare((s) => !s); }} />
          <DeleteButton armed={armed} onArm={() => { setShare(false); setArmed(true); }} onDelete={() => deleteTour(t.id)} />
        </View>
      </View>

      {share && <ShareMenu tour={t} />}
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

/** Rundes Symbol, das sich beim Öffnen dreht und zum X wird. */
function MorphButton({ open, icon, label, onPress }: { open: boolean; icon: SFSymbol; label: string; onPress: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withSpring(open ? 1 : 0, SPRING));
  }, [open, p]);
  const a = useAnimatedStyle(() => ({ opacity: 1 - p.get(), transform: [{ rotate: `${p.get() * 90}deg` }, { scale: 1 - p.get() * 0.4 }] }));
  const b = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ rotate: `${(p.get() - 1) * 90}deg` }, { scale: 0.6 + p.get() * 0.4 }] }));
  const bg = useAnimatedStyle(() => ({ backgroundColor: p.get() > 0.5 ? Colors.line : Colors.surface2 }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={onPress} hitSlop={4}>
      <Animated.View style={[styles.round, bg]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, a]}>
          <SymbolView name={icon} size={19} tintColor={Colors.text} weight="semibold" />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, b]}>
          <SymbolView name="xmark" size={16} tintColor={Colors.text} weight="bold" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** Papierkorb, der beim ersten Tippen zur roten Taste "Löschen" aufzieht. */
function DeleteButton({ armed, onArm, onDelete }: { armed: boolean; onArm: () => void; onDelete: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={armed ? 'Löschen bestätigen' : 'Tour löschen'}
      accessibilityHint={armed ? 'Löscht die Tour vom Gerät und aus deinem Konto' : 'Danach noch einmal tippen zum Bestätigen'}
      onPress={armed ? onDelete : onArm}
      hitSlop={4}>
      <Animated.View layout={LAYOUT} style={[styles.round, armed && styles.armed]}>
        {armed ? (
          <Animated.View key="txt" entering={FadeIn.duration(140)} style={styles.armedInner}>
            <SymbolView name="trash.fill" size={15} tintColor={Colors.onSignal} weight="semibold" />
            <AppText style={styles.armedText}>Löschen</AppText>
          </Animated.View>
        ) : (
          <Animated.View key="ico" entering={FadeIn.duration(140)}>
            <SymbolView name="trash" size={18} tintColor={Colors.muted} weight="medium" />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Optionen beim Teilen, gleiten nacheinander herein. */
function ShareMenu({ tour }: { tour: SavedTour }) {
  const [busy, setBusy] = useState<RouteFormat | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const exp = async (f: RouteFormat) => {
    if (busy) return;
    setBusy(f);
    setMsg(null);
    try {
      await exportTour(tour, f);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Export hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };
  const items: { key: string; icon: SFSymbol; label: string; hint: string; onPress: () => void; busy?: boolean }[] = [
    { key: 'gpx', icon: 'point.topleft.down.to.point.bottomright.curvepath', label: 'Als GPX teilen', hint: 'Für Garmin, TomTom und andere Navis', onPress: () => void exp('gpx'), busy: busy === 'gpx' },
    { key: 'kml', icon: 'map', label: 'Als KML teilen', hint: 'Für Google Earth und My Maps', onPress: () => void exp('kml'), busy: busy === 'kml' },
    {
      key: 'pub',
      icon: tour.published ? 'person.2.slash' : 'person.2',
      label: tour.published ? 'Aus der Community nehmen' : 'In der Community veröffentlichen',
      hint: tour.published ? 'Andere sehen die Tour dann nicht mehr' : 'Andere können die Tour finden und fahren',
      onPress: () => setPublish((x) => !x),
    },
  ];
  return (
    <Animated.View layout={LAYOUT} style={styles.menu} accessibilityRole="menu">
      {items.map((it, i) => (
        <Animated.View key={it.key} entering={FadeInDown.springify().damping(18).stiffness(240).delay(i * Motion.stagger)} exiting={FadeOut.duration(100)}>
          <Pressable accessibilityRole="menuitem" accessibilityHint={it.hint} onPress={it.onPress} style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
            <View style={styles.itemIcon}>
              <SymbolView name={it.icon} size={17} tintColor={Colors.text} weight="medium" />
            </View>
            <View style={styles.flex}>
              <AppText style={styles.itemText}>{it.label}</AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {it.hint}
              </AppText>
            </View>
            {it.busy && <ActivityIndicator color={Colors.muted} />}
          </Pressable>
        </Animated.View>
      ))}
      {publish && <PublishForm tour={tour} onDone={() => setPublish(false)} />}
      {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
    </Animated.View>
  );
}

/** Veröffentlichen mit Name und kurzer Beschreibung, oder zurückziehen. */
function PublishForm({ tour, onDone }: { tour: SavedTour; onDone: () => void }) {
  const session = useSession();
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void loadProfile().then((p) => {
      if (p?.name) setAuthor((a) => a || p.name);
    });
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      onDone();
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
      <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.form}>
        <AppText muted>Die Tour verschwindet aus der Community. Gespeichert bleibt sie bei dir.</AppText>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => unpublishTour(tour))} style={({ pressed }) => [styles.primary, pressed && styles.itemPressed]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Aus der Community nehmen</AppText>}
        </Pressable>
        {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
      </Animated.View>
    );
  const can = !busy && !!author.trim();
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.form}>
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
        Alle sehen Strecke, Tourname und deinen Namen. Zurückziehen geht jederzeit.
      </AppText>
      <Pressable accessibilityRole="button" disabled={!can} onPress={() => void run(() => publishTour(tour, author, desc))} style={({ pressed }) => [styles.primary, !can && styles.disabled, pressed && styles.itemPressed]}>
        {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Veröffentlichen</AppText>}
      </Pressable>
      {msg && <AppText variant="caption" style={styles.danger}>{msg}</AppText>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l + 4, padding: Spacing.m, gap: Spacing.m, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 56 },
  text: { flex: 1, gap: 3 },
  name: { fontFamily: Fonts.semibold, fontSize: 17, lineHeight: 21 },
  meta: { fontVariant: ['tabular-nums'] },
  badge: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.goodTint },
  badgeText: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.good },
  thumb: { width: 56, height: 56, borderRadius: Radius.m, backgroundColor: Colors.ground, overflow: 'hidden' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  round: { minWidth: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  armed: { backgroundColor: Colors.signal, paddingHorizontal: Spacing.m },
  armedInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  armedText: { fontFamily: Fonts.bold, fontSize: 14, color: Colors.onSignal },
  menu: { gap: Spacing.xs },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface2 },
  itemPressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  itemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontFamily: Fonts.semibold, fontSize: 15 },
  form: { gap: Spacing.s, padding: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface2 },
  field: { minHeight: 48, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: 16 },
  area: { minHeight: 88, textAlignVertical: 'top' },
  primary: { height: 48, borderRadius: 24, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 15 },
  disabled: { opacity: 0.4 },
  note: { paddingHorizontal: Spacing.xs },
  danger: { color: Colors.signal },
});
