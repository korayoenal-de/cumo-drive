/**
 * Planer für das Handy: Tour beschreiben (Freitext plus Chips), Rundtour einstellen oder
 * eine Tour von Hand aus Start, Via Punkten und Ziel bauen. Danach prüfen und als Vorschau zeigen.
 * Aufbau wie Apple Maps: Die Karte füllt den Screen, der Planer liegt als Blatt mit drei Höhen darauf.
 * Die Web Version liegt in planner.web.tsx.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { RouteMap } from '@/components/map/route-map';
import { closedHint, passState, usePassLive } from '@/lib/pass-live';
import { PASS_STATUS_URL, PASSES, passesAlong, passPoint, passSummary, searchPasses, type Pass } from '@/lib/passes';
import { countCurves } from '@/lib/stats';
import {
  buildTour, findPlace, locate, newSeed, PHASES, toPlanError,
  type PlanError, type PlanPhase, type Spot, type TourRequest,
} from '@/components/planner/create-tour';
import { CLASS_COLORS } from '@/components/planner/route-preview';
import { ElevationChart } from '@/components/planner/elevation-chart';
import { ExportRow } from '@/components/planner/export-row';
import { DirectionDial } from '@/components/planner/direction-dial';
import { Chip } from '@/components/ui/chip';
import { MapSheet, type Detent } from '@/components/ui/map-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { useSession } from '@/lib/auth';
import { saveTour, syncLibrary } from '@/lib/library';
import { reverseName, searchPlaces, type Place } from '@/lib/geocode';
import { formatMinutes, parseWish, STOPS, targetKm, type Stop, type TourWish } from '@/lib/intent';
import { planChecked, type PlannedTour, type PlanStep } from '@/lib/plan';
import { RIDE_MODES, useRideMode } from '@/lib/ride-mode';
import { bearingTo, DIRECTIONS, type Direction } from '@/lib/roundtrip';
import { insertVia, movePoint, routePasses } from '@/lib/route-edit';
import { STOP_KINDS, stopsAlong, type StopHit, type StopKind } from '@/lib/stops-along';
import { flatten, formatKm, legs, PROFILES, PROFILE_CHOICES, type CheckClass, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';
import { selectVehicle, useVehicles } from '@/lib/vehicle';

const WARN = '#E8B03A';

type Mode = 'beschreiben' | 'rundtour' | 'tour';

const DURATIONS: { minutes: number; big: string; unit: string }[] = [
  { minutes: 60, big: '1', unit: 'h' },
  { minutes: 120, big: '2', unit: 'h' },
  { minutes: 180, big: '3', unit: 'h' },
  { minutes: 270, big: '½', unit: 'Tag' },
  { minutes: 420, big: '1', unit: 'Tag' },
];

const STYLE_PROFILES: Profile[] = ['kurvig', 'entspannt'];
const PROFILE_WORD: Record<Profile, string> = { kurvig: 'kurvig', paesse: 'mit Pässen', entspannt: 'entspannt', schnell: 'zügig' };

const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];
const MIN_STEPS = [60, 90, 120, 180, 240, 300, 420];

const CLASS_LABEL: Record<CheckClass, string> = { ok: 'Sauber', pruefen: 'Prüfen', raus: 'Gesperrt' };

/** Fahrzeit kompakt für große Zahlen, damit sie in eine Zeile passt: 2:11 h oder 45 min. */
function bigDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

function dirPhrase(d: Direction): string {
  if (d === 'zufall') return 'in zufälliger Richtung';
  return `Richtung ${DIRECTIONS.find((x) => x.id === d)!.label}`;
}

function joinDe(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** Wunsch aus Freitext und Chips zusammenführen; Chips haben Vorrang. */
type Overrides = {
  minutes?: number | null;
  profile?: Profile;
  direction?: Direction;
  stops: Partial<Record<Stop, boolean>>;
};

type Effective = {
  startName?: string;
  towardName?: string;
  direction?: Direction;
  km?: number;
  minutes?: number;
  profile: Profile;
  stops: Stop[];
};

function effectiveWish(wish: TourWish, o: Overrides): Effective {
  const dur = o.minutes !== undefined ? { minutes: o.minutes ?? undefined } : { km: wish.km, minutes: wish.minutes };
  const direction = o.direction ?? wish.direction;
  return {
    startName: wish.startName,
    towardName: o.direction ? undefined : wish.towardName,
    direction,
    ...dur,
    profile: o.profile ?? wish.profile ?? 'kurvig',
    stops: STOPS.map((s) => s.id).filter((id) => o.stops[id] ?? wish.stops.includes(id)),
  };
}

function understoodSentence(e: Effective): string {
  const km = targetKm(e, e.profile);
  const parts: string[] = [`Rundtour ab ${e.startName ?? 'deinem Standort'}`];
  if (e.km) parts.push(`${e.km} km`);
  else if (e.minutes) parts.push(`${formatMinutes(e.minutes)} (etwa ${km} km)`);
  else parts.push(`etwa ${km} km`);
  parts.push(PROFILE_WORD[e.profile]);
  if (e.towardName) parts.push(`Richtung ${e.towardName}`);
  else parts.push(dirPhrase(e.direction ?? 'zufall'));
  let s = parts.join(', ') + '.';
  if (e.stops.length) s += ` Stopps: ${joinDe(e.stops.map((id) => STOPS.find((x) => x.id === id)!.label))}.`;
  return s;
}

type Stage =
  | { kind: 'form' }
  | { kind: 'working'; phase: PlanPhase; done: PlanPhase[] }
  | { kind: 'result'; tour: PlannedTour; req: TourRequest; stops: Stop[] }
  | { kind: 'error'; error: PlanError; req?: TourRequest };

export default function Planner() {
  const [rideMode, setRideMode] = useRideMode();
  const [mode, setMode] = useState<Mode>('rundtour');
  const [view, setView] = useState<Stage>({ kind: 'form' });
  const abort = useRef<AbortController | null>(null);
  const lastStops = useRef<Stop[]>([]);
  const insets = useSafeAreaInsets();

  // Blatt über der Karte: klein, halb oder groß
  const [detent, setDetent] = useState<Detent>(0);
  const scroll = useRef<ScrollViewInstance>(null);
  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: false });
  /** Beim Tippen in ein Suchfeld groß, damit Tastatur und Treffer Platz haben */
  const expand = () => setDetent(2);

  // Beschreiben
  const [text, setText] = useState('');
  const [over, setOver] = useState<Overrides>({ stops: {} });
  const [micHint, setMicHint] = useState(false);
  const wish = parseWish(text);
  const eff = effectiveWish(wish, over);

  // Rundtour
  const [here, setHere] = useState<Spot | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<PlanError | null>(null);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [hits, setHits] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [lengthBy, setLengthBy] = useState<'km' | 'dauer'>('km');
  const [kmIdx, setKmIdx] = useState(3);
  const [minIdx, setMinIdx] = useState(2);
  const [direction, setDirection] = useState<Direction>('zufall');
  const [profile, setProfile] = useState<Profile>('kurvig');
  const [avoid, setAvoid] = useState<Avoid>(DEFAULT_AVOID);

  const roundKm = lengthBy === 'km' ? KM_STEPS[kmIdx] : targetKm({ minutes: MIN_STEPS[minIdx] }, profile);

  // Tour von Hand: Zustand lebt hier, damit er beim Wechsel der Modi erhalten bleibt.
  // Steht eine Route, geht das Blatt auf halbe Höhe, damit sie auf der Karte zu sehen ist.
  const tourPlan = useTourPlan(() => setDetent(1));
  const [pending, setPending] = useState<PendingPoint | null>(null);

  // Ist der Standort schon freigegeben, zeigt die Karte gleich die Umgebung (ohne neue Abfrage)
  useEffect(() => {
    let gone = false;
    Location.getForegroundPermissionsAsync()
      .then((perm) => (perm.granted ? locate() : null))
      .then((spot) => {
        if (spot && !gone) setHere((cur) => cur ?? spot);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);

  async function findHere() {
    setLocating(true);
    setLocError(null);
    try {
      setHere(await locate());
    } catch (e) {
      setLocError(toPlanError(e));
    } finally {
      setLocating(false);
    }
  }

  // Welche Art der schnellen Runde zuletzt offen war
  const lastRunde = useRef<Mode>('rundtour');
  function switchMode(m: Mode) {
    if (m !== 'tour') lastRunde.current = m;
    setMode(m);
    if ((m === 'rundtour' || m === 'tour') && !here && !locating) void findHere();
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      setHits(await searchPlaces(q, here?.p));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function run(prepare: (signal: AbortSignal) => Promise<TourRequest>, stops: Stop[], seed = newSeed()) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    lastStops.current = stops;
    const done: PlanPhase[] = [];
    const step = (phase: PlanPhase) => {
      setView((v) => {
        const prev = v.kind === 'working' ? v.phase : null;
        if (prev && prev !== phase && !done.includes(prev)) done.push(prev);
        return { kind: 'working', phase, done: [...done] };
      });
    };
    step('start');
    toTop();
    let req: TourRequest | undefined;
    try {
      req = await prepare(ctrl.signal);
      const tour = await buildTour(req, seed, step, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setView({ kind: 'result', tour, req, stops });
        setDetent(1);
        toTop();
      }
    } catch (e) {
      const error = toPlanError(e, ctrl.signal);
      if (error.kind === 'aborted') setView({ kind: 'form' });
      else setView({ kind: 'error', error, req });
    }
  }

  function createFromWish() {
    const e = eff;
    void run(async (signal) => {
      const start: Spot = e.startName
        ? await findPlace(e.startName, here?.p, 'Den Startort', signal).then((p) => ({ p: p.p, name: p.name }))
        : here ?? (await locate(signal));
      let bearing: number | undefined;
      if (!e.direction && e.towardName) {
        const target = await findPlace(e.towardName, start.p, 'Die Region', signal);
        bearing = bearingTo(start.p, target.p);
      }
      return {
        start, km: targetKm(e, e.profile), direction: e.direction ?? 'zufall', bearing,
        towardName: e.towardName, profile: e.profile, avoid: DEFAULT_AVOID,
      };
    }, e.stops);
  }

  function createRoundTrip() {
    void run(async (signal) => {
      const start = picked ?? here ?? (await locate(signal));
      if (!picked && !here) setHere(start);
      return { start, km: roundKm, direction, profile, avoid };
    }, []);
  }

  // Stopp in eine fertige Runde einplanen: Via Punkt mit kleinstem Umweg, dann neu planen
  const [adding, setAdding] = useState(false);
  async function addStop(p: LatLon) {
    if (view.kind !== 'result') return;
    const cur = view;
    setAdding(true);
    try {
      const t = await planChecked(cur.tour.name, insertVia(cur.tour.wegpunkte, p), cur.req.profile, cur.req.avoid, () => undefined);
      setView({ ...cur, tour: t });
    } catch {
      // bleibt bei der bisherigen Runde
    } finally {
      setAdding(false);
    }
  }

  function reroll(req: TourRequest) {
    void run(async () => req, lastStops.current);
  }

  function cancel() {
    abort.current?.abort();
    setView({ kind: 'form' });
  }

  // Was die große Karte zeigt: Ergebnis, geplante Route oder ohne Route den eigenen Standort
  const tourPts = tourPlan.pts;
  const tourFits = !!tourPlan.planned && samePts(tourPlan.planned.wegpunkte, tourPts);
  const routeTour = tourFits ? tourPlan.planned : null;
  const inTour = view.kind === 'form' && mode === 'tour';
  const mapTour: Tour =
    view.kind === 'result'
      ? view.tour
      : inTour
        ? (routeTour ?? { name: tourPlan.name, laenge_km: 0, wegpunkte: tourPts, linie: [], warnungen: [] })
        : EMPTY_TOUR;
  const pins = inTour
    ? tourPts.slice(1, -1).map((p, i) => ({ id: `via${i}-${keyOf(p)}`, p, label: String(i + 1), title: tourPlan.names[keyOf(p)] ?? `Via Punkt ${i + 1}` }))
    : undefined;
  const focus = inTour
    ? (pending?.p ?? (tourPts.length ? tourPts[tourPts.length - 1] : here?.p ?? null))
    : (picked?.p ?? here?.p ?? null);

  function onMapLongPress(p: LatLon) {
    if (!tourPts.length) {
      tourPlan.add('start', p, profile, avoid);
      return;
    }
    setPending({ p, name: null });
    if (detent === 0) setDetent(1);
    toTop();
    reverseName(p)
      .then((n) => setPending((cur) => (cur && cur.p === p ? { ...cur, name: n } : cur)))
      .catch(() => undefined);
  }

  // Kopf des Blatts: Modus oder Name der Tour, darunter Fortschritt oder Hinweis
  const header = (
    <>
      {view.kind === 'form' ? (
        <Segmented
          value={mode === 'tour' ? 'route' : 'runde'}
          options={[
            { id: 'runde', label: 'Schnelle Runde' },
            { id: 'route', label: 'Route planen' },
          ]}
          onChange={(v) => switchMode(v === 'route' ? 'tour' : lastRunde.current)}
        />
      ) : (
        <AppText variant="label">
          {view.kind === 'result' ? view.tour.name : view.kind === 'working' ? 'Tour wird erstellt' : 'Das hat nicht geklappt'}
        </AppText>
      )}
      {view.kind === 'working' || (inTour && tourPlan.step) ? (
        <View style={styles.summary}>
          <ActivityIndicator color={Colors.signal} />
          <AppText style={styles.flex} numberOfLines={1}>
            {view.kind === 'working' ? PHASES.find((x) => x.id === view.phase)?.label : tourPlan.step ? STEP_TEXT[tourPlan.step] : ''}
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" muted numberOfLines={2} style={styles.summaryHint}>
          {view.kind === 'error'
            ? view.error.message
            : mode === 'tour'
              ? tourPts.length
                ? 'Lange auf die Karte drücken setzt einen weiteren Punkt.'
                : 'Gib Start und Ziel ein oder drück lange auf die Karte.'
              : mode === 'beschreiben'
                ? 'Beschreib deine Runde in einem Satz, wir planen sie.'
                : `Rundtour ab ${picked?.name ?? here?.name ?? 'deinem Standort'}, etwa ${roundKm} km`}
        </AppText>
      )}
    </>
  );

  const rideBlock = (
    <View style={styles.headerBlock}>
      <Segmented
        value={rideMode}
        options={RIDE_MODES.map((m) => ({ id: m.id, label: m.label }))}
        onChange={setRideMode}
      />
      <AppText variant="caption" muted>
        {RIDE_MODES.find((m) => m.id === rideMode)!.hint}
      </AppText>
      {rideMode === 'gruppe' && <SecondaryButton label="Gruppenfahrt öffnen" onPress={() => router.push('/gruppe')} />}
    </View>
  );

  let body: ReactNode;
  if (view.kind === 'working') {
    body = (
      <>
        {rideBlock}
        <Progress phase={view.phase} done={view.done} onCancel={cancel} />
      </>
    );
  } else if (view.kind === 'error') {
    body = (
      <>
        {rideBlock}
        <ErrorCard
          error={view.error}
          mode={mode}
          onRetry={() => (view.req ? reroll(view.req) : mode === 'beschreiben' ? createFromWish() : createRoundTrip())}
          onBack={() => setView({ kind: 'form' })}
          onUsePlace={() => {
            setView({ kind: 'form' });
            setMode('rundtour');
          }}
        />
      </>
    );
  } else if (view.kind === 'result') {
    body = (
      <>
        {rideBlock}
        <Result
          tour={view.tour}
          req={view.req}
          stops={view.stops}
          group={rideMode === 'gruppe'}
          onReroll={() => reroll(view.req)}
          onBack={() => setView({ kind: 'form' })}
          adding={adding}
          onAddStop={(p) => void addStop(p)}
        />
      </>
    );
  } else {
    body = (
    <>
      {rideBlock}
      {mode !== 'tour' && (
        <Segmented
          value={mode}
          options={[
            { id: 'rundtour', label: 'Einstellen' },
            { id: 'beschreiben', label: 'Beschreiben' },
          ]}
          onChange={switchMode}
        />
      )}

      {mode === 'tour' ? (
        <TourMode
          plan={tourPlan}
          here={here}
          onHere={setHere}
          profile={profile}
          setProfile={setProfile}
          avoid={avoid}
          setAvoid={setAvoid}
          group={rideMode === 'gruppe'}
          pending={pending}
          setPending={setPending}
          onSearchFocus={expand}
        />
      ) : mode === 'beschreiben' ? (
        <>
          <View style={styles.inputCard}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Was willst du erleben?"
              placeholderTextColor={Colors.muted}
              multiline
              onFocus={expand}
              style={styles.freeText}
              accessibilityLabel="Tourwunsch"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Spracheingabe"
              onPress={() => setMicHint((v) => !v)}
              style={styles.mic}>
              <MicIcon />
            </Pressable>
          </View>
          {micHint && (
            <AppText variant="caption" muted>
              Spracheingabe folgt bald. Bis dahin einfach tippen, zum Beispiel: 2 Stunden kurvig in den Odenwald mit Kaffee.
            </AppText>
          )}

          <Section label="Dauer">
            <View style={styles.durRow}>
              {DURATIONS.map((d) => {
                const active = eff.minutes === d.minutes && !eff.km;
                return (
                  <Pressable
                    key={d.minutes}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={d.unit === 'Tag' ? (d.big === '½' ? 'Halber Tag' : 'Tag') : `${d.big} Stunden`}
                    onPress={() => setOver((o) => ({ ...o, minutes: active ? null : d.minutes }))}
                    style={[styles.durTile, active && styles.tileOn]}>
                    <AppText style={[styles.durBig, active && styles.onSignal]}>{d.big}</AppText>
                    <AppText variant="caption" style={active ? styles.onSignal : styles.mutedText}>
                      {d.unit === 'Tag' && d.big === '½' ? 'Halber Tag' : d.unit}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section label="Fahrstil">
            <View style={styles.wrap}>
              {STYLE_PROFILES.map((id) => (
                <Chip
                  key={id}
                  label={PROFILES.find((p) => p.id === id)!.label}
                  active={eff.profile === id}
                  onPress={() => setOver((o) => ({ ...o, profile: id }))}
                />
              ))}
            </View>
          </Section>

          <Section label="Richtung">
            <View style={styles.wrap}>
              {eff.towardName && <Chip label={eff.towardName} active onPress={() => setOver((o) => ({ ...o, direction: 'zufall' }))} />}
              <Chip
                label="Zufall"
                active={!eff.towardName && (eff.direction ?? 'zufall') === 'zufall'}
                onPress={() => setOver((o) => ({ ...o, direction: 'zufall' }))}
              />
              {DIRECTIONS.map((d) => (
                <Chip
                  key={d.id}
                  label={d.label}
                  active={!eff.towardName && eff.direction === d.id}
                  onPress={() => setOver((o) => ({ ...o, direction: d.id }))}
                />
              ))}
            </View>
          </Section>

          <Section label="Stopps">
            <View style={styles.wrap}>
              {STOPS.map((s) => {
                const active = eff.stops.includes(s.id);
                return (
                  <Chip
                    key={s.id}
                    label={s.label}
                    active={active}
                    onPress={() => setOver((o) => ({ ...o, stops: { ...o.stops, [s.id]: !active } }))}
                  />
                );
              })}
            </View>
          </Section>

          <VehiclePick />

          <View style={styles.understood}>
            <View style={styles.dot} />
            <View style={styles.flex}>
              <AppText variant="label" style={styles.goodText}>Verstanden</AppText>
              <AppText>{understoodSentence(eff)}</AppText>
            </View>
          </View>

          <View style={styles.gapS}>
            <PrimaryButton label="Tour erstellen" onPress={createFromWish} />
            <AppText variant="caption" muted>
              Stopps werden bald eingeplant, heute zeigen wir sie nur an.
            </AppText>
          </View>
        </>
      ) : (
        <>
          <Section label="Start">
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !picked }}
                onPress={() => {
                  setPicked(null);
                  if (!here && !locating) void findHere();
                }}
                style={styles.startRow}>
                <Radio on={!picked} />
                <View style={styles.flex}>
                  <AppText variant="title">Aktueller Standort</AppText>
                  <AppText variant="caption" muted>
                    {locating ? 'Standort wird bestimmt' : here ? here.name : locError ? locError.message : 'Wird beim Start bestimmt'}
                  </AppText>
                </View>
                {locating && <ActivityIndicator color={Colors.muted} />}
              </Pressable>
              {locError && !picked && (
                <View style={styles.wrap}>
                  {locError.kind === 'permission' || locError.kind === 'services' ? (
                    <Chip label="Einstellungen öffnen" active={false} onSurface onPress={() => void Linking.openSettings()} />
                  ) : null}
                  <Chip label="Nochmal versuchen" active={false} onSurface onPress={() => void findHere()} />
                </View>
              )}
              {picked && (
                <View style={styles.startRow}>
                  <Radio on />
                  <View style={styles.flex}>
                    <AppText variant="title">{picked.name}</AppText>
                    <AppText variant="caption" muted>Gewählter Ort</AppText>
                  </View>
                </View>
              )}
              {!showSearch && !hits ? (
                <Pressable accessibilityRole="button" onPress={() => setShowSearch(true)} style={styles.linkBtn}>
                  <AppText style={styles.linkText}>Anderen Startort wählen</AppText>
                </Pressable>
              ) : (
              <View style={styles.searchRow}>
                <TextInput
                  autoFocus={showSearch && !hits}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void runSearch()}
                  placeholder="Anderen Startort suchen"
                  placeholderTextColor={Colors.muted}
                  returnKeyType="search"
                  onFocus={expand}
                  style={styles.search}
                />
                <Pressable accessibilityRole="button" onPress={() => void runSearch()} style={styles.searchBtn}>
                  {searching ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.searchBtnText}>Suchen</AppText>}
                </Pressable>
              </View>
              )}
              {hits && (
                <View>
                  {hits.length === 0 && <AppText variant="caption" muted>Nichts gefunden. Versuch es mit dem Ortsnamen.</AppText>}
                  {hits.map((h, i) => (
                    <Pressable
                      key={`${h.p[0]},${h.p[1]},${i}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setPicked({ p: h.p, name: h.name });
                        setHits(null);
                        setQuery('');
                        setShowSearch(false);
                      }}
                      style={styles.hit}>
                      <AppText variant="title">{h.name}</AppText>
                      {!!h.detail && <AppText variant="caption" muted>{h.detail}</AppText>}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </Section>

          <Section label="Länge">
            <View style={styles.card}>
              <View style={styles.wrap}>
                <Chip label="Kilometer" active={lengthBy === 'km'} onSurface onPress={() => setLengthBy('km')} />
                <Chip label="Dauer" active={lengthBy === 'dauer'} onSurface onPress={() => setLengthBy('dauer')} />
              </View>
              <View style={styles.stepper}>
                <StepButton
                  kind="minus"
                  disabled={lengthBy === 'km' ? kmIdx === 0 : minIdx === 0}
                  onPress={() => (lengthBy === 'km' ? setKmIdx((i) => Math.max(0, i - 1)) : setMinIdx((i) => Math.max(0, i - 1)))}
                />
                <View style={styles.stepValue}>
                  <AppText style={styles.bigNumber}>
                    {lengthBy === 'km' ? KM_STEPS[kmIdx] : formatMinutes(MIN_STEPS[minIdx])}
                  </AppText>
                  <AppText variant="caption" muted>
                    {lengthBy === 'km' ? 'km' : `etwa ${roundKm} km`}
                  </AppText>
                </View>
                <StepButton
                  kind="plus"
                  disabled={lengthBy === 'km' ? kmIdx === KM_STEPS.length - 1 : minIdx === MIN_STEPS.length - 1}
                  onPress={() =>
                    lengthBy === 'km'
                      ? setKmIdx((i) => Math.min(KM_STEPS.length - 1, i + 1))
                      : setMinIdx((i) => Math.min(MIN_STEPS.length - 1, i + 1))
                  }
                />
              </View>
            </View>
          </Section>

          <Section label="Richtung">
            <DirectionDial value={direction} onChange={setDirection} />
          </Section>

          <Section label="Profil">
            <View style={styles.wrap}>
              {PROFILE_CHOICES.map((p) => (
                <Chip key={p.id} label={p.label} active={profile === p.id} onPress={() => setProfile(p.id)} />
              ))}
            </View>
          </Section>

          <Section label="Vermeiden">
            <View style={styles.card}>
              <Toggle
                label="Gesperrte Straßen"
                note="calimoto warnt nur, wir meiden."
                value={avoid.closures}
                onChange={(v) => setAvoid((a) => ({ ...a, closures: v }))}
              />
              <Toggle label="Fähren" value={avoid.ferries} onChange={(v) => setAvoid((a) => ({ ...a, ferries: v }))} />
              <Toggle label="Maut" value={avoid.tolls} onChange={(v) => setAvoid((a) => ({ ...a, tolls: v }))} />
              <Toggle
                label="Rauer Belag"
                note="Kopfsteinpflaster und schlechter Asphalt."
                value={avoid.rough}
                onChange={(v) => setAvoid((a) => ({ ...a, rough: v }))}
              />
            </View>
          </Section>

          <PrimaryButton label="Tour erstellen" onPress={createRoundTrip} />
        </>
      )}
    </>
    );
  }

  return (
    <MapSheet
      detent={detent}
      onDetentChange={setDetent}
      scrollRef={scroll}
      grabberLabel="Planer Höhe ändern"
      header={header}
      background={(covered) => (
        <RouteMap
          tour={mapTour}
          pins={pins}
          showUser
          focus={focus}
          onLongPress={inTour ? onMapLongPress : undefined}
          mapPadding={{ top: 0, right: 0, bottom: covered, left: 0 }}
          edgePadding={{ top: insets.top + Spacing.xxxl, right: Spacing.xxxl, bottom: Spacing.xl, left: Spacing.xxxl }}
          style={StyleSheet.absoluteFill}
        />
      )}>
      {body}
    </MapSheet>
  );
}

/** Leere Tour für die Karte, solange nichts geplant ist */
const EMPTY_TOUR: Tour = { name: '', laenge_km: 0, wegpunkte: [], linie: [], warnungen: [] };

type PendingPoint = { p: LatLon; name: string | null };

/* Tour von Hand */

const STEP_TEXT: Record<PlanStep, string> = {
  route: 'Route wird berechnet',
  check: 'Etappen Check läuft',
  fix: 'Gesperrte Stellen werden umfahren',
};

const keyOf = (p: LatLon) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
const samePts = (a: LatLon[], b: LatLon[]) => a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);

type PointKind = 'start' | 'via' | 'ziel';

type TourPlan = ReturnType<typeof useTourPlan>;

/**
 * Zustand und Aktionen der Route: feste Felder Start, Via Punkte, Ziel (wie im Web Planer).
 * Geplant wird, sobald Start und Ziel gesetzt sind.
 */
function useTourPlan(onPlanned?: () => void) {
  const [start, setStart] = useState<LatLon | null>(null);
  const [vias, setVias] = useState<LatLon[]>([]);
  const [ziel, setZiel] = useState<LatLon | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [name, setName] = useState('Neue Tour');
  const [planned, setPlanned] = useState<PlannedTour | null>(null);
  const [step, setStep] = useState<PlanStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudId, setCloudId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const complete = !!start && !!ziel;
  /** Alle gesetzten Punkte in Reihenfolge; vollständig, sobald Start und Ziel da sind. */
  const pts: LatLon[] = [...(start ? [start] : []), ...vias, ...(ziel ? [ziel] : [])];

  function rememberName(p: LatLon, known?: string) {
    const k = keyOf(p);
    if (known) {
      setNames((old) => ({ ...old, [k]: known }));
      return;
    }
    reverseName(p)
      .then((n) => n && setNames((old) => (old[k] ? old : { ...old, [k]: n })))
      .catch(() => undefined);
  }

  async function plan(points: LatLon[], profile: Profile, avoid: Avoid, tourName = name) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setSaveMsg(null);
    setStep('route');
    try {
      const t = await planChecked(tourName.trim() || 'Neue Tour', points, profile, avoid, (st) => !ctrl.signal.aborted && setStep(st), ctrl.signal);
      if (!ctrl.signal.aborted) {
        setPlanned(t);
        onPlanned?.();
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = toPlanError(e, ctrl.signal);
      setPlanned(null);
      setError(err.kind === 'network' ? err.message : 'Für diese Punkte hat der Routenplaner keine Strecke gefunden. Verschieb einen Punkt etwas oder nimm ein anderes Profil.');
    } finally {
      if (abort.current === ctrl) setStep(null);
    }
  }

  /** Felder übernehmen und, sobald Start und Ziel stehen, sofort neu planen. */
  function apply(s: LatLon | null, v: LatLon[], z: LatLon | null, profile: Profile, avoid: Avoid) {
    setStart(s);
    setVias(v);
    setZiel(z);
    if (s && z) {
      void plan([s, ...v, z], profile, avoid);
      return;
    }
    abort.current?.abort();
    setStep(null);
    setError(null);
    setPlanned(null);
  }

  /** Punkt in ein Feld setzen: Start, Ziel oder Via Punkt an Stelle index (am Ende: neu). */
  function setSlot(kind: PointKind, p: LatLon, profile: Profile, avoid: Avoid, known?: string, index?: number) {
    rememberName(p, known);
    if (kind === 'start') apply(p, vias, ziel, profile, avoid);
    else if (kind === 'ziel') apply(start, vias, p, profile, avoid);
    else {
      const v = [...vias];
      if (index != null && index < v.length) v[index] = p;
      else v.push(p);
      apply(start, v, ziel, profile, avoid);
    }
  }

  /** Von der Karte oder für Pässe: Via Punkt dort einfügen, wo er den kleinsten Umweg macht. */
  function add(kind: PointKind, p: LatLon, profile: Profile, avoid: Avoid, known?: string) {
    if (kind !== 'via' || !start || !ziel) {
      setSlot(kind === 'via' && !start ? 'start' : kind === 'via' && !ziel ? 'ziel' : kind, p, profile, avoid, known);
      return;
    }
    rememberName(p, known);
    const full = insertVia([start, ...vias, ziel], p);
    apply(start, full.slice(1, -1), ziel, profile, avoid);
  }

  async function save(curves: number, profile: Profile, avoid: Avoid) {
    if (!planned) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // auf dem Gerät speichern (Meine Touren), angemeldet auch ins Konto
      const saved = saveTour({ ...planned, name: name.trim() || planned.name, curves, profile }, '', cloudId ?? undefined);
      setCloudId(saved.id);
      void syncLibrary();
      setSaveMsg('Gespeichert, du findest die Tour unter Meine Touren.');
    } catch (e) {
      setSaveMsg(`Speichern hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    abort.current?.abort();
    setStart(null);
    setVias([]);
    setZiel(null);
    setPlanned(null);
    setStep(null);
    setError(null);
    setCloudId(null);
    setSaveMsg(null);
    setName('Neue Tour');
  }

  return {
    start, vias, ziel, complete, pts, names, name, setName, planned, step, error, cloudId, saving, saveMsg,
    setSlot, add, plan, save, reset,
    plan2: (profile: Profile, avoid: Avoid) => start && ziel && void plan([start, ...vias, ziel], profile, avoid),
    removeStart: (profile: Profile, avoid: Avoid) => apply(null, vias, ziel, profile, avoid),
    removeZiel: (profile: Profile, avoid: Avoid) => apply(start, vias, null, profile, avoid),
    removeVia: (i: number, profile: Profile, avoid: Avoid) => apply(start, vias.filter((_, k) => k !== i), ziel, profile, avoid),
    moveVia: (i: number, dir: -1 | 1, profile: Profile, avoid: Avoid) => apply(start, movePoint(vias, i, dir), ziel, profile, avoid),
    swap: (profile: Profile, avoid: Avoid) => apply(ziel, [...vias].reverse(), start, profile, avoid),
  };
}

function TourMode({
  plan, here, onHere, profile, setProfile, avoid, setAvoid, group, pending, setPending, onSearchFocus,
}: {
  plan: TourPlan;
  here: Spot | null;
  onHere: (s: Spot) => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
  avoid: Avoid;
  setAvoid: (a: Avoid) => void;
  group: boolean;
  /** Punkt aus dem langen Druck auf die große Karte, wartet auf die Rolle */
  pending: PendingPoint | null;
  setPending: (p: PendingPoint | null) => void;
  /** Suchfeld bekommt den Fokus: das Blatt geht auf volle Höhe */
  onSearchFocus: () => void;
}) {
  const session = useSession();
  const live = usePassLive();
  const { pts, planned } = plan;
  const busy = plan.step !== null;
  // Die geplante Route passt nur, solange die Punkte dieselben sind
  const fits = !!planned && samePts(planned.wegpunkte, pts);
  const routeTour = fits ? planned : null;

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [passQuery, setPassQuery] = useState('');
  const [planChanged, setPlanChanged] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const line = useMemo(() => (routeTour ? flatten(routeTour).map((x) => x.p) : []), [routeTour]);
  const { along, near } = useMemo(() => (line.length > 1 ? routePasses(PASSES, line) : { along: [], near: [] }), [line]);
  const curves = useMemo(() => (line.length > 1 ? countCurves(line) : 0), [line]);
  const parts = useMemo(() => (routeTour ? legs(routeTour) : []), [routeTour]);
  const hint = closedHint(along.map((x) => x.pass), live);

  const add = (kind: PointKind, p: LatLon, known?: string) => {
    setPlanChanged(false);
    plan.add(kind, p, profile, avoid, known);
  };

  /** Feld, das gerade bearbeitet wird; dort öffnet sich die Suche. Ohne Start beginnt es mit dem Start. */
  const [edit, setEdit] = useState<{ kind: PointKind; index?: number } | null>(() => (plan.start ? null : { kind: 'start' }));
  function openEdit(e: { kind: PointKind; index?: number }) {
    setEdit(e);
    setQuery('');
    setHits(null);
    setLocMsg(null);
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    const passHits: Place[] = searchPasses(PASSES, q, 3).map((x) => ({
      name: x.name,
      detail: `Pass, ${passSummary(x, undefined, passState(x, live).note)}, ${x.region}`,
      p: passPoint(x),
    }));
    try {
      const places = await searchPlaces(q, pts[pts.length - 1] ?? here?.p);
      setHits([...passHits, ...places.filter((x) => !passHits.some((y) => y.name === x.name)).slice(0, 7)]);
    } catch {
      setHits(passHits);
    } finally {
      setSearching(false);
    }
  }

  function pick(p: LatLon, name: string | undefined) {
    if (!edit) return;
    setPlanChanged(false);
    plan.setSlot(edit.kind, p, profile, avoid, name, edit.index);
    setHits(null);
    setQuery('');
    // Nach dem Start gleich das Ziel abfragen
    setEdit(edit.kind === 'start' && !plan.ziel ? { kind: 'ziel' } : null);
  }

  async function takeHere() {
    if (!edit) return;
    setLocMsg(null);
    setLocating(true);
    try {
      const spot = here ?? (await locate());
      if (!here) onHere(spot);
      pick(spot.p, spot.name ?? 'Mein Standort');
    } catch (e) {
      setLocMsg(toPlanError(e).message);
    } finally {
      setLocating(false);
    }
  }

  const editor = (
    <View style={styles.editor}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void runSearch()}
          placeholder={edit?.kind === 'start' ? 'Wo geht es los?' : edit?.kind === 'ziel' ? 'Wohin soll es gehen?' : 'Ort oder Pass für den Via Punkt'}
          placeholderTextColor={Colors.muted}
          returnKeyType="search"
          autoFocus
          onFocus={onSearchFocus}
          style={styles.search}
          accessibilityLabel="Ort oder Pass suchen"
        />
        <Pressable accessibilityRole="button" onPress={() => void runSearch()} style={styles.searchBtn}>
          {searching ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.searchBtnText}>Suchen</AppText>}
        </Pressable>
      </View>
      <View style={styles.wrap}>
        {edit?.kind !== 'via' && <SmallButton label={locating ? 'Standort wird bestimmt' : 'Mein Standort'} onPress={() => !locating && void takeHere()} />}
        <SmallButton label="Abbrechen" onPress={() => setEdit(null)} />
      </View>
      {locMsg && <AppText variant="caption" style={styles.signalText}>{locMsg}</AppText>}
      {hits && hits.length === 0 && <AppText variant="caption" muted>Nichts gefunden. Versuch es mit dem Ortsnamen.</AppText>}
      {hits?.map((h, i) => (
        <Pressable key={`${h.p[0]},${h.p[1]},${i}`} accessibilityRole="button" onPress={() => pick(h.p, h.name)} style={styles.hitRow}>
          <View style={styles.hitMain}>
            <AppText variant="title">{h.name}</AppText>
            {!!h.detail && <AppText variant="caption" muted>{h.detail}</AppText>}
          </View>
        </Pressable>
      ))}
    </View>
  );

  function addPending(kind: PointKind) {
    if (!pending) return;
    add(kind, pending.p, pending.name ?? undefined);
    setPending(null);
  }

  const searching2 = passQuery.trim().length >= 2;
  const passHits: { pass: Pass; dKm: number | null }[] = searching2
    ? searchPasses(PASSES, passQuery, 5).map((pass) => ({ pass, dKm: null }))
    : near;

  const k = routeTour?.km_je_klasse;
  const sauber = k?.ok ?? 0;
  const total = routeTour?.laenge_km ?? 0;
  const share = total > 0 ? Math.round((sauber / total) * 100) : 0;
  const warnings = routeTour ? routeTour.warnungen.filter((w) => w.klasse !== 'ok') : [];

  const drive = () => {
    if (!routeTour) return;
    setActiveTour({ ...routeTour, name: plan.name.trim() || routeTour.name }, profile, avoid);
    router.push('/navigation');
  };

  return (
    <>
      {pending && (
        <View style={[styles.card, styles.pendingCard]}>
          <View style={styles.flex}>
            <AppText variant="label">Neuer Punkt</AppText>
            <AppText variant="title">{pending.name ?? `${pending.p[0].toFixed(4)}, ${pending.p[1].toFixed(4)}`}</AppText>
          </View>
          <View style={styles.wrap}>
            <SmallButton label="Als Start" onPress={() => addPending('start')} />
            {plan.complete && <SmallButton label="Als Via Punkt" onPress={() => addPending('via')} />}
            <SmallButton label="Als Ziel" onPress={() => addPending('ziel')} strong />
            <SmallButton label="Abbrechen" onPress={() => setPending(null)} />
          </View>
        </View>
      )}

      <View style={styles.gapS}>
        <AppText variant="label">Name</AppText>
        <TextInput
          value={plan.name}
          onChangeText={plan.setName}
          placeholder="Name der Tour"
          placeholderTextColor={Colors.muted}
          style={styles.search}
          accessibilityLabel="Name der Tour"
        />
      </View>

      <Section label="Route">
        <View style={styles.card}>
          <SlotRow
            label="S"
            end
            role="Start"
            name={plan.start ? (plan.names[keyOf(plan.start)] ?? `${plan.start[0].toFixed(4)}, ${plan.start[1].toFixed(4)}`) : null}
            placeholder="Start eingeben"
            sub={plan.complete && parts[0] ? `${formatKm(parts[0].endKm - parts[0].startKm)} km bis zum nächsten Punkt` : undefined}
            editing={edit?.kind === 'start'}
            onEdit={() => openEdit({ kind: 'start' })}
            onRemove={plan.start ? () => plan.removeStart(profile, avoid) : undefined}
          />
          {edit?.kind === 'start' && editor}
          {plan.vias.map((v, i) => {
            const leg = plan.complete ? parts[i + 1] : undefined;
            return (
              <View key={`${keyOf(v)},${i}`}>
                <SlotRow
                  label={String(i + 1)}
                  role={`Via Punkt ${i + 1}`}
                  name={plan.names[keyOf(v)] ?? `${v[0].toFixed(4)}, ${v[1].toFixed(4)}`}
                  placeholder=""
                  sub={leg ? `${formatKm(leg.endKm - leg.startKm)} km bis zum nächsten Punkt` : undefined}
                  editing={edit?.kind === 'via' && edit.index === i}
                  onEdit={() => openEdit({ kind: 'via', index: i })}
                  onUp={i > 0 ? () => plan.moveVia(i, -1, profile, avoid) : undefined}
                  onDown={i < plan.vias.length - 1 ? () => plan.moveVia(i, 1, profile, avoid) : undefined}
                  onRemove={() => plan.removeVia(i, profile, avoid)}
                />
                {edit?.kind === 'via' && edit.index === i && editor}
              </View>
            );
          })}
          {edit?.kind === 'via' && edit.index === plan.vias.length && (
            <>
              <SlotRow label={String(plan.vias.length + 1)} role="Neuer Via Punkt" name={null} placeholder="Via Punkt eingeben" editing onEdit={() => undefined} />
              {editor}
            </>
          )}
          <SlotRow
            label="Z"
            end
            role="Ziel"
            name={plan.ziel ? (plan.names[keyOf(plan.ziel)] ?? `${plan.ziel[0].toFixed(4)}, ${plan.ziel[1].toFixed(4)}`) : null}
            placeholder="Ziel eingeben"
            editing={edit?.kind === 'ziel'}
            onEdit={() => openEdit({ kind: 'ziel' })}
            onRemove={plan.ziel ? () => plan.removeZiel(profile, avoid) : undefined}
          />
          {edit?.kind === 'ziel' && editor}
          <View style={styles.wrap}>
            {!!plan.start && !(edit?.kind === 'via' && edit.index === plan.vias.length) && (
              <SmallButton label="Via Punkt hinzufügen" onPress={() => openEdit({ kind: 'via', index: plan.vias.length })} />
            )}
            {plan.complete && <SmallButton label="Start und Ziel tauschen" onPress={() => plan.swap(profile, avoid)} />}
          </View>
        </View>
      </Section>

      {plan.step && (
        <View style={[styles.card, styles.statusRow]}>
          <ActivityIndicator color={Colors.signal} />
          <AppText style={styles.flex}>{STEP_TEXT[plan.step]}</AppText>
        </View>
      )}
      {plan.error && (
        <View style={[styles.card, styles.errorCard]}>
          <AppText variant="label" style={styles.signalText}>Das hat nicht geklappt</AppText>
          <AppText>{plan.error}</AppText>
          {pts.length >= 2 && <SecondaryButton label="Nochmal versuchen" onSurface onPress={() => void plan.plan(pts, profile, avoid)} />}
        </View>
      )}

      {routeTour && (
        <>
          <View style={styles.legend}>
            {(['ok', 'pruefen', 'raus'] as CheckClass[]).map((c) => (
              <View key={c} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: CLASS_COLORS[c] }]} />
                <AppText variant="caption" muted>{CLASS_LABEL[c]}</AppText>
              </View>
            ))}
          </View>

          <View style={styles.stats}>
            <View style={styles.flex}>
              <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit>{formatKm(total, 0)}</AppText>
              <AppText variant="caption" muted>km</AppText>
            </View>
            <View style={styles.flex}>
              <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit>{bigDuration(routeTour.minutes)}</AppText>
              <AppText variant="caption" muted>Fahrzeit</AppText>
            </View>
            <View style={styles.flex}>
              <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit>{curves}</AppText>
              <AppText variant="caption" muted>
                Kurven{total > 0 ? `, ${Math.round((curves / total) * 100)} je 100 km` : ''}
              </AppText>
            </View>
          </View>

          <View style={[styles.card, styles.checkCard]}>
            <View style={[styles.dot, (k?.raus ?? 0) > 0 ? styles.dotStop : warnings.length ? styles.dotWarn : null]} />
            <View style={styles.flex}>
              <AppText variant="title">
                {(k?.raus ?? 0) > 0 ? `Etappen Check: ${formatKm(k!.raus)} km ungeeignet` : `Etappen Check: ${formatKm(sauber)} km sauber`}
              </AppText>
              <AppText variant="caption" muted>
                {share} % der Strecke ohne Auffälligkeiten
                {routeTour.fixes > 0 ? `, ${routeTour.fixes} mal um gesperrte Stellen umgeplant` : ''}.
              </AppText>
            </View>
          </View>

          {warnings.length > 0 && (
            <Section label={`Warnungen (${warnings.length})`}>
              <View style={styles.card}>
                {warnings.map((w, i) => (
                  <View key={i} style={[styles.warnRow, i > 0 && styles.rowSpaced]}>
                    <View style={[styles.badge, { borderColor: CLASS_COLORS[w.klasse] }]}>
                      <AppText style={[styles.badgeText, { color: CLASS_COLORS[w.klasse] }]}>{CLASS_LABEL[w.klasse]}</AppText>
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="title">{w.name || 'Unbenannter Abschnitt'}</AppText>
                      <AppText variant="caption" muted>
                        bei km {formatKm(w.start_km)}, {formatKm(w.laenge_km)} km lang
                      </AppText>
                      {w.gruende.length > 0 && <AppText variant="caption">{w.gruende.join(', ')}</AppText>}
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {hint && (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PASS_STATUS_URL)} style={styles.winter}>
              <AppText style={styles.winterTitle}>{hint.title}</AppText>
              <AppText variant="caption" style={styles.winterText}>
                {hint.text} Tippen für den aktuellen Passstatus.
              </AppText>
            </Pressable>
          )}

          {along.length > 0 && (
            <Section label={`Pässe auf der Strecke (${along.length})`}>
              <View style={styles.card}>
                {along.map(({ pass, km }, i) => (
                  <View key={pass.id} style={[styles.warnRow, i > 0 && styles.rowSpaced]}>
                    <View style={styles.flex}>
                      <AppText variant="title">{pass.name}</AppText>
                      <AppText variant="caption" muted>{passSummary(pass, undefined, passState(pass, live).note)}</AppText>
                    </View>
                    <AppText variant="caption" muted>km {Math.round(km)}</AppText>
                  </View>
                ))}
              </View>
            </Section>
          )}
        </>
      )}

      {pts.length >= 2 && (
        <Section label={!searching2 && near.length ? 'Pässe einbauen, in der Nähe' : 'Pässe einbauen'}>
          <View style={styles.card}>
            <TextInput
              value={passQuery}
              onChangeText={setPassQuery}
              placeholder="Pass suchen, zum Beispiel Stelvio"
              placeholderTextColor={Colors.muted}
              onFocus={onSearchFocus}
              style={styles.search}
              accessibilityLabel="Pass suchen"
            />
            {passHits.length ? (
              passHits.map(({ pass, dKm }, i) => (
                <View key={pass.id} style={[styles.passRow, i > 0 && styles.rowSpaced]}>
                  <View style={[styles.passDot, pass.tier === 'ikone' && styles.passDotIcon]} />
                  <View style={styles.flex}>
                    <AppText variant="title">{pass.name}</AppText>
                    <AppText variant="caption" muted>
                      {[passSummary(pass, undefined, passState(pass, live).note), dKm != null ? `${formatKm(dKm, dKm < 10 ? 1 : 0)} km neben der Route` : null]
                        .filter(Boolean)
                        .join(', ')}
                    </AppText>
                  </View>
                  <SmallButton
                    label="Einbauen"
                    onPress={() => {
                      add('via', passPoint(pass), pass.name);
                      setPassQuery('');
                    }}
                  />
                </View>
              ))
            ) : (
              <AppText variant="caption" muted>
                {searching2 ? 'Kein Pass gefunden.' : routeTour ? 'Keine bekannten Pässe in der Nähe der Route.' : 'Vorschläge erscheinen, sobald die Route steht.'}
              </AppText>
            )}
          </View>
        </Section>
      )}

      {routeTour && <StopsSection line={line} busy={busy} onAdd={(p) => add('via', p)} />}

      <Section label="Profil">
        <View style={styles.wrap}>
          {PROFILE_CHOICES.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              active={profile === p.id}
              onPress={() => {
                setProfile(p.id);
                if (pts.length >= 2) setPlanChanged(true);
              }}
            />
          ))}
        </View>
      </Section>

      <Section label="Vermeiden">
        <View style={styles.card}>
          {(
            [
              ['closures', 'Gesperrte Straßen', 'calimoto warnt nur, wir meiden.'],
              ['ferries', 'Fähren', undefined],
              ['tolls', 'Maut', undefined],
              ['rough', 'Rauer Belag', 'Kopfsteinpflaster und schlechter Asphalt.'],
            ] as const
          ).map(([key, label, note]) => (
            <Toggle
              key={key}
              label={label}
              note={note}
              value={avoid[key]}
              onChange={(v) => {
                setAvoid({ ...avoid, [key]: v });
                if (pts.length >= 2) setPlanChanged(true);
              }}
            />
          ))}
        </View>
      </Section>

      {pts.length >= 2 && (planChanged || !routeTour) && !busy && (
        <PrimaryButton
          label={planChanged ? 'Mit neuen Einstellungen planen' : 'Route planen'}
          onPress={() => {
            setPlanChanged(false);
            void plan.plan(pts, profile, avoid);
          }}
        />
      )}

      {routeTour && (
        <View style={styles.gapM}>
          <Pressable accessibilityRole="button" onPress={drive} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
            <AppText style={styles.goText}>Losfahren</AppText>
          </Pressable>
          <SecondaryButton
            label={plan.saving ? 'Wird gespeichert' : plan.cloudId ? 'Änderungen speichern' : 'Speichern'}
            onPress={() => !plan.saving && void plan.save(curves, profile, avoid)}
          />
          {plan.saveMsg && <AppText variant="caption" muted>{plan.saveMsg}</AppText>}
          {!session && !plan.saveMsg && <AppText variant="caption" muted>Wird auf dem Gerät gespeichert. Angemeldet landet die Tour auch im Web Planer.</AppText>}
          <ExportRow tour={routeTour} />
        </View>
      )}

      {routeTour && <ElevationChart line={line} />}

      {group && routeTour && <GroupBlock />}

      {pts.length > 0 && <SecondaryButton label="Neue Tour beginnen" onPress={plan.reset} />}
    </>
  );
}

/** Fahrzeug für diese Tour (optional): die gefahrenen km landen bei diesem Auto. */
function VehiclePick() {
  const { list, current } = useVehicles();
  return (
    <View style={styles.card}>
      <AppText variant="label">Fahrzeug</AppText>
      {list.length === 0 ? (
        <>
          <AppText variant="caption" muted>
            Noch kein Fahrzeug in der Garage. Leg es unter Einstellungen an, dann landen Kilometer und Touren beim richtigen Auto.
          </AppText>
          <SecondaryButton label="Zur Garage" onSurface onPress={() => router.navigate('/einstellungen')} />
        </>
      ) : (
        <View style={styles.wrap}>
          {list.map((v) => (
            <Chip key={v.id} label={v.model.trim() || 'Fahrzeug'} active={current?.id === v.id} onSurface onPress={() => void selectVehicle(v.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

function SmallButton({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.small, strong && styles.smallStrong, pressed && styles.pressed]}>
      <AppText style={[styles.smallText, strong && styles.onSignal]}>{label}</AppText>
    </Pressable>
  );
}

/** Ein Feld der Route: Start, Via Punkt oder Ziel. Tippen öffnet die Suche für genau dieses Feld. */
function SlotRow({
  label, role, name, placeholder, sub, end, editing, onEdit, onUp, onDown, onRemove,
}: {
  label: string;
  role: string;
  name: string | null;
  placeholder: string;
  sub?: string;
  end?: boolean;
  editing: boolean;
  onEdit: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.wpRow}>
      <View style={[styles.wpDot, end && styles.wpDotEnd]}>
        <AppText style={[styles.wpDotText, end && styles.onSignal]}>{label}</AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${role} ${name ? `ändern, jetzt ${name}` : 'eingeben'}`} onPress={onEdit} style={[styles.flex, styles.slotMain, editing && styles.slotEditing]}>
        <AppText variant="title" numberOfLines={1} style={!name && styles.slotPlaceholder}>
          {name ?? placeholder}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {sub ? `${role}, ${sub}` : role}
        </AppText>
      </Pressable>
      {onUp !== undefined || onDown !== undefined ? (
        <>
          <IconButton kind="up" label={`${role} nach oben`} disabled={!onUp} onPress={() => onUp?.()} />
          <IconButton kind="down" label={`${role} nach unten`} disabled={!onDown} onPress={() => onDown?.()} />
        </>
      ) : null}
      {onRemove && <IconButton kind="remove" label={`${role} entfernen`} onPress={onRemove} />}
    </View>
  );
}

function IconButton({ kind, label, disabled, onPress }: { kind: 'up' | 'down' | 'remove'; label: string; disabled?: boolean; onPress: () => void }) {
  const d = kind === 'up' ? 'M6 15l6 -6l6 6' : kind === 'down' ? 'M6 9l6 6l6 -6' : 'M7 7l10 10M17 7l-10 10';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={2}
      onPress={onPress}
      style={[styles.iconBtn, disabled && styles.disabled]}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d={d} />
      </Svg>
    </Pressable>
  );
}

/* Bausteine */

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.gapM}>
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.id)}
            style={[styles.segItem, active && styles.segOn]}>
            <AppText style={[styles.segText, active && styles.segTextOn]}>{o.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
      <AppText style={styles.primaryText}>{label}</AppText>
    </Pressable>
  );
}

/** onSurface: liegt in einer Surface Karte, dann mit hellerer Füllung. */
function SecondaryButton({ label, onPress, onSurface }: { label: string; onPress: () => void; onSurface?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, onSurface && styles.secondaryOnSurface, pressed && styles.pressed]}>
      <AppText style={styles.secondaryText}>{label}</AppText>
    </Pressable>
  );
}

function StepButton({ kind, disabled, onPress }: { kind: 'plus' | 'minus'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kind === 'plus' ? 'Länger' : 'Kürzer'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepBtn, disabled && styles.disabled]}>
      <View style={styles.barH} />
      {kind === 'plus' && <View style={styles.barV} />}
    </Pressable>
  );
}

function Radio({ on }: { on: boolean }) {
  return <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>;
}

function Toggle({ label, note, value, onChange }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <AppText variant="title">{label}</AppText>
        {note && <AppText variant="caption" muted>{note}</AppText>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.line, true: Colors.signal }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.line}
        accessibilityLabel={`${label} meiden`}
      />
    </View>
  );
}

function MicIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1 -6 0V6a3 3 0 0 1 3 -3z" />
      <Path d="M19 11a7 7 0 0 1 -14 0" />
      <Path d="M12 18v3" />
    </Svg>
  );
}

function Progress({ phase, done, onCancel }: { phase: PlanPhase; done: PlanPhase[]; onCancel: () => void }) {
  return (
    <View style={styles.gapL}>
      <View style={styles.card}>
        {PHASES.map((p) => {
          const isDone = done.includes(p.id);
          const isNow = p.id === phase;
          // Umfahren taucht nur auf, wenn der Check gesperrte Stellen gefunden hat
          if (p.id === 'fix' && !isNow && !isDone) return null;
          return (
            <View key={p.id} style={styles.phaseRow}>
              <View style={styles.phaseIcon}>
                {isNow ? <ActivityIndicator color={Colors.signal} /> : <View style={[styles.phaseDot, isDone && styles.phaseDotDone]} />}
              </View>
              <AppText style={isNow ? undefined : isDone ? styles.mutedText : styles.dimText}>{p.label}</AppText>
            </View>
          );
        })}
      </View>
      <AppText variant="caption" muted>
        Wir prüfen jede Straße auf Sperrungen, Feldwege und rauen Belag. Das dauert meist unter einer Minute.
      </AppText>
      <SecondaryButton label="Abbrechen" onPress={onCancel} />
    </View>
  );
}

function ErrorCard({
  error, mode, onRetry, onBack, onUsePlace,
}: {
  error: PlanError; mode: Mode; onRetry: () => void; onBack: () => void; onUsePlace: () => void;
}) {
  const help: Record<PlanError['kind'], string> = {
    permission: mode === 'beschreiben'
      ? 'Gib den Standort in den Einstellungen frei oder schreib den Start dazu, zum Beispiel "ab Bensheim".'
      : 'Gib den Standort in den Einstellungen frei oder such dir unter Start einen Ort aus.',
    services: 'Schalte die Ortung in den Einstellungen ein oder wähle einen Startort von Hand.',
    position: 'Geh kurz ins Freie und versuch es nochmal, oder wähle einen Startort von Hand.',
    notfound: 'Prüf die Schreibweise oder nimm einen größeren Ort in der Nähe.',
    network: 'Prüf deine Internetverbindung. Der Dienst ist manchmal kurz überlastet, ein zweiter Versuch hilft oft.',
    routing: 'Probier eine andere Länge, Richtung oder würfle neu.',
    aborted: '',
  };
  const needsPlace = error.kind === 'permission' || error.kind === 'services' || error.kind === 'position';
  return (
    <View style={styles.gapL}>
      <View style={[styles.card, styles.errorCard]}>
        <AppText variant="label" style={styles.signalText}>Das hat nicht geklappt</AppText>
        <AppText variant="title">{error.message}</AppText>
        <AppText variant="caption" muted>{help[error.kind]}</AppText>
      </View>
      {(error.kind === 'permission' || error.kind === 'services') && (
        <PrimaryButton label="Einstellungen öffnen" onPress={() => void Linking.openSettings()} />
      )}
      {(error.kind === 'network' || error.kind === 'routing' || error.kind === 'position') && (
        <PrimaryButton label={error.kind === 'routing' ? 'Neu würfeln' : 'Nochmal versuchen'} onPress={onRetry} />
      )}
      {needsPlace && <SecondaryButton label="Startort von Hand wählen" onPress={onUsePlace} />}
      <SecondaryButton label="Zurück zum Formular" onPress={onBack} />
    </View>
  );
}

/** Stopps an der Strecke (OpenStreetMap): Super Plus, Aussicht mit Parkplatz, Mittag, Kaffee, mit Einplanen. */
function StopsSection({ line, initial, busy, onAdd }: { line: LatLon[]; initial?: StopKind | null; busy: boolean; onAdd: (p: LatLon) => void }) {
  const [kind, setKind] = useState<StopKind | null>(initial ?? null);
  const [res, setRes] = useState<{ key: string; hits: StopHit[] | null; error: string | null } | null>(null);
  const key = `${kind}|${line.length}|${line[0]?.join()}|${line[line.length - 1]?.join()}`;
  useEffect(() => {
    if (!kind || line.length < 2) return;
    const ctrl = new AbortController();
    stopsAlong(kind, line, ctrl.signal)
      .then((hits) => setRes({ key, hits, error: null }))
      .catch((e: Error) => !ctrl.signal.aborted && setRes({ key, hits: null, error: e.message }));
    return () => ctrl.abort();
  }, [kind, line, key]);
  const cur = res?.key === key ? res : null;
  return (
    <Section label="Stopps an der Strecke">
      <View style={styles.card}>
        <View style={styles.wrap}>
          {STOP_KINDS.map((k) => (
            <Chip key={k.id} label={k.label} active={kind === k.id} onSurface onPress={() => setKind(kind === k.id ? null : k.id)} />
          ))}
        </View>
        {kind && <AppText variant="caption" muted>{STOP_KINDS.find((k) => k.id === kind)?.hint}</AppText>}
        {kind && !cur && <ActivityIndicator color={Colors.muted} />}
        {cur?.error && <AppText variant="caption" muted>Gerade nicht erreichbar. Versuch es gleich noch mal.</AppText>}
        {cur?.hits && cur.hits.length === 0 && <AppText variant="caption" muted>Nichts direkt an der Strecke gefunden.</AppText>}
        {cur?.hits?.map((h) => (
          <View key={h.id} style={styles.stopRow}>
            <AppText variant="caption" muted style={styles.stopKm}>km {Math.round(h.km)}</AppText>
            <View style={styles.flex}>
              <AppText variant="title" numberOfLines={1}>{h.name}</AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {[h.detail, h.offM > 150 ? `${formatKm(h.offM / 1000, 1)} km neben der Route` : 'direkt an der Route'].filter(Boolean).join(', ')}
              </AppText>
            </View>
            <SmallButton label={busy ? 'Plant' : 'Einplanen'} onPress={() => !busy && onAdd(h.p)} />
          </View>
        ))}
      </View>
    </Section>
  );
}

function Result({
  tour, req, stops, group, onReroll, onBack, onAddStop, adding,
}: {
  tour: PlannedTour; req: TourRequest; stops: Stop[]; group: boolean; onReroll: () => void; onBack: () => void;
  onAddStop: (p: LatLon) => void; adding: boolean;
}) {
  const sauber = tour.km_je_klasse?.ok ?? 0;
  const total = tour.laenge_km;
  const share = total > 0 ? Math.round((sauber / total) * 100) : 0;
  const warnings = tour.warnungen.filter((w) => w.klasse !== 'ok');
  const line = useMemo(() => flatten(tour).map((x) => x.p), [tour]);
  const passes = passesAlong(PASSES, line);
  const curves = countCurves(line);
  const live = usePassLive();
  const hint = closedHint(passes.map((x) => x.pass), live);
  // fertige Runde unter Meine Touren speichern (bei neuer Runde wieder frei)
  const [saved, setSaved] = useState<{ tour: PlannedTour; id: string } | null>(null);
  const savedId = saved?.tour === tour ? saved.id : null;
  const saveResult = () => {
    const t = saveTour({ ...tour, curves, profile: req.profile }, '', savedId ?? undefined);
    setSaved({ tour, id: t.id });
    void syncLibrary();
  };
  const drive = () => {
    setActiveTour(tour, req.profile, req.avoid);
    router.push('/navigation');
  };
  return (
    <View style={styles.gapL}>
      <View style={styles.gapS}>
        <AppText variant="caption" muted>
          {PROFILE_WORD[req.profile]}, {req.towardName ? `Richtung ${req.towardName}` : dirPhrase(req.direction)}
        </AppText>
      </View>
      <View style={styles.legend}>
        {(['ok', 'pruefen', 'raus'] as CheckClass[]).map((c) => (
          <View key={c} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: CLASS_COLORS[c] }]} />
            <AppText variant="caption" muted>{CLASS_LABEL[c]}</AppText>
          </View>
        ))}
      </View>

      {hint && (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PASS_STATUS_URL)} style={styles.winter}>
          <AppText style={styles.winterTitle}>{hint.title}</AppText>
          <AppText variant="caption" style={styles.winterText}>
            {hint.text} Tippen für den aktuellen Passstatus.
          </AppText>
        </Pressable>
      )}

      <Pressable accessibilityRole="button" onPress={drive} style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
        <AppText style={styles.goText}>Losfahren</AppText>
      </Pressable>

      <View style={styles.stats}>
        <View style={styles.flex}>
          <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit>{formatKm(total, 0)}</AppText>
          <AppText variant="caption" muted>km</AppText>
        </View>
        <View style={styles.flex}>
          <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit>{bigDuration(tour.minutes)}</AppText>
          <AppText variant="caption" muted>Fahrzeit</AppText>
        </View>
        <View style={styles.flex}>
          <AppText style={styles.statBig} numberOfLines={1} adjustsFontSizeToFit>{curves}</AppText>
          <AppText variant="caption" muted>
            Kurven{total > 0 ? `, ${Math.round((curves / total) * 100)} je 100 km` : ''}
          </AppText>
        </View>
      </View>

      <ElevationChart line={line} />

      <View style={[styles.card, styles.checkCard]}>
        <View style={[styles.dot, warnings.length ? styles.dotWarn : null]} />
        <View style={styles.flex}>
          <AppText variant="title">geprüft: {formatKm(sauber)} km sauber</AppText>
          <AppText variant="caption" muted>
            {share} % der Strecke ohne Auffälligkeiten
            {tour.fixes > 0 ? `, ${tour.fixes} mal um gesperrte Stellen umgeplant` : ''}.
          </AppText>
        </View>
      </View>

      {passes.length > 0 && (
        <Section label={`Pässe auf der Strecke (${passes.length})`}>
          <View style={styles.card}>
            {passes.map(({ pass, km }, i) => (
              <View key={pass.id} style={[styles.warnRow, i > 0 && styles.rowSpaced]}>
                <View style={styles.flex}>
                  <AppText variant="title">{pass.name}</AppText>
                  <AppText variant="caption" muted>
                    {passSummary(pass, undefined, passState(pass, live).note)}
                  </AppText>
                </View>
                <AppText variant="caption" muted>
                  km {Math.round(km)}
                </AppText>
              </View>
            ))}
          </View>
        </Section>
      )}

      {warnings.length > 0 && (
        <Section label={`Warnungen (${warnings.length})`}>
          <View style={styles.card}>
            {warnings.map((w, i) => (
              <View key={i} style={[styles.warnRow, i > 0 && styles.rowSpaced]}>
                <View style={[styles.badge, { borderColor: CLASS_COLORS[w.klasse] }]}>
                  <AppText style={[styles.badgeText, { color: CLASS_COLORS[w.klasse] }]}>{CLASS_LABEL[w.klasse]}</AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="title">{w.name || 'Unbenannter Abschnitt'}</AppText>
                  <AppText variant="caption" muted>
                    bei km {formatKm(w.start_km)}, {formatKm(w.laenge_km)} km lang
                  </AppText>
                  {w.gruende.length > 0 && <AppText variant="caption">{w.gruende.join(', ')}</AppText>}
                </View>
              </View>
            ))}
          </View>
        </Section>
      )}

      <StopsSection line={line} initial={(stops.find((x) => x !== 'foto') as StopKind | undefined) ?? null} busy={adding} onAdd={onAddStop} />

      {group && <GroupBlock />}

      <View style={styles.gapS}>
        <SecondaryButton label={savedId ? 'Gespeichert unter Meine Touren' : 'Speichern'} onPress={saveResult} />
        <ExportRow tour={tour} />
        <PrimaryButton label="Neu würfeln" onPress={onReroll} />
        <SecondaryButton label="Zurück zum Formular" onPress={onBack} />
      </View>
    </View>
  );
}

function GroupBlock() {
  const [hint, setHint] = useState(false);
  return (
    <View style={styles.card}>
      <AppText variant="label">Gruppe</AppText>
      <AppText>Fahrt diese Runde zusammen.</AppText>
      <SecondaryButton label="Mitfahrer einladen" onSurface onPress={() => setHint(true)} />
      {hint && <AppText variant="caption" muted>Einladen per Link folgt bald.</AppText>}
      <SecondaryButton label="Gruppenfahrt öffnen" onSurface onPress={() => router.push('/gruppe')} />
      <AppText variant="caption" muted>
        Dort startest du die Fahrt, teilst die Tour und siehst die Positionen der anderen.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  winter: { gap: 4, padding: Spacing.l, borderRadius: Radius.l, backgroundColor: 'rgba(232,176,58,0.12)' },
  winterTitle: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.warn },
  winterText: { color: Colors.warn },
  flex: { flex: 1, gap: 2 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  gapL: { gap: Spacing.l },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  headerBlock: { gap: Spacing.m },
  mutedText: { color: Colors.muted },
  dimText: { color: Colors.line },
  goodText: { color: Colors.good },
  signalText: { color: Colors.signal },
  onSignal: { color: Colors.onSignal },

  segment: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.pill, padding: 4 },
  segItem: { flex: 1, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.surface2 },
  segText: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.muted },
  segTextOn: { fontFamily: Fonts.semibold, color: Colors.text },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  inputCard: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, flexDirection: 'row', gap: Spacing.m },
  freeText: { flex: 1, minHeight: 96, color: Colors.text, fontFamily: Fonts.regular, fontSize: 17, textAlignVertical: 'top', padding: 0 },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },

  durRow: { flexDirection: 'row', gap: Spacing.s },
  durTile: { flex: 1, minHeight: 72, borderRadius: Radius.m, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tileOn: { backgroundColor: Colors.signal },
  durBig: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32 },

  understood: { flexDirection: 'row', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.good, marginTop: 5 },
  dotWarn: { backgroundColor: WARN },

  primary: { height: 56, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.onSignal },
  secondary: { height: 50, borderRadius: Radius.m, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryOnSurface: { backgroundColor: Colors.surface2 },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.35 },

  startRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.signal },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.signal },
  searchRow: { flexDirection: 'row', gap: Spacing.s },
  search: { flex: 1, height: 44, borderRadius: Radius.s, backgroundColor: Colors.surface2, color: Colors.text, paddingHorizontal: Spacing.m, fontFamily: Fonts.regular, fontSize: 15 },
  searchBtn: { height: 44, paddingHorizontal: Spacing.l, borderRadius: Radius.s, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontFamily: Fonts.semibold, fontSize: 15 },
  hit: { paddingVertical: Spacing.m },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  barH: { position: 'absolute', width: 18, height: 2, borderRadius: 1, backgroundColor: Colors.text },
  barV: { position: 'absolute', width: 2, height: 18, borderRadius: 1, backgroundColor: Colors.text },
  stepValue: { alignItems: 'center' },
  bigNumber: { fontFamily: Fonts.display, fontSize: 48, lineHeight: 52, fontVariant: ['tabular-nums'] },


  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },

  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 32 },
  phaseIcon: { width: 24, alignItems: 'center' },
  phaseDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.line },
  phaseDotDone: { backgroundColor: Colors.good, borderColor: Colors.good },

  errorCard: { backgroundColor: Colors.signalTint },

  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 48 },
  summaryHint: { minHeight: 36 },
  go: { height: 60, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: Fonts.display, fontSize: 20, color: Colors.onSignal, textTransform: 'uppercase', letterSpacing: 1 },

  legend: { flexDirection: 'row', gap: Spacing.l },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  legendSwatch: { width: 14, height: 4, borderRadius: 2 },

  stats: { flexDirection: 'row', gap: Spacing.l },
  linkBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.signal },
  statBig: { fontFamily: Fonts.display, fontSize: 44, lineHeight: 48, fontVariant: ['tabular-nums'] },
  checkCard: { flexDirection: 'row', alignItems: 'flex-start' },

  warnRow: { flexDirection: 'row', gap: Spacing.m, paddingTop: Spacing.s },
  rowSpaced: { paddingTop: Spacing.m },
  badge: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, height: 24, justifyContent: 'center', alignSelf: 'flex-start' },
  badgeText: { fontFamily: Fonts.semibold, fontSize: 12 },

  dotStop: { backgroundColor: Colors.signal },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  pendingCard: { backgroundColor: Colors.signalTint },
  editor: { gap: Spacing.s, paddingBottom: Spacing.s },
  slotMain: { justifyContent: 'center', minHeight: 48, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.s, borderRadius: Radius.s },
  slotEditing: { backgroundColor: Colors.surface2 },
  slotPlaceholder: { color: Colors.muted },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingVertical: Spacing.s },
  stopKm: { width: 52, fontVariant: ['tabular-nums'] },
  wpRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 52 },
  wpDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: Colors.line, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  wpDotEnd: { backgroundColor: Colors.signal, borderColor: Colors.signal },
  wpDotText: { fontFamily: Fonts.bold, fontSize: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 44, paddingHorizontal: Spacing.l, borderRadius: Radius.s, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  smallStrong: { backgroundColor: Colors.signal },
  smallText: { fontFamily: Fonts.semibold, fontSize: 14 },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingVertical: Spacing.m },
  hitMain: { flex: 1, minHeight: 44, justifyContent: 'center' },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingTop: Spacing.s },
  passDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.muted },
  passDotIcon: { backgroundColor: Colors.signal },
});
