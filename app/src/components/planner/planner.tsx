/**
 * Planer für das Handy mit zwei Modi: Schnelle Runde (Rundtour aus Länge, Richtung und Profil) und
 * Route (Start, Zwischenziele, Ziel, jede Etappe mit eigenem Profil). Danach prüfen und als Ergebnis zeigen.
 *
 * Der Planer ist auf mehrere Dateien in diesem Ordner verteilt:
 * - planner.tsx (diese Datei): Zustand des Planers, Karte mit Blatt, Kopf, Wechsel zwischen Formular und Ergebnis
 * - use-tour-plan.ts: Zustand und Aktionen der Route (Punkte setzen, verschieben, planen)
 * - tour-mode.tsx: Oberfläche der Route (Punktliste mit Suchfeld, Etappen, Pass Vorschläge, Ergebnis)
 * - planner-result.tsx: Ergebnis einer Rundtour mit Kennzahlen, Highlights, Höhenprofil und Aktionsleiste
 * - planner-parts.tsx: kleine Bausteine (Section, Toggle, Pill, Stats, Warnings, DragHandle)
 * - planner-shared.ts: gemeinsame Typen und Helfer, planner-styles.ts: alle Styles
 * Aufbau wie Apple Maps: Die Karte füllt den Screen, der Planer liegt als Blatt mit drei Höhen darauf.
 * Die Web Version liegt in planner.web.tsx.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapLayersButton } from '@/components/map/map-settings-sheet';
import { MapPassActions, type PassAction } from '@/components/planner/map-pass-actions';
import { RouteMap } from '@/components/map/route-map';
import { passState, usePassLive } from '@/lib/pass-live';
import { PASSES, passPoint, passSummary, type Pass } from '@/lib/passes';
import { buildTour, findPlace, FRESH_MS, locate, newSeed, PHASES, toPlanError, type PlanError, type PlanPhase, type Spot, type TourRequest } from '@/components/planner/create-tour';
import { DirectionDial } from '@/components/planner/direction-dial';
import { Chip } from '@/components/ui/chip';
import { FunSheet, routeCheck } from '@/components/ui/fun-pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { RadarChip } from './radar-chip';
import { tourFun, type TourFun } from '@/lib/fun-score';
import { MapSheet, type Detent } from '@/components/ui/map-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { onEditTour, takeEditTour } from '@/lib/edit-tour';
import { reverseName } from '@/lib/geocode';
import { formatMinutes, parseWish, STOPS, targetKm, type Stop, type TourWish } from '@/lib/intent';
import { type PlannedTour } from '@/lib/plan';
import { bearingTo, DIRECTIONS, type Direction } from '@/lib/roundtrip';
import { spliceStop } from '@/lib/stop-splice';
import { curvyPieces, radarRadiusM, radarRoads, REVEAL_MS, type Radar } from '@/lib/radar';
import { flatten, haversine, PROFILES, PROFILE_CHOICES, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { DEFAULT_AVOID, type Avoid } from '@/lib/valhalla';

import { type PlannedStop } from './planner-parts';
import { showToast } from '@/lib/toast';
import { Accordion, avoidSummary, ErrorCard, MicIcon, PrimaryButton, Radio, Section, StepButton, Toggle, TypoTabs, VehiclePick } from './planner-parts';
import { Result } from './planner-result';
import { EMPTY_TOUR, keyOf, type Mode, passIndex, type PendingPoint, roughDetourKm, samePts, STEP_TEXT } from './planner-shared';
import { PlaceSearch } from './place-search';
import { styles } from './planner-styles';
import { useTourPlan } from './use-tour-plan';
import { TourMode } from './tour-mode';

/** Wort für den Toast nach dem Einplanen */
const STOP_WORD: Record<PlannedStop['cat'], string> = { tank: 'Tankstopp', kaffee: 'Kaffeepause', mittag: 'Mittagspause', aussicht: 'Aussichtspunkt', hotel: 'Übernachtung', pass: 'Pass' };





const DURATIONS: { minutes: number; big: string; unit: string }[] = [
  { minutes: 60, big: '1', unit: 'h' },
  { minutes: 120, big: '2', unit: 'h' },
  { minutes: 180, big: '3', unit: 'h' },
  { minutes: 270, big: '½', unit: 'Tag' },
  { minutes: 420, big: '1', unit: 'Tag' },
];

const STYLE_PROFILES: Profile[] = ['kurvig', 'entspannt'];
const PROFILE_WORD: Record<Profile, string> = { kurvig: 'kurvig', paesse: 'sehr kurvig', entspannt: 'entspannt', schnell: 'zügig' };

const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];
const MIN_STEPS = [60, 90, 120, 180, 240, 300, 420];

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
  // Tour planen ist der erste Tab und beim Öffnen gewählt (Koray 8.11.)
  const [mode, setMode] = useState<Mode>('tour');
  const [view, setView] = useState<Stage>({ kind: 'form' });
  const abort = useRef<AbortController | null>(null);
  const lastStops = useRef<Stop[]>([]);
  /** Gewürfelte Runden mit Fahrspaß Wert, damit man zu einer besseren zurückkehren kann (höchstens fünf) */
  const [rolls, setRolls] = useState<{ tour: PlannedTour; req: TourRequest; stops: Stop[]; fun: TourFun | null }[]>([]);
  const [funOpen, setFunOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Blatt über der Karte: klein, halb oder groß
  const [detent, setDetent] = useState<Detent>(1);
  /** Radar während eine Rundtour entsteht (Ladescreen Konzept C) */
  const [radar, setRadar] = useState<Radar | null>(null);
  const reduceMotion = useReducedMotion();
  // Suchen: nur der Ring, die Zahl nennt die Traumstrecken im Umkreis. Die Strecken selbst zeigen wir erst beim
  // Auflösen, und dann die kurvigen Stücke der fertigen Route, damit das Gefundene zur Strecke passt (Koray 8.11.)
  const startRadar = (center: LatLon, km: number) => {
    const radiusM = radarRadiusM(km);
    setRadar((r) => (r && haversine(r.center, center) < 200 && r.radiusM === radiusM ? r : { center, radiusM, roads: [], count: radarRoads(center, radiusM).length, phase: 'suchen' }));
  };
  const scroll = useRef<ScrollViewInstance>(null);
  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: false });
  /** Beim Tippen in ein Suchfeld groß, damit Tastatur und Treffer Platz haben */
  const expand = () => setDetent(2);
  const [dragging, setDragging] = useState(false);

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
  const [showSearch, setShowSearch] = useState(false);
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

  // Aus Meine Touren "Ändern": Tour in "Route" öffnen und einmal planen
  const loadTour = tourPlan.load;
  useEffect(() => {
    const take = () => {
      const t = takeEditTour();
      if (!t) return;
      abort.current?.abort();
      const p = t.profile ?? profile;
      setView({ kind: 'form' });
      setMode('tour');
      setPending(null);
      setProfile(p);
      loadTour(t, p, avoid);
    };
    // Vorgemerkt, bevor der Planer da war, oder später, während er schon offen ist
    const id = setTimeout(take, 0);
    const off = onEditTour(take);
    return () => {
      clearTimeout(id);
      off();
    };
  }, [loadTour, profile, avoid]);

  /**
   * Runde anpassen (wie calimoto): als Route mit Start, Zwischenzielen und Ziel öffnen, die Strecke
   * bleibt wie sie ist, bis ein Punkt geändert wird. Hat die Runde keine eigenen Zwischenpunkte
   * (Rundtour des Servers), setzen wir drei auf die Strecke, bei einem, zwei und drei Vierteln.
   */
  function adjustRound(t: PlannedTour, p: Profile) {
    const line = flatten(t).map((x) => x.p);
    const w = t.wegpunkte;
    const s = w[0] ?? line[0];
    const inner = w.slice(1, -1);
    const vias = inner.length ? inner : line.length > 8 ? [0.25, 0.5, 0.75].map((f) => line[Math.round((line.length - 1) * f)]) : [];
    const now = new Date().toISOString();
    abort.current?.abort();
    setProfile(p);
    setMode('tour');
    setView({ kind: 'form' });
    setPending(null);
    loadTour({ ...t, wegpunkte: [s, ...vias, s], id: '', folder: '', createdAt: now, updatedAt: now, profile: p }, p, avoid);
  }

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

  // Zurück in der App (etwa nach einer Fahrt): Standort still auffrischen, damit Suche und Mein Standort stimmen
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      Location.getForegroundPermissionsAsync()
        .then((perm) => (perm.granted ? locate(undefined, FRESH_MS) : null))
        .then((spot) => spot && setHere(spot))
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  async function findHere() {
    setLocating(true);
    setLocError(null);
    try {
      setHere(await locate(undefined, FRESH_MS));
    } catch (e) {
      setLocError(toPlanError(e));
    } finally {
      setLocating(false);
    }
  }

  // Welche Art der schnellen Runde zuletzt offen war
  // Beschreiben ist entfernt: Schnelle Runde ist immer die Einstellung
  const lastRunde = useRef<Mode>('rundtour');
  function switchMode(m: Mode) {
    if (m !== 'tour') lastRunde.current = m;
    setMode(m);
    if ((m === 'rundtour' || m === 'tour') && !here && !locating) void findHere();
  }

  // Startort Vorschläge schon beim Tippen

  async function run(prepare: (signal: AbortSignal) => Promise<TourRequest>, stops: Stop[], seed = newSeed(), keep = false) {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    lastStops.current = stops;
    setRoundStops([]);
    roundBase.current = null;
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
    // Karte frei für das Radar, das Blatt zeigt nur Schritt und Fortschritt
    setDetent(0);
    const guess = picked?.p ?? here?.p;
    setRadar(null);
    if (guess) startRadar(guess, roundKm);
    let req: TourRequest | undefined;
    try {
      req = await prepare(ctrl.signal);
      if (!ctrl.signal.aborted) startRadar(req.start.p, req.km);
      const tour = await buildTour(req, seed, step, ctrl.signal);
      // Auflösen: der Ring findet die kurvigen Stücke der Route, dann zeichnet sich die Linie, danach das Ergebnis
      const line = flatten(tour).map((x) => x.p);
      if (!ctrl.signal.aborted && line.length > 1 && !reduceMotion) {
        const center = req.start.p;
        setRadar((r) => ({
          center,
          radiusM: r?.radiusM ?? radarRadiusM(req!.km),
          roads: curvyPieces(line, center),
          count: r?.count ?? 0,
          phase: 'aufloesen',
          line,
        }));
        await new Promise((res) => setTimeout(res, REVEAL_MS));
      }
      if (!ctrl.signal.aborted) {
        const fun = tourFun(flatten(tour).map((x) => x.p));
        const item = { tour, req, stops, fun };
        setRolls((r) => (keep ? [...r, item].slice(-5) : [item]));
        setView({ kind: 'result', tour, req, stops });
        setDetent(1);
        toTop();
      }
    } catch (e) {
      const error = toPlanError(e, ctrl.signal);
      if (error.kind === 'aborted') setView({ kind: 'form' });
      else setView({ kind: 'error', error, req });
      setDetent(1);
    }
  }

  function createFromWish() {
    const e = eff;
    void run(async (signal) => {
      const start: Spot = e.startName
        ? await findPlace(e.startName, here?.p, 'Den Startort', signal).then((p) => ({ p: p.p, name: p.name }))
        : here ?? (await locate(signal));
      let bearing: number | undefined;
      let km = targetKm(e, e.profile);
      let note: string | undefined;
      if (!e.direction && e.towardName) {
        const target = await findPlace(e.towardName, start.p, 'Die Region', signal);
        bearing = bearingTo(start.p, target.p);
        // Eine Runde kommt etwa 40 % ihrer Länge weit. Liegt die Region weiter weg, wird die Runde länger,
        // sonst führt sie nur in die Richtung und kommt nie an.
        const distKm = haversine(start.p, target.p) / 1000;
        const needKm = Math.min(600, Math.round((distKm * 2.6) / 10) * 10);
        if (needKm > km) {
          note = `${target.name ?? e.towardName} liegt etwa ${Math.round(distKm)} km entfernt, die Runde ist deshalb länger als gewünscht.`;
          km = needKm;
        }
      }
      return {
        start, km, direction: e.direction ?? 'zufall', bearing,
        towardName: e.towardName, note, profile: e.profile, avoid: DEFAULT_AVOID,
      };
    }, e.stops);
  }

  function createRoundTrip() {
    void run(async (signal) => {
      // Ohne gewählten Ort neu orten, der gemerkte Standort kann nach einer Fahrt veraltet sein
      const start = picked ?? (await locate(signal, FRESH_MS).catch((e) => {
        if (here) return here;
        throw e;
      }));
      if (!picked) setHere(start);
      return { start, km: roundKm, direction, profile, avoid };
    }, []);
  }

  // Stopp in eine fertige Runde einplanen: Via Punkt mit kleinstem Umweg, dann neu planen.
  // Die Runde bleibt eine Runde, die Stopps stehen im Abschnitt Unterwegs einplanen.
  const [adding, setAdding] = useState(false);
  const [roundStops, setRoundStops] = useState<(PlannedStop & { p: LatLon })[]>([]);
  /** Runde ohne Stopps, Ausgangspunkt fürs Entfernen */
  const roundBase = useRef<PlannedTour | null>(null);
  async function addStop(p: LatLon, name: string, km: number, cat: PlannedStop['cat']) {
    if (view.kind !== 'result') return;
    const cur = view;
    const before = roundStops;
    setAdding(true);
    try {
      const t = await spliceStop(cur.tour, p, cur.req.profile, cur.req.avoid);
      if (!roundBase.current) roundBase.current = cur.tour;
      setView({ ...cur, tour: t });
      const kmTxt = `bei km ${Math.round(km)}`;
      const next = [...before, { key: `${p[0]},${p[1]}`, name, detail: kmTxt, cat, p }];
      setRoundStops(next);
      showToast(`${STOP_WORD[cat]} ${kmTxt} eingeplant`, {
        action: {
          label: 'Rückgängig',
          onPress: () => {
            setView(cur);
            setRoundStops(before);
            if (!before.length) roundBase.current = null;
          },
        },
      });
    } catch {
      showToast('Der Stopp ließ sich nicht einplanen', { tone: 'error' });
    } finally {
      setAdding(false);
    }
  }
  async function removeStop(key: string) {
    if (view.kind !== 'result' || !roundBase.current) return;
    const cur = view;
    const rest = roundStops.filter((x) => x.key !== key);
    setAdding(true);
    try {
      // Von der Runde ohne Stopps aus die übrigen Stopps wieder einsetzen
      let t = roundBase.current;
      for (const st of rest) t = await spliceStop(t, st.p, cur.req.profile, cur.req.avoid);
      setView({ ...cur, tour: t });
      setRoundStops(rest);
      if (!rest.length) roundBase.current = null;
    } catch {
      showToast('Der Stopp ließ sich nicht entfernen', { tone: 'error' });
    } finally {
      setAdding(false);
    }
  }

  function reroll(req: TourRequest) {
    void run(async () => req, lastStops.current, newSeed(), true);
  }

  function cancel() {
    abort.current?.abort();
    setView({ kind: 'form' });
    setDetent(1);
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
    ? tourPts.slice(1, -1).map((p, i) => ({ id: `via${i}-${keyOf(p)}`, p, label: String(i + 1), title: tourPlan.names[keyOf(p)] ?? `Zwischenziel ${i + 1}` }))
    : undefined;
  /** Letzte Änderung kam von der Karte (langer Druck, Pass Aktion): Ausschnitt nicht anpassen */
  const [mapEdit, setMapEdit] = useState(false);
  /** Punkt Aktion Auf der Karte zeigen */
  const [flyTo, setFlyTo] = useState<{ p: LatLon; n: number } | null>(null);
  const focus = inTour
    ? (pending?.p ?? (tourPts.length ? tourPts[tourPts.length - 1] : here?.p ?? null))
    : (picked?.p ?? here?.p ?? null);

  // Pässe, die schon als Punkt in der Route stehen, zeigt die Karte markiert
  const pickedPassIds = useMemo(
    () => new Set(inTour && tourPts.length ? PASSES.filter((ps) => passIndex(tourPts, ps) >= 0).map((ps) => ps.id) : []),
    [inTour, tourPts],
  );

  /** Tipp auf einen Pass der Karte: Aktionen schweben über der Karte, ein Tipp daneben blendet sie aus. */
  function onMapPassPress(pass: Pass) {
    setPending({ p: passPoint(pass), name: pass.name, pass });
  }

  /** Aktion für den angetippten Pass, direkt auf die Route */
  function onPassAction(a: PassAction) {
    setMapEdit(true);
    if (!pending?.pass) return;
    const pts = tourPlan.pts;
    if (a === 'remove') {
      const i = passIndex(pts, pending.pass);
      if (tourPlan.start && i === 0) tourPlan.removeStart(profile, avoid);
      else if (tourPlan.ziel && i === pts.length - 1) tourPlan.removeZiel(profile, avoid);
      else if (i >= 0) tourPlan.removeVia(i - (tourPlan.start ? 1 : 0), profile, avoid);
    } else tourPlan.add(a, pending.p, profile, avoid, pending.name ?? undefined);
    setPending(null);
  }

  const live = usePassLive();
  const passOverlay = inTour && pending?.pass ? pending.pass : null;
  const passRoleIdx = passOverlay ? passIndex(tourPts, passOverlay) : -1;
  const passRole =
    passRoleIdx < 0 ? null : passRoleIdx === 0 ? 'Start' : passRoleIdx === tourPts.length - 1 && tourPlan.complete ? 'Ziel' : `Zwischenziel ${passRoleIdx}`;

  function onMapLongPress(p: LatLon) {
    // Punkt auf der Karte: der Ausschnitt bleibt, wo du gerade bist (nicht zum Ziel springen)
    setMapEdit(true);
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

  // Fahrspaß der angezeigten Runde (mit Stopps neu gerechnet) und der Abstand zur vorigen Runde
  const resultTour = view.kind === 'result' ? view.tour : null;
  const rollIdx = resultTour ? rolls.findIndex((r) => r.tour === resultTour) : -1;
  const resultFun = useMemo(
    () => (resultTour ? (rolls.find((r) => r.tour === resultTour)?.fun ?? tourFun(flatten(resultTour).map((x) => x.p))) : null),
    [resultTour, rolls],
  );
  const resultLine = useMemo(() => (resultTour ? flatten(resultTour).map((x) => x.p) : undefined), [resultTour]);
  const prevFun = rollIdx > 0 ? rolls[rollIdx - 1].fun : null;
  const funDelta = resultFun && prevFun ? resultFun.score - prevFun.score : null;

  // Kopf des Blatts: Modus oder Name der Tour, darunter Fortschritt oder Hinweis
  const header = (
    <>
      {view.kind === 'form' ? (
        <TypoTabs
          value={mode === 'tour' ? 'route' : 'runde'}
          options={[
            // Namen wie bei calimoto, Tour planen zuerst (Koray 8.11.)
            { id: 'route', label: 'Tour planen' },
            { id: 'runde', label: 'Rundtour' },
          ]}
          onChange={(v) => switchMode(v === 'route' ? 'tour' : lastRunde.current)}
        />
      ) : view.kind === 'result' ? (
        <AppText variant="display" style={styles.headline} numberOfLines={2} accessibilityRole="header">
          {view.tour.name}
        </AppText>
      ) : (
        <AppText variant="label">{view.kind === 'working' ? 'Tour wird erstellt' : 'Das hat nicht geklappt'}</AppText>
      )}
      {view.kind === 'working' ? (
        <View style={styles.workBox}>
          <View style={styles.summary}>
            <AppText variant="title" style={styles.flex} numberOfLines={1}>
              {radar?.phase === 'aufloesen' ? 'Fertig' : PHASES.find((x) => x.id === view.phase)?.label}
            </AppText>
            <Pressable accessibilityRole="button" onPress={cancel} hitSlop={4} style={({ pressed }) => [styles.cancelChip, pressed && styles.pressedDim]}>
              <AppText style={styles.cancelText}>Abbrechen</AppText>
            </Pressable>
          </View>
          {/* Balken mit Prozent statt Logo (Koray 8.11.) */}
          <ProgressBar step={PHASES.findIndex((x) => x.id === view.phase)} done={radar?.phase === 'aufloesen'} doneMs={REVEAL_MS - 300} />
        </View>
      ) : inTour && tourPlan.step ? (
        <View style={styles.summary}>
          <ActivityIndicator color={Colors.signal} />
          <AppText style={styles.flex} numberOfLines={1}>
            {STEP_TEXT[tourPlan.step]}
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" muted numberOfLines={2} style={styles.summaryHint}>
          {view.kind === 'error'
            ? view.error.message
            : view.kind === 'result'
              ? `${PROFILE_WORD[view.req.profile]}, ${view.req.towardName ? `Richtung ${view.req.towardName}` : dirPhrase(view.req.direction)}${roundStops.length ? `, mit ${roundStops.length} ${roundStops.length === 1 ? 'Stopp' : 'Stopps'}` : ''}`
              : mode === 'tour'
                ? tourPts.length
                  ? 'Lange auf die Karte drücken setzt einen Punkt.'
                  : 'Start, Ziel und Zwischenziele frei setzen.'
                : mode === 'beschreiben'
                  ? 'Beschreib deine Runde in einem Satz, wir planen sie.'
                  : `Länge und Richtung wählen, zurück geht es zum Start (${picked?.name ?? here?.name ?? 'dein Standort'}).`}
        </AppText>
      )}
    </>
  );

  let body: ReactNode;
  if (view.kind === 'working') {
    // Schritte stehen im Kopf, die Karte zeigt das Radar; keine Liste mehr darunter (Koray 8.11.)
    body = null;
  } else if (view.kind === 'error') {
    body = (
      <>
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
        <Result
          tour={view.tour}
          req={view.req}
          stops={view.stops}
          group={false}
          onReroll={() => reroll(view.req)}
          fun={resultFun}
          funDelta={funDelta}
          onFun={() => setFunOpen(true)}
          rolls={rolls.length > 1 ? rolls.map((r) => r.fun) : []}
          rollIdx={rollIdx}
          onPickRoll={(i) => {
            const r = rolls[i];
            if (r) setView({ kind: 'result', tour: r.tour, req: r.req, stops: r.stops });
          }}
          onBack={() => setView({ kind: 'form' })}
          onAdjust={() => adjustRound(view.tour, view.req.profile)}
          adding={adding}
          planned={roundStops}
          onAddStop={(p, name, km, cat) => void addStop(p, name, km, cat)}
          onRemoveStop={(key) => void removeStop(key)}
        />
      </>
    );
  } else {
    body = (
    <>

      {mode === 'tour' ? (
        <TourMode
          plan={tourPlan}
          here={here}
          onHere={setHere}
          profile={profile}
          avoid={avoid}
          setAvoid={setAvoid}
          group={false}
          pending={pending}
          setPending={setPending}
          onDragChange={setDragging}
          onListEdit={() => setMapEdit(false)}
          onShowPoint={(p) => {
            setMapEdit(true);
            setDetent(0);
            setFlyTo((f) => ({ p, n: (f?.n ?? 0) + 1 }));
          }}
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
                  if (!locating) void findHere();
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
              <Pressable accessibilityRole="button" onPress={() => setShowSearch(true)} style={styles.linkBtn}>
                <AppText style={styles.linkText}>Anderen Startort wählen</AppText>
              </Pressable>
              <PlaceSearch
                visible={showSearch}
                role="Start der Runde"
                placeholder="Wo geht es los?"
                current={picked?.name ?? ''}
                near={here?.p}
                here={here?.p}
                locating={locating}
                message={null}
                onPick={(p, name) => {
                  setPicked({ p, name });
                  setShowSearch(false);
                }}
                onHere={() => {
                  setPicked(null);
                  setShowSearch(false);
                  if (!locating) void findHere();
                }}
                onClose={() => setShowSearch(false)}
              />
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
            <DirectionDial value={direction} onChange={setDirection} onDragChange={setDragging} />
          </Section>

          <Section label="Profil">
            <View style={styles.wrap}>
              {PROFILE_CHOICES.map((p) => (
                <Chip key={p.id} label={p.label} active={profile === p.id} onPress={() => setProfile(p.id)} />
              ))}
            </View>
          </Section>

          <Accordion label="Vermeiden" summary={avoidSummary(avoid)}>
            <View style={styles.card}>
              <Toggle
                label="Gesperrte Straßen"
                note="Wir planen um gesperrte Straßen herum."
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
          </Accordion>

          <PrimaryButton label="Tour erstellen" onPress={createRoundTrip} />
        </>
      )}
    </>
    );
  }

  return (
    <>
    <MapSheet
      detent={detent}
      onDetentChange={setDetent}
      scrollRef={scroll}
      lockScroll={dragging}
      grabberLabel="Planer Höhe ändern"
      header={header}
      background={(covered) => (
        <>
          <RouteMap
          layers
          tour={mapTour}
          pins={pins}
          showUser
          focus={focus}
          autoFit={!(inTour && mapEdit)}
          onLongPress={inTour ? onMapLongPress : undefined}
          onPressPass={inTour ? onMapPassPress : undefined}
          onPressMap={passOverlay ? () => setPending(null) : undefined}
          pickedPassIds={inTour ? pickedPassIds : undefined}
          flyTo={inTour ? flyTo : null}
          radar={view.kind === 'working' ? radar : null}
          // MapKit rechnet die Safe Area selbst dazu; ohne Abzug schwebt der Hinweis Apple Karten über dem Blatt
          mapPadding={{ top: 0, right: 0, bottom: Math.max(0, covered - insets.bottom), left: 0 }}
          edgePadding={{ top: insets.top + Spacing.xxxl, right: Spacing.xxxl, bottom: Spacing.xl + insets.bottom, left: Spacing.xxxl }}
          style={StyleSheet.absoluteFill}
        />
          <MapLayersButton style={[styles.layersBtn, { top: insets.top + Spacing.s }]} />
          {view.kind === 'working' && radar && <RadarChip key={`${radar.center[0]}-${radar.radiusM}-${radar.phase}`} count={radar.count} found={radar.phase === 'aufloesen' ? radar.roads.length : undefined} top={insets.top + Spacing.s} />}
          {passOverlay && (
            <MapPassActions
              pass={passOverlay}
              note={passSummary(passOverlay, undefined, passState(passOverlay, live).note)}
              role={passRole}
              complete={tourPlan.complete}
              empty={tourPts.length === 0}
              detourKm={tourPlan.complete ? roughDetourKm(tourPts, passPoint(passOverlay)) : null}
              bottom={covered + Spacing.m}
              onAction={onPassAction}
            />
          )}
        </>
      )}>
      {body}
    </MapSheet>
    <FunSheet
      fun={resultFun}
      name={resultTour?.name ?? ''}
      visible={funOpen}
      onClose={() => setFunOpen(false)}
      line={resultLine}
      check={resultTour ? routeCheck(resultTour.warnungen.filter((w) => w.klasse !== 'ok').length, resultTour.geprueft !== false) : null}
    />
    </>
  );
}
