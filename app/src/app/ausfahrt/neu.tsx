/**
 * Ausfahrt anlegen (Konzept Koray 9.11., privat seit 13.11.): Tour aus Touren, Abfahrt, Treffpunkt, Mitfahrer,
 * Plätze und ein Hinweis. Ankunft und Ziel kommen aus der Tour.
 * Privat ist der Standard: nur Organisator und Eingeladene sehen die Ausfahrt. Kostenfrei mit drei Fahrzeugen
 * insgesamt (du und zwei Mitfahrer); in der Community veröffentlichen und mehr Plätze gibt es mit der Mitgliedschaft.
 */
import { reverseName } from '@/lib/geocode';
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
import { Avatar } from '@/components/community/ride-bits';
import { refreshContacts, useContacts } from '@/lib/contacts';
import { inviteToRide } from '@/lib/group/invites';
import { useSession } from '@/lib/auth';
import { maxGroupVehicles, useEntitlement } from '@/lib/entitlement';
import { formatMinutes } from '@/lib/intent';
import { useLibrary, type SavedTour } from '@/lib/library';
import { formatKm, haversine } from '@/lib/tour';
import { t, tr } from '@/i18n';

const DAYS = 28;

function dayStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

export default function AusfahrtNeu() {
  // invite und meetingName kommen von „Nochmal fahren“ (Koray 14.11.): dieselben Leute und derselbe Treffpunkt
  const params = useLocalSearchParams<{ tour?: string; invite?: string; meetingName?: string }>();
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
  const [meeting, setMeeting] = useState<string | null>(params.meetingName || null);
  // ohne Mitgliedschaft privat mit drei Fahrzeugen insgesamt, also zwei Mitfahrern (Koray 13.11.)
  const FREE_SEATS = 2;
  const maxSeats = ent.active ? Math.max(1, maxGroupVehicles(ent) - 1) : FREE_SEATS;
  // gewünschte Plätze; angezeigt und gesendet wird höchstens, was das Konto erlaubt
  const [seatsWanted, setSeats] = useState(5);
  const seats = Math.min(seatsWanted, maxSeats);
  const [pub, setPub] = useState(false);
  const contacts = useContacts();
  const friends = (contacts.list ?? []).filter((c) => c.status === 'kontakt');
  const [picked, setPicked] = useState<string[]>(() => (params.invite ? params.invite.split(',').filter(Boolean) : []));
  useEffect(() => {
    void refreshContacts();
  }, []);
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
  // Treffpunkt immer als Ort (Konsistenzprüfung 15.11., K6): Name des Starts, sonst der Ort dazu
  const given = tour?.namen?.[0]?.trim();
  const usable = given && !/^(Dein Standort|Aktueller Standort|Start der Tour)$/i.test(given) ? given : null;
  const [placeName, setPlaceName] = useState<string | null>(null);
  const firstPoint = tour?.wegpunkte[0] ?? null;
  const firstKey = !usable && firstPoint ? `${firstPoint[0]},${firstPoint[1]}` : null;
  useEffect(() => {
    if (!firstKey) return;
    const [la, lo] = firstKey.split(',').map(Number);
    let live = true;
    reverseName([la, lo])
      .then((n) => live && n !== 'Standort' && setPlaceName(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [firstKey]);
  const startName = tour ? (usable ?? placeName ?? tr('Start der Tour')) : '';
  const meetingName = meeting ?? startName;
  const roundTrip = tour ? tour.wegpunkte.length > 1 && haversine(tour.wegpunkte[0], tour.wegpunkte[tour.wegpunkte.length - 1]) < 3 : false;
  const goal = tour && !roundTrip ? tour.namen?.[tour.namen.length - 1] || tr('Ziel der Tour') : null;
  const arr = tour?.minutes ? new Date(startsAt.getTime() + tour.minutes * 60000) : null;
  const tooSoon = startsAt.getTime() < now + 30 * 60000;

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/touren'));

  const publish = async () => {
    if (!tour || busy) return;
    if (tooSoon) {
      setErr(tr('Die Abfahrt muss mindestens 30 Minuten in der Zukunft liegen.'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const start = tour.wegpunkte[0];
      const id = await publishAusfahrt(tour as SavedTour, { startsAt, meeting: { name: meetingName.trim() || startName, lat: start[0], lon: start[1] }, note, seats: Math.max(seats, picked.length), public: pub && ent.active });
      // gewählte Kontakte gleich einladen; scheitert eine Einladung, bleibt die Ausfahrt trotzdem stehen
      for (const uid of picked) await inviteToRide(id, uid).catch(() => undefined);
      router.replace({ pathname: '/ausfahrt/[id]', params: { id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const head = (
    <View style={styles.head}>
      <AppText variant="display" style={styles.flex}>{t('Ausfahrt')}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Schließen')} hitSlop={4} onPress={close} style={styles.roundBtn}>
        <SymbolView name="xmark" size={16} weight="semibold" tintColor={Colors.text} />
      </Pressable>
    </View>
  );

  if (!session) {
    return (
      <View style={[styles.root, styles.pad, { paddingTop: insets.top + Spacing.s }]}>
        {head}
        <AppText muted>{t('Für Ausfahrten brauchst du ein Konto.')}</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.primary}>
          <AppText style={styles.primaryText}>{t('Anmelden')}</AppText>
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
          <Pressable accessibilityRole="button" accessibilityHint={t('Andere Tour wählen')} onPress={() => setPicking(true)} style={styles.tourCard}>
            <View style={styles.preview}>
              <RoutePreview tour={tour} height={120} />
            </View>
            <View style={styles.tourRow}>
              <View style={styles.flex}>
                <AppText style={styles.tourName} numberOfLines={2}>{tour.name}</AppText>
                <AppText variant="caption" muted>
                  {[`${formatKm(tour.laenge_km, 0)} km`, tour.minutes ? formatMinutes(Math.round(tour.minutes)) : null, tr('aus Touren')].filter(Boolean).join('  ·  ')}
                </AppText>
              </View>
              <AppText style={styles.change}>{t('Ändern')}</AppText>
            </View>
          </Pressable>
        ) : (
          <View style={styles.section}>
            <AppText style={styles.label}>{t('Welche Tour fahrt ihr?')}</AppText>
            {tours.length === 0 && <AppText muted>{t('Speichere zuerst eine Tour unter Touren.')}</AppText>}
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
                {t.id === tourId && <SymbolView name="checkmark" size={16} weight="semibold" tintColor={Colors.text} />}
              </Pressable>
            ))}
          </View>
        )}

        {tour && !picking && (
          <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.form}>
            {/* Abfahrt */}
            <View style={styles.section}>
              <AppText style={styles.label}>{t('Abfahrt')}</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
                {Array.from({ length: DAYS }, (_, i) => {
                  const d = dayStart(i);
                  const on = i === day;
                  return (
                    <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={i === 0 ? tr('Heute') : i === 1 ? tr('Morgen') : shortDate(d)} onPress={() => setDay(i)} style={[styles.day, on && styles.dayOn]}>
                      <AppText style={[styles.dayWd, on && styles.dayTextOn]}>{i === 0 ? tr('Heute') : i === 1 ? tr('Morgen') : shortDate(d).split(' ')[0]}</AppText>
                      <AppText style={[styles.dayNum, on && styles.dayTextOn]}>{d.getDate()}.{d.getMonth() + 1}.</AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.stepper}>
                <StepBtn icon="minus" label={t('15 Minuten früher')} onPress={() => setMinutes((m) => Math.max(0, m - 15))} />
                <View style={styles.stepVal}>
                  <AppText style={styles.metric}>{clock(startsAt)}</AppText>
                  <AppText variant="caption" muted>{t('Uhr')}</AppText>
                </View>
                <StepBtn icon="plus" label={t('15 Minuten später')} onPress={() => setMinutes((m) => Math.min(23 * 60 + 45, m + 15))} />
              </View>
              {tooSoon && <AppText variant="caption" style={styles.warn}>{t('Die Abfahrt liegt zu knapp, wähle eine spätere Zeit.')}</AppText>}
            </View>

            {/* Treffpunkt */}
            <View style={styles.section}>
              <AppText style={styles.label}>{t('Treffpunkt')}</AppText>
              <TextInput maxFontSizeMultiplier={1.2} value={meetingName} onChangeText={setMeeting} placeholder={t('Zum Beispiel Parkplatz am Start')} placeholderTextColor={Colors.muted} maxLength={80} style={styles.input} accessibilityLabel={t('Treffpunkt')} />
              <AppText variant="caption" muted>{t('Vorbelegt mit dem Start der Tour, frei änderbar.')}</AppText>
            </View>

            {/* Ziel und Ankunft */}
            <View style={styles.info}>
              <View style={styles.flex}>
                <AppText style={styles.label}>{goal ? tr('Ziel') : tr('Rundtour')}</AppText>
                <AppText style={styles.value}>{goal ?? tr('zurück zum Treffpunkt')}</AppText>
              </View>
              {arr && goal && (
                <View style={styles.alignEnd}>
                  <AppText style={styles.label}>{t('Ankunft')}</AppText>
                  <AppText style={styles.value}>etwa {clock(arr)}</AppText>
                </View>
              )}
            </View>
            <AppText variant="caption" muted style={styles.under}>{t('Aus der Tour berechnet, Pausen nicht eingerechnet.')}</AppText>

            {/* Mitfahrer aus den Kontakten (Koray 13.11.); weitere lädst du danach ein oder per Link */}
            <View style={styles.section}>
              <View style={styles.rowBetween}>
                <AppText style={styles.label}>{t('Wer fährt mit')}</AppText>
                {picked.length > 0 && <AppText style={styles.label}>{picked.length} von {seats}</AppText>}
              </View>
              {friends.length === 0 ? (
                <AppText variant="caption" muted>{t('Nach dem Anlegen lädst du Fahrer ein oder teilst einen Link, etwa in WhatsApp.')}</AppText>
              ) : (
                <>
                  {friends.map((c) => {
                    const on = picked.includes(c.id);
                    const full = !on && picked.length >= seats;
                    return (
                      <Pressable
                        key={c.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: full }}
                        disabled={full}
                        onPress={() => setPicked((l) => (on ? l.filter((x) => x !== c.id) : [...l, c.id]))}
                        style={[styles.pickRow, on && styles.pickOn, full && styles.stepOff]}>
                        <Avatar name={c.name} userId={c.id} size={36} />
                        <View style={styles.flex}>
                          <AppText style={styles.pickName} numberOfLines={1}>{c.name}</AppText>
                          {c.car ? <AppText variant="caption" muted numberOfLines={1}>{c.car}</AppText> : null}
                        </View>
                        <View style={[styles.check, on && styles.checkOn]}>{on && <SymbolView name="checkmark" size={16} weight="semibold" tintColor={Colors.ground} />}</View>
                      </Pressable>
                    );
                  })}
                  <AppText variant="caption" muted>{t('Eingeladene sagen zu oder ab. Einen Link zum Teilen bekommst du nach dem Anlegen.')}</AppText>
                </>
              )}
            </View>

            {/* Sichtbarkeit: privat ist der Standard */}
            <View style={styles.section}>
              <AppText style={styles.label}>{t('Wer sieht die Ausfahrt')}</AppText>
              <Pressable accessibilityRole="radio" accessibilityState={{ selected: !pub }} onPress={() => setPub(false)} style={[styles.option, !pub && styles.pickOn]}>
                <View style={[styles.radio, !pub && styles.radioOn]} />
                <View style={styles.flex}>
                  <AppText style={styles.pickName}>{t('Privat')}</AppText>
                  <AppText variant="caption" muted>{t('Nur du und deine Eingeladenen. Nicht in der Community.')}</AppText>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: pub }}
                onPress={() => (ent.active ? setPub(true) : router.push('/mitgliedschaft'))}
                style={[styles.option, pub && styles.pickOn]}>
                <View style={[styles.radio, pub && styles.radioOn]} />
                <View style={styles.flex}>
                  <AppText style={styles.pickName}>{t('In der Community')}</AppText>
                  <AppText variant="caption" muted>{ent.active ? tr('Alle sehen sie unter Ausfahrten und können anfragen.') : tr('Mit der Mitgliedschaft, dazu mehr Plätze.')}</AppText>
                </View>
              </Pressable>
            </View>

            {/* Plätze */}
            <View style={styles.section}>
              <AppText style={styles.label}>{t('Plätze für Teilnehmer')}</AppText>
              <View style={styles.stepper}>
                <StepBtn icon="minus" label={t('Ein Platz weniger')} disabled={seats <= Math.max(1, picked.length)} onPress={() => setSeats(Math.max(1, picked.length, seats - 1))} />
                <View style={styles.stepVal}>
                  <AppText style={styles.metric}>{seats}</AppText>
                  <AppText variant="caption" muted>{seats === 1 ? tr('Platz') : tr('Plätze')}</AppText>
                </View>
                <StepBtn icon="plus" label={t('Ein Platz mehr')} disabled={seats >= maxSeats} onPress={() => setSeats(Math.min(maxSeats, seats + 1))} />
              </View>
              {!ent.active && <AppText variant="caption" muted>{t('Kostenfrei fahrt ihr zu dritt, du und zwei Teilnehmer. Mehr Plätze gibt es mit der Mitgliedschaft.')}</AppText>}
            </View>

            {/* Hinweis */}
            <View style={styles.section}>
              <AppText style={styles.label}>{t('Hinweis an die Teilnehmer (optional)')}</AppText>
              <TextInput maxFontSizeMultiplier={1.2} value={note} onChangeText={setNote} placeholder={t('Zum Beispiel Mittag am Ziel, Rückweg frei')} placeholderTextColor={Colors.muted} multiline maxLength={500} style={[styles.input, styles.inputMulti]} accessibilityLabel={t('Hinweis an Mitfahrer')} />
            </View>

            {err && <AppText style={styles.error}>{err}</AppText>}
            <Pressable accessibilityRole="button" onPress={() => void publish()} disabled={busy} style={[styles.primary, tooSoon && styles.primaryOff]}>
              {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{pub ? tr('Ausfahrt veröffentlichen') : tr('Ausfahrt anlegen')}</AppText>}
            </Pressable>
            <AppText variant="caption" muted style={styles.center}>{pub ? tr('Für alle mit Konto in der Community sichtbar, mit Treffpunkt und Zeit.') : tr('Privat: in der Community steht sie nicht.')}</AppText>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function StepBtn({ icon, label, onPress, disabled }: { icon: 'plus' | 'minus'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.step, disabled && styles.stepOff]}>
      <SymbolView name={icon} size={20} weight="semibold" tintColor={Colors.text} />
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.muted },
  radioOn: { borderWidth: 7, borderColor: Colors.signal },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.text },
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
