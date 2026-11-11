/**
 * Ausfahrt anlegen (Konzept Koray 9.11.): Tour aus Meine Touren, Abfahrt, Treffpunkt, Plätze und
 * ein Hinweis. Ankunft und Ziel kommen aus der Tour. Veröffentlichen nur mit Mitgliedschaft.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoutePreview } from '@/components/planner/route-preview';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { clock, publishAusfahrt, shortDate } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { maxGroupVehicles, useEntitlement } from '@/lib/entitlement';
import { formatMinutes } from '@/lib/intent';
import { useLibrary, type SavedTour } from '@/lib/library';
import { formatKm, haversine } from '@/lib/tour';

const DAYS = 28;

function dayStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

export default function AusfahrtNeu() {
  const params = useLocalSearchParams<{ tour?: string }>();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const ent = useEntitlement();
  const library = useLibrary();
  const tours = useMemo(() => [...library].filter((t) => t.linie.length > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [library]);

  const [tourId, setTourId] = useState<string | null>(params.tour ?? null);
  const [picking, setPicking] = useState(!params.tour);
  const [day, setDay] = useState(() => {
    // nächster Samstag als Vorschlag, sonst morgen
    const now = new Date();
    const toSat = (6 - now.getDay() + 7) % 7 || 7;
    return Math.min(toSat, DAYS - 1);
  });
  const [minutes, setMinutes] = useState(10 * 60);
  const [meeting, setMeeting] = useState<string | null>(null);
  const maxSeats = Math.max(1, maxGroupVehicles(ent) - 1);
  const [seats, setSeats] = useState(Math.min(5, maxSeats));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const tour = tours.find((t) => t.id === tourId) ?? null;
  const startsAt = useMemo(() => {
    const d = dayStart(day);
    d.setMinutes(minutes);
    return d;
  }, [day, minutes]);
  const startName = tour ? tour.namen?.[0] || 'Start der Tour' : '';
  const meetingName = meeting ?? startName;
  const roundTrip = tour ? tour.wegpunkte.length > 1 && haversine(tour.wegpunkte[0], tour.wegpunkte[tour.wegpunkte.length - 1]) < 3 : false;
  const goal = tour && !roundTrip ? tour.namen?.[tour.namen.length - 1] || 'Ziel der Tour' : null;
  const arr = tour?.minutes ? new Date(startsAt.getTime() + tour.minutes * 60000) : null;
  const tooSoon = startsAt.getTime() < now + 30 * 60000;

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/community'));

  const publish = async () => {
    if (!tour || busy) return;
    if (tooSoon) {
      setErr('Die Abfahrt muss mindestens 30 Minuten in der Zukunft liegen.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const start = tour.wegpunkte[0];
      const id = await publishAusfahrt(tour as SavedTour, { startsAt, meeting: { name: meetingName.trim() || startName, lat: start[0], lon: start[1] }, note, seats });
      router.replace({ pathname: '/ausfahrt/[id]', params: { id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <View style={styles.head}>
      <AppText variant="display" style={styles.flex}>Ausfahrt</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Schließen" hitSlop={4} onPress={close} style={styles.roundBtn}>
        <SymbolView name="xmark" size={16} weight="bold" tintColor={Colors.text} />
      </Pressable>
    </View>
  );

  if (!session) {
    return (
      <View style={[styles.root, styles.pad, { paddingTop: insets.top + Spacing.s }]}>
        {head}
        <AppText muted>Für Ausfahrten brauchst du ein Konto.</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.primary}>
          <AppText style={styles.primaryText}>Anmelden</AppText>
        </Pressable>
      </View>
    );
  }
  if (!ent.loading && !ent.active) {
    return (
      <View style={[styles.root, styles.pad, { paddingTop: insets.top + Spacing.s }]}>
        {head}
        <AppText muted>Ausfahrten veröffentlichen kannst du mit der Mitgliedschaft. Mitfahren und anfragen geht auch ohne.</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/mitgliedschaft')} style={styles.primary}>
          <AppText style={styles.primaryText}>Mitgliedschaft ansehen</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: insets.top + Spacing.s, paddingBottom: insets.bottom + Spacing.xxxl }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        {head}

        {/* Tour */}
        {tour && !picking ? (
          <Pressable accessibilityRole="button" accessibilityHint="Andere Tour wählen" onPress={() => setPicking(true)} style={styles.tourCard}>
            <View style={styles.preview}>
              <RoutePreview tour={tour} height={120} />
            </View>
            <View style={styles.tourRow}>
              <View style={styles.flex}>
                <AppText style={styles.tourName} numberOfLines={2}>{tour.name}</AppText>
                <AppText variant="caption" muted>
                  {[`${formatKm(tour.laenge_km, 0)} km`, tour.minutes ? formatMinutes(Math.round(tour.minutes)) : null, 'aus Touren'].filter(Boolean).join('  ·  ')}
                </AppText>
              </View>
              <AppText style={styles.change}>Ändern</AppText>
            </View>
          </Pressable>
        ) : (
          <View style={styles.section}>
            <AppText style={styles.label}>Welche Tour fahrt ihr?</AppText>
            {tours.length === 0 && <AppText muted>Speichere zuerst eine Tour unter Touren.</AppText>}
            {tours.slice(0, 30).map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: t.id === tourId }}
                onPress={() => {
                  setTourId(t.id);
                  setMeeting(null);
                  setPicking(false);
                }}
                style={[styles.pickRow, t.id === tourId && styles.pickOn]}>
                <View style={styles.flex}>
                  <AppText style={styles.pickName} numberOfLines={1}>{t.name}</AppText>
                  <AppText variant="caption" muted>{formatKm(t.laenge_km, 0)} km{t.folder ? `  ·  ${t.folder}` : ''}</AppText>
                </View>
                {t.id === tourId && <SymbolView name="checkmark" size={16} weight="bold" tintColor={Colors.text} />}
              </Pressable>
            ))}
          </View>
        )}

        {tour && !picking && (
          <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.form}>
            {/* Abfahrt */}
            <View style={styles.section}>
              <AppText style={styles.label}>Abfahrt</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
                {Array.from({ length: DAYS }, (_, i) => {
                  const d = dayStart(i);
                  const on = i === day;
                  return (
                    <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={i === 0 ? 'Heute' : i === 1 ? 'Morgen' : shortDate(d)} onPress={() => setDay(i)} style={[styles.day, on && styles.dayOn]}>
                      <AppText style={[styles.dayWd, on && styles.dayTextOn]}>{i === 0 ? 'Heute' : i === 1 ? 'Morgen' : shortDate(d).split(' ')[0]}</AppText>
                      <AppText style={[styles.dayNum, on && styles.dayTextOn]}>{d.getDate()}.{d.getMonth() + 1}.</AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.stepper}>
                <StepBtn icon="minus" label="15 Minuten früher" onPress={() => setMinutes((m) => Math.max(0, m - 15))} />
                <View style={styles.stepVal}>
                  <AppText style={styles.metric}>{clock(startsAt)}</AppText>
                  <AppText variant="caption" muted>Uhr</AppText>
                </View>
                <StepBtn icon="plus" label="15 Minuten später" onPress={() => setMinutes((m) => Math.min(23 * 60 + 45, m + 15))} />
              </View>
              {tooSoon && <AppText variant="caption" style={styles.warn}>Die Abfahrt liegt zu knapp, wähle eine spätere Zeit.</AppText>}
            </View>

            {/* Treffpunkt */}
            <View style={styles.section}>
              <AppText style={styles.label}>Treffpunkt</AppText>
              <TextInput maxFontSizeMultiplier={1.2} value={meetingName} onChangeText={setMeeting} placeholder="Zum Beispiel Parkplatz am Start" placeholderTextColor={Colors.muted} maxLength={80} style={styles.input} accessibilityLabel="Treffpunkt" />
              <AppText variant="caption" muted>Start der Tour, der Name ist frei wählbar.</AppText>
            </View>

            {/* Ziel und Ankunft */}
            <View style={styles.info}>
              <View style={styles.flex}>
                <AppText style={styles.label}>{goal ? 'Ziel' : 'Rundtour'}</AppText>
                <AppText style={styles.value}>{goal ?? 'zurück zum Treffpunkt'}</AppText>
              </View>
              {arr && (
                <View style={styles.alignEnd}>
                  <AppText style={styles.label}>Ankunft</AppText>
                  <AppText style={styles.value}>etwa {clock(arr)}</AppText>
                </View>
              )}
            </View>
            <AppText variant="caption" muted style={styles.under}>Aus der Tour berechnet, Pausen nicht eingerechnet.</AppText>

            {/* Plätze */}
            <View style={styles.section}>
              <AppText style={styles.label}>Plätze für Mitfahrer</AppText>
              <View style={styles.stepper}>
                <StepBtn icon="minus" label="Ein Platz weniger" disabled={seats <= 1} onPress={() => setSeats((s) => Math.max(1, s - 1))} />
                <View style={styles.stepVal}>
                  <AppText style={styles.metric}>{seats}</AppText>
                  <AppText variant="caption" muted>{seats === 1 ? 'Fahrzeug' : 'Fahrzeuge'}</AppText>
                </View>
                <StepBtn icon="plus" label="Ein Platz mehr" disabled={seats >= maxSeats} onPress={() => setSeats((s) => Math.min(maxSeats, s + 1))} />
              </View>
            </View>

            {/* Hinweis */}
            <View style={styles.section}>
              <AppText style={styles.label}>Hinweis an Mitfahrer (optional)</AppText>
              <TextInput maxFontSizeMultiplier={1.2} value={note} onChangeText={setNote} placeholder="Zum Beispiel Mittag am Ziel, Rückweg frei" placeholderTextColor={Colors.muted} multiline maxLength={500} style={[styles.input, styles.inputMulti]} accessibilityLabel="Hinweis an Mitfahrer" />
            </View>

            {err && <AppText style={styles.error}>{err}</AppText>}
            <Pressable accessibilityRole="button" onPress={() => void publish()} disabled={busy} style={[styles.primary, tooSoon && styles.primaryOff]}>
              {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Ausfahrt veröffentlichen</AppText>}
            </Pressable>
            <AppText variant="caption" muted style={styles.center}>Für alle mit Konto in der Community sichtbar, mit Treffpunkt und Zeit.</AppText>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function StepBtn({ icon, label, onPress, disabled }: { icon: 'plus' | 'minus'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.step, disabled && styles.stepOff]}>
      <SymbolView name={icon} size={18} weight="bold" tintColor={Colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  pad: { paddingHorizontal: Spacing.xl, gap: Spacing.xl },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  alignEnd: { alignItems: 'flex-end' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  roundBtn: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  tourCard: { backgroundColor: Colors.surface, borderRadius: Radius.l, overflow: 'hidden' },
  preview: { backgroundColor: Colors.surface },
  tourRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, padding: Spacing.l },
  tourName: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, textTransform: 'uppercase' },
  change: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  form: { gap: Spacing.xl },
  section: { gap: Spacing.s },
  label: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  value: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 60, paddingHorizontal: Spacing.l, borderRadius: Radius.m, backgroundColor: Colors.surface },
  pickOn: { backgroundColor: Colors.surface2 },
  pickName: { fontFamily: Fonts.bold, fontSize: Type.title },
  days: { gap: Spacing.s, paddingRight: Spacing.xl },
  day: { width: 64, height: 64, borderRadius: Radius.m, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayOn: { backgroundColor: Colors.text },
  dayWd: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  dayNum: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  dayTextOn: { color: Colors.ground },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.s },
  step: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.35 },
  stepVal: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  metric: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, fontVariant: ['tabular-nums'] },
  input: { minHeight: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  inputMulti: { minHeight: 96, paddingTop: Spacing.m, textAlignVertical: 'top' },
  info: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.m, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m },
  under: { marginTop: -Spacing.m },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { backgroundColor: Colors.signalDeep },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.button },
  warn: { color: Colors.warn },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
