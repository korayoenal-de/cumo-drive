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
import { router } from 'expo-router';
import { ActivityIndicator, AppState, Linking, StyleSheet, TextInput, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { MapLayersButton } from '@/components/map/map-settings-sheet';
import { MapPassActions, MapPointActions, type PassAction } from '@/components/planner/map-pass-actions';
import { RouteMap } from '@/components/map/route-map';
import { passState, usePassLive } from '@/lib/pass-live';
import { PASSES, passPoint, passSummary, type Pass } from '@/lib/passes';
import { buildTour, findPlace, FRESH_MS, locate, newSeed, PHASES, toPlanError, type PlanError, type PlanPhase, type Spot, type TourRequest } from '@/components/planner/create-tour';
import { DirectionDial } from '@/components/planner/direction-dial';
import { Chip, ChipRow, ChipGroup } from '@/components/ui/chip';
import { FunSheet, routeCheck } from '@/components/ui/fun-pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { BACK_PILL_H, BackPill } from './back-pill';
import { RadarChip, ScanChip } from './radar-chip';
import { DiceTip } from './dice-tip';
import { usePillText } from './use-pill';
import { tourFun, type TourFun } from '@/lib/fun-score';
import { MapSheet, type Detent } from '@/components/ui/map-sheet';
import { AppText } from '@/components/ui/text';
import { ActionSheet, SHEET_GONE_MS, type SheetItem } from '@/components/ui/action-sheet';
import { AskFeedbackSheet } from '@/components/planner/ask-feedback-sheet';
import { ASK_AFTER_ROLLS, ASK_DELAY_MS, mayAsk, type AskRound } from '@/lib/ask-feedback';
import { Colors, Motion, Spacing } from '@/constants/theme';
import { cumoAvailable, prewarmRouting } from '@/lib/cumo-routing';
import { onEditTour, setEditBackHandler, takeEditTour, useEditOrigin } from '@/lib/edit-tour';
import { takeLiveEdit } from '@/lib/live-edit';
import { countCurves } from '@/lib/stats';
import { reverseName } from '@/lib/geocode';
import { formatMinutes, parseWish, STOPS, targetKm, type Stop, type TourWish } from '@/lib/intent';
import { type PlannedTour, type PlanStep } from '@/lib/plan';
import { bearingTo, DIRECTIONS, type Direction } from '@/lib/roundtrip';
import { spliceStop } from '@/lib/stop-splice';
import { corridorSpots, curvyPieces, radarRadiusM, radarRoads, radarSpots, REVEAL_MS, type Radar, type Scan } from '@/lib/radar';
import { loadResume, saveResume } from '@/lib/planner-resume';
import { flatten, formatKm, haversine, normProfile, PROFILES, PROFILE_CHOICES, type LatLon, type Profile, type Tour } from '@/lib/tour';
import { DEFAULT_AVOID } from '@/lib/valhalla';
import { clearAvoidedPasses } from '@/lib/avoid-pass';
import { useAvoid } from '@/lib/avoid-settings';

import { type PlannedStop } from './planner-parts';
import { backRecommended, choiceText, needsChoice, noGoodAlternative, outAndBack, spurKm, type OutAndBack } from '@/lib/smart-roundtrip';
import { logSignal } from '@/lib/signals';
import { showToast } from '@/lib/toast';
import { ToastHost } from '@/components/ui/toast';
import { Accordion, avoidSummary, ErrorCard, MicIcon, PrimaryButton, Radio, Section, StepButton, Toggle, TypoTabs, VehiclePick } from './planner-parts';
import { Result } from './planner-result';
import { EMPTY_TOUR, keyOf, type Mode, passIndex, type PendingPoint, roughDetourKm, samePts } from './planner-shared';
import { changedLegs, legSpans } from '@/lib/route-change';
import type { LineMotion } from '@/components/map/route-motion';
import { PlaceSearch } from './place-search';
import { styles } from './planner-styles';
import { useTourPlan } from './use-tour-plan';
import { TourMode } from './tour-mode';
import { tr } from '@/i18n';


/** Schritte beim ersten Planen in Tour planen, gleiche Wortwahl wie bei der Rundtour */
// Verlängern und Kürzen zählen im Fortschrittsbalken wie der Vergleich (die Bereiche sind je Schritt fest)
const BAR_PHASES = PHASES.filter((x) => x.id !== 'longer' && x.id !== 'shorter');
const phaseIndex = (p: PlanPhase | PlanStep) => Math.max(0, BAR_PHASES.findIndex((x) => x.id === (p === 'longer' || p === 'shorter' ? 'compare' : p)));

/** Wort für den Toast nach dem Einplanen */
/** Neu würfeln ohne gute Alternative (Koray 10.11.) */
const NO_MORE_ROLLS = tr('Eine bessere Runde gibt es hier gerade nicht. Probier eine andere Richtung oder Länge.');
const STOP_WORD: Record<PlannedStop['cat'], string> = { tank: 'Tankstopp', kaffee: 'Kaffeepause', mittag: 'Mittagspause', aussicht: 'Aussichtspunkt', hotel: tr('Übernachtung'), pass: 'Pass' };





const DURATIONS: { minutes: number; big: string; unit: string }[] = [
  { minutes: 60, big: '1', unit: 'h' },
  { minutes: 120, big: '2', unit: 'h' },
  { minutes: 180, big: '3', unit: 'h' },
  { minutes: 270, big: '½', unit: tr('Tag') },
  { minutes: 420, big: '1', unit: tr('Tag') },
];

const STYLE_PROFILES: Profile[] = ['kurvig', 'entspannt'];
const PROFILE_WORD: Record<Profile, string> = { kurvig: 'kurvig', paesse: 'kurvig', entspannt: 'entspannt', schnell: tr('zügig') };

const KM_STEPS = [25, 50, 75, 100, 150, 200, 300];
const MIN_STEPS = [60, 90, 120, 180, 240, 300, 420];

function dirPhrase(d: Direction): string {
  if (d === 'zufall') return tr('in zufälliger Richtung');
  return tr('Richtung {dir}', { dir: DIRECTIONS.find((x) => x.id === d)!.label });
}

function joinDe(items: string[]): string {
  if (items.length < 2) return items.join('');
  return tr('{v0} und {v1}', { v0: items.slice(0, -1).join(', '), v1: items[items.length - 1] });
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
  const parts: string[] = [tr('Rundtour ab {v0}', { v0: e.startName ?? 'deinem Standort' })];
  if (e.km) parts.push(`${e.km} km`);
  else if (e.minutes) parts.push(`${formatMinutes(e.minutes)} (etwa ${km} km)`);
  else parts.push(tr('etwa {km} km', { km }));
  parts.push(PROFILE_WORD[e.profile]);
  if (e.towardName) parts.push(tr('Richtung {towardName}', { towardName: e.towardName }));
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

export default function Planner({ liveEdit = false }: { /** Tour anpassen unterwegs, über der laufenden Navigation (Koray 15.11.) */ liveEdit?: boolean } = {}) {
  // Tour planen ist der erste Tab und beim Öffnen gewählt (Koray 8.11.)
  const [mode, setMode] = useState<Mode>('tour');
  const [view, setView] = useState<Stage>({ kind: 'form' });
  const [askRounds, setAskRounds] = useState<AskRound[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  /**
   * Nächste Runde vorab rechnen (10.11.): Kurz nachdem eine Rundtour steht, rechnet die App im Hintergrund
   * schon die nächste mit neuem Würfelwert. Neu würfeln zeigt sie dann ohne Wartezeit auf die Planung.
   * Nur mit eigenem Routing Server, damit keine fremden Kontingente doppelt belastet werden.
   */
  /** Linien der Runden dieses Würfelns, damit Neu würfeln nicht dieselbe Runde bringt */
  const shownLines = useRef<LatLon[][]>([]);
  const nextRoll = useRef<{ req: TourRequest; seed: number; ctrl: AbortController; job: Promise<PlannedTour> } | null>(null);
  const dropNextRoll = () => {
    nextRoll.current?.ctrl.abort();
    nextRoll.current = null;
  };
  useEffect(() => dropNextRoll, []);
  /** Würfeln für diese Anfrage ausgeschöpft: es kam nichts Gutes mehr (Koray 10.11.: ehrlich sagen statt endlos würfeln) */
  const exhausted = useRef<TourRequest | null>(null);
  const lastStops = useRef<Stop[]>([]);
  /** Gewürfelte Runden mit Fahrspaß Wert, damit man zu einer besseren zurückkehren kann (höchstens fünf) */
  const [rolls, setRolls] = useState<{ tour: PlannedTour; req: TourRequest; stops: Stop[]; fun: TourFun | null }[]>([]);
  /** die laufende Planung kommt aus Neu würfeln: dann kippt der Würfel im Kopf einmal um */
  const [rolling, setRolling] = useState(false);
  /** kurz nach dem Neu würfeln: der Würfel kippt neben der neuen Runde, auch wenn sie ohne Wartezeit da war */
  const [diceShow, setDiceShow] = useState(false);
  const [funOpen, setFunOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Blatt über der Karte: klein, halb oder groß
  const [detent, setDetent] = useState<Detent>(1);
  /** Radar während eine Rundtour entsteht (Ladescreen Konzept C) */
  const [radar, setRadar] = useState<Radar | null>(null);
  /** Scan entlang der Strecke beim ersten Planen in Tour planen (Koray 9.11.) */
  const [scan, setScan] = useState<Scan | null>(null);
  // Routing Server schon beim Öffnen des Planers prüfen und die Verbindung aufbauen (10.11.)
  useEffect(() => prewarmRouting(), []);
  const reduceMotion = useReducedMotion();
  // Suchen: nur der Ring, die Zahl nennt die Traumstrecken im Umkreis. Die Strecken selbst zeigen wir erst beim
  // Auflösen, und dann die kurvigen Stücke der fertigen Route, damit das Gefundene zur Strecke passt (Koray 8.11.)
  const startRadar = (center: LatLon, km: number) => {
    const radiusM = radarRadiusM(km);
    setRadar((r) => (r && haversine(r.center, center) < 200 && r.radiusM === radiusM ? r : { center, radiusM, roads: [], spots: radarSpots(center, radiusM), count: radarRoads(center, radiusM).length, phase: 'suchen' }));
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
  /** Wunschlänge nicht erreichbar (Koray 16.11., Optionen A und B): Runde in anderer Länge oder hin und zurück */
  const [lengthChoice, setLengthChoice] = useState<{ want: number; loop: PlannedTour; back: OutAndBack | null; items: SheetItem[] } | null>(null);
  const [lengthBy, setLengthBy] = useState<'km' | 'dauer'>('km');
  const [kmIdx, setKmIdx] = useState(3);
  const [minIdx, setMinIdx] = useState(2);
  const [direction, setDirection] = useState<Direction>('zufall');
  const [profile, setProfile] = useState<Profile>('kurvig');
  // Vermeiden bleibt als feste Einstellung stehen (lib/avoid-settings)
  const [avoid, setAvoid] = useAvoid();

  const roundKm = lengthBy === 'km' ? KM_STEPS[kmIdx] : targetKm({ minutes: MIN_STEPS[minIdx] }, profile);

  // Tour von Hand: Zustand lebt hier, damit er beim Wechsel der Modi erhalten bleibt.
  // Steht eine Route, geht das Blatt auf halbe Höhe, damit sie auf der Karte zu sehen ist.
  /** true, solange auf der Karte geplant wird: dann bleibt das Blatt klein, auch wenn die neue Strecke fertig ist */
  const onMap = useRef(false);
  const tourPlan = useTourPlan(() => {
    if (!onMap.current) setDetent(1);
  });
  /** Auf der Karte wird ein Punkt angefasst, gezogen oder gesetzt (Koray 11.11.): Blatt klein, die Karte hat Platz */
  const workOnMap = () => {
    onMap.current = true;
    setDetent(0);
  };
  const [pending, setPending] = useState<PendingPoint | null>(null);
  /** Angetippter Zwischenpunkt auf der Karte (Index unter den Zwischenzielen) */
  const [selVia, setSelVia] = useState<number | null>(null);
  /** Letzte Änderung kam von der Karte (langer Druck, Pass Aktion): Ausschnitt nicht anpassen */
  const [mapEdit, setMapEdit] = useState(false);
  /** Ergebnis nach dem Ziehen, ein paar Sekunden in der Pille oben links mit Rückgängig */
  const [adjustDone, setAdjustDone] = useState<{ text: string; tone?: 'warn'; snap: ReturnType<ReturnType<typeof useTourPlan>['snapshot']> } | null>(null);
  useEffect(() => {
    if (!adjustDone) return;
    const t = setTimeout(() => setAdjustDone(null), adjustDone.tone ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [adjustDone]);
  /** Nach dem Ziehen eines Punkts: Stand vorher, Länge vorher, ob schon gerechnet wird */
  const [adjust, setAdjust] = useState<{ snap: ReturnType<ReturnType<typeof useTourPlan>['snapshot']>; km: number | null; busy: boolean } | null>(null);

  // Aus Meine Touren "Ändern": Tour in "Route" öffnen und einmal planen
  const loadTour = tourPlan.load;
  useEffect(() => {
    const take = () => {
      // Unterwegs: nur der Rest der laufenden Tour, nie eine aus Meine Touren
      const lv = liveEdit ? takeLiveEdit() : null;
      const t = liveEdit ? lv?.tour ?? null : takeEditTour();
      if (!t) return;
      abort.current?.abort();
      const p = normProfile(lv?.profile ?? t.profile ?? profile);
      setView({ kind: 'form' });
      setMode('tour');
      setPending(null);
      setSelVia(null);
      setAdjust(null);
      // Neu geöffnete Tour (Link, Community, Touren) immer ganz zeigen: ein vorheriges Ziehen auf der Karte
      // hatte das Einpassen abgeschaltet, die Karte blieb dann am alten Ort (Koray 11.11.)
      setMapEdit(false);
      onMap.current = false;
      setProfile(p);
      loadTour(t, p, avoid);
    };
    // Vorgemerkt, bevor der Planer da war, oder später, während er schon offen ist
    const id = setTimeout(take, 0);
    const off = liveEdit ? () => undefined : onEditTour(take);
    return () => {
      clearTimeout(id);
      off();
    };
    // unterwegs nur einmal beim Öffnen abholen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTour, liveEdit ? null : profile, liveEdit ? null : avoid, liveEdit]);

  // Nach dem Schließen der App weiter, wo du warst (Koray 16.11.): Stand wiederherstellen, ohne neu zu planen.
  // Kommt vorher schon eine Tour (Link, Touren, Community), gewinnt die.
  type Snap = ReturnType<ReturnType<typeof useTourPlan>['snapshot']>;
  type Round = { tour: PlannedTour; req: TourRequest; stops: Stop[] };
  const resumed = useRef(false);
  const latest = useRef({ pts: 0, kind: 'form' as Stage['kind'] });
  useEffect(() => {
    latest.current = { pts: tourPlan.pts.length, kind: view.kind };
  });
  const restoreTour = tourPlan.restore;
  useEffect(() => {
    if (liveEdit) return;
    let gone = false;
    void loadResume<Snap, Round>().then((r) => {
      if (gone) return;
      if (r && latest.current.pts === 0 && latest.current.kind === 'form') {
        setProfile(normProfile(r.profile));
        if (r.round) {
          setMode('rundtour');
          setView({ kind: 'result', tour: r.round.tour, req: r.round.req, stops: r.round.stops ?? [] });
        } else if (r.tour) {
          setMode(r.mode);
          restoreTour(r.tour);
        }
      }
      resumed.current = true;
    });
    return () => {
      gone = true;
    };
    // nur beim Öffnen des Planers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lastSaved = useRef<unknown[]>([]);
  useEffect(() => {
    if (liveEdit || !resumed.current) return;
    // Rechnen und Fehler nicht festhalten, der letzte gute Stand bleibt
    if (view.kind === 'working' || view.kind === 'error') return;
    const sig = [view, mode, tourPlan.pts, tourPlan.planned, tourPlan.name, tourPlan.cloudId, profile];
    if (sig.length === lastSaved.current.length && sig.every((x, i) => x === lastSaved.current[i])) return;
    lastSaved.current = sig;
    if (view.kind === 'result') saveResume<Snap, Round>({ mode: 'rundtour', profile, round: { tour: view.tour, req: view.req, stops: view.stops } });
    else if (tourPlan.pts.length) saveResume<Snap, Round>({ mode: mode === 'rundtour' ? 'rundtour' : 'tour', profile, tour: tourPlan.snapshot() });
    else saveResume(null);
  });

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
    setProfile(normProfile(p));
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

  async function run(prepare: (signal: AbortSignal) => Promise<TourRequest>, stops: Stop[], seed = newSeed(), keep = false, ready?: Promise<PlannedTour>) {
    abort.current?.abort();
    if (!ready) dropNextRoll();
    setRolling(keep);
    // für Neu würfeln: was gerade zu sehen ist, und die bisherigen Runden zum Vergleich
    const before = view;
    const earlier = keep ? rolls : [];
    if (!keep) exhausted.current = null;
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
      // vorab gerechnete Runde nehmen; klappte sie nicht, ganz normal neu planen
      if (!keep) shownLines.current = [];
      const shown = [...shownLines.current];
      let tour = ready ? await ready.catch(() => buildTour(req!, seed, step, ctrl.signal, shown)) : await buildTour(req, seed, step, ctrl.signal, shown);
      // Neu würfeln ohne gute Alternative: einmal still mit anderem Würfelwert nachlegen. Kommt wieder nichts
      // Gutes, bleibt die bisherige Runde stehen und wir sagen es ehrlich (Koray 10.11.)
      const prev = earlier.filter((r) => r.req === req);
      if (prev.length && before.kind === 'result') {
        const best = Math.max(...prev.map((r) => r.fun?.score ?? 0));
        const weak = (t: PlannedTour) => noGoodAlternative(t, prev.map((r) => r.tour), req!.km, tourFun(flatten(t).map((x) => x.p))?.score ?? null, best);
        if (weak(tour) && !ctrl.signal.aborted) tour = await buildTour(req, newSeed(), step, ctrl.signal, [...shown, flatten(tour).map((x) => x.p)]);
        if (weak(tour) && !ctrl.signal.aborted) {
          exhausted.current = req;
          setRadar(null);
          setView(before);
          setDetent(1);
          showToast(NO_MORE_ROLLS);
          return;
        }
      }
      // Keine Runde in der Wunschlänge (enge Täler wie Bonneval, Routen Check 16.11.): nicht still eine Riesenrunde
      // zeigen, sondern hin und zurück zum schönsten Ziel rechnen und gleich fragen
      let choice: { want: number; loop: PlannedTour; back: OutAndBack | null } | null = null;
      if (needsChoice(tour, req.km) && !ctrl.signal.aborted) {
        step('compare');
        const back = await outAndBack(
          { name: tr('Rundtour ab {name}', { name: req.start.name }), start: req.start.p, km: req.km, direction: req.direction, bearing: req.bearing, profile: req.profile, avoid: req.avoid },
          ctrl.signal,
        ).catch((e) => {
          if (ctrl.signal.aborted) throw e;
          return null;
        });
        choice = { want: req.km, loop: tour, back };
      }
      // Auflösen: der Ring findet die kurvigen Stücke der Route, dann zeichnet sich die Linie, danach das Ergebnis
      const line = flatten(tour).map((x) => x.p);
      if (!ctrl.signal.aborted && line.length > 1 && !reduceMotion) {
        const center = req.start.p;
        setRadar((r) => ({
          center,
          radiusM: r?.radiusM ?? radarRadiusM(req!.km),
          roads: curvyPieces(line, center),
          count: r?.count ?? 0,
          spots: r?.spots,
          phase: 'aufloesen',
          line,
        }));
        await new Promise((res) => setTimeout(res, REVEAL_MS));
      }
      if (!ctrl.signal.aborted) {
        const fun = tourFun(flatten(tour).map((x) => x.p));
        const item = { tour, req, stops, fun };
        logSignal('geplant', tour, { mode: 'rundtour', profile: req.profile, suggested: true, fun: fun?.score ?? null });
        setRolls((r) => (keep ? [...r, item].slice(-5) : [item]));
        // die Rundtour steht: der stärkste Moment bekommt einen Impuls (Audit 18.11.)
        haptic('ergebnis');
        if (keep) {
          setDiceShow(true);
          setTimeout(() => setDiceShow(false), 1800);
        }
        setView({ kind: 'result', tour, req, stops });
        setDetent(1);
        toTop();
        if (choice) {
          const c = choice;
          setTimeout(() => setLengthChoice({ ...c, items: lengthItems(c) }), 400);
        }
        shownLines.current = [...shownLines.current, flatten(tour).map((x) => x.p)].slice(-5);
        // die nächste Runde vorab rechnen, sobald das Ergebnis steht und die Karte zur Ruhe gekommen ist
        const shown = req;
        setTimeout(() => {
          if (abort.current !== ctrl || ctrl.signal.aborted || nextRoll.current || exhausted.current === shown) return;
          void cumoAvailable().then((own) => {
            if (!own || abort.current !== ctrl || ctrl.signal.aborted || nextRoll.current) return;
            const c = new AbortController();
            const s = newSeed();
            const job = buildTour(shown, s, () => undefined, c.signal, [...shownLines.current]);
            job.catch(() => undefined);
            nextRoll.current = { req: shown, seed: s, ctrl: c, job };
          });
        }, 1500);
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
        ? await findPlace(e.startName, here?.p, tr('Den Startort'), signal).then((p) => ({ p: p.p, name: p.name }))
        : here ?? (await locate(signal));
      let bearing: number | undefined;
      let km = targetKm(e, e.profile);
      let note: string | undefined;
      if (!e.direction && e.towardName) {
        const target = await findPlace(e.towardName, start.p, tr('Die Region'), signal);
        bearing = bearingTo(start.p, target.p);
        // Eine Runde kommt etwa 40 % ihrer Länge weit. Liegt die Region weiter weg, wird die Runde länger,
        // sonst führt sie nur in die Richtung und kommt nie an.
        const distKm = haversine(start.p, target.p) / 1000;
        const needKm = Math.min(600, Math.round((distKm * 2.6) / 10) * 10);
        if (needKm > km) {
          note = tr('{v0} liegt etwa {v1} km entfernt, die Runde ist deshalb länger als gewünscht.', { v0: target.name ?? e.towardName, v1: Math.round(distKm) });
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
    // Neue Runde: ausgelassene Pässe der vorigen gelten nicht mehr
    clearAvoidedPasses();
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
      const kmTxt = tr('bei km {v0}', { v0: Math.round(km) });
      const next = [...before, { key: `${p[0]},${p[1]}`, name, detail: kmTxt, cat, p }];
      setRoundStops(next);
      showToast(`${STOP_WORD[cat]} ${kmTxt} eingeplant`, {
        action: {
          label: tr('Rückgängig'),
          onPress: () => {
            setView(cur);
            setRoundStops(before);
            if (!before.length) roundBase.current = null;
          },
        },
      });
    } catch {
      showToast(tr('Der Stopp ließ sich nicht einplanen'), { tone: 'error' });
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
      showToast(tr('Der Stopp ließ sich nicht entfernen'), { tone: 'error' });
    } finally {
      setAdding(false);
    }
  }

  function reroll(req: TourRequest) {
    // die gezeigte Runde gefiel nicht genug: schwaches Signal dagegen
    if (view.kind === 'result') logSignal('neu_gewuerfelt', view.tour, { mode: 'rundtour', profile: req.profile, suggested: true });
    if (exhausted.current === req) {
      showToast(NO_MORE_ROLLS);
      return;
    }
    const next = nextRoll.current;
    if (next && next.req === req) {
      nextRoll.current = null;
      void run(async () => req, lastStops.current, next.seed, true, next.job);
      return;
    }
    void run(async () => req, lastStops.current, newSeed(), true);
  }

  /** Auswahl bei nicht erreichbarer Länge: Empfehlung oben (hin und zurück, wenn es zur Länge passt) */
  function lengthItems(c: { want: number; loop: PlannedTour; back: OutAndBack | null }) {
    // Empfehlung: hin und zurück, wenn es passt oder näher an der Wunschlänge liegt als die Runde
    const backFits = backRecommended(c.back, c.loop, c.want);
    const loopItem = { key: 'runde', icon: 'arrow.triangle.2.circlepath' as const, label: tr('Runde mit {km} km', { km: Math.round(c.loop.laenge_km) }), primary: !backFits, onPress: () => undefined };
    const backItem = c.back
      ? [{ key: 'zurueck', icon: 'arrow.uturn.backward' as const, label: tr('{km} km hin und zurück', { km: Math.round(c.back.laenge_km) }), hint: tr('Über {name} und auf demselben Weg zurück', { name: c.back.target }), primary: backFits, onPress: () => pickLength('zurueck', c) }]
      : [];
    const startItem = { key: 'start', icon: 'mappin.and.ellipse' as const, label: tr('Anderen Startort wählen'), onPress: () => pickLength('start', c) };
    return [...(backFits ? [...backItem, loopItem] : [loopItem, ...backItem]), startItem];
  }
  function pickLength(key: 'zurueck' | 'start', c: { back: OutAndBack | null }) {
    if (key === 'start') {
      cancel();
      setTimeout(() => setShowSearch(true), 50);
      return;
    }
    const b = c.back;
    if (!b) return;
    setView((v) => (v.kind === 'result' ? { ...v, tour: b } : v));
    shownLines.current = [...shownLines.current, flatten(b).map((x) => x.p)].slice(-5);
  }

  function cancel() {
    dropNextRoll();
    abort.current?.abort();
    setView({ kind: 'form' });
    setDetent(1);
  }

  // Was die große Karte zeigt: Ergebnis, geplante Route oder ohne Route den eigenen Standort
  const tourPts = tourPlan.pts;
  const tourFits = !!tourPlan.planned && samePts(tourPlan.planned.wegpunkte, tourPts);
  const routeTour = tourFits ? tourPlan.planned : null;
  // Erste Planung einer neuen Tour: Blatt klein, Schritt und Balken im Kopf, Scan auf der Karte.
  // Jede weitere Änderung rechnet ruhig im Losfahren Knopf (Zustand im Rendern nachgeführt)
  const firstPlan = view.kind === 'form' && mode === 'tour' && !!tourPlan.step && !tourPlan.planned;
  if (firstPlan && !scan) {
    setScan({ pts: tourPlan.pts, spots: corridorSpots(tourPlan.pts) });
    setDetent(0);
  } else if (!tourPlan.step && scan) {
    setScan(null);
    setDetent(1);
  }
  // Nach dem Ziehen: erst warten, bis gerechnet wird, dann Ergebnis mit Rückgängig melden (Koray 11.11.)
  if (adjust) {
    if (tourPlan.step && !adjust.busy) setAdjust({ ...adjust, busy: true });
    else if (!tourPlan.step && adjust.busy) {
      const before = adjust;
      setAdjust(null);
      const now = tourPlan.planned;
      if (now && now !== before.snap.planned) {
        const d = before.km != null ? Math.round(now.laenge_km - before.km) : 0;
        const spur = spurKm(now);
        const text = spur >= 0.3 ? tr('{v0} km hin und zurück', { v0: formatKm(spur, 1) }) : d === 0 ? tr('Angepasst') : `${d > 0 ? '+' : '−'}${Math.abs(d)} km`;
        setAdjustDone({ text, tone: spur >= 0.3 ? 'warn' : undefined, snap: before.snap });
      }
    }
  }
  // Jede Neuplanung, die auf der Karte ausgelöst wurde (Ziehen, langer Druck, Pass Aktionen), zeigt ihr Laden
  // oben in der Pille, dort ist der Blick (Koray 11.11.); die erste Planung einer neuen Tour hat ihren eigenen Scan
  const adjustBusy = (!!adjust?.busy || (mapEdit && !!tourPlan.planned)) && !!tourPlan.step && mode === 'tour' && view.kind === 'form';
  const inTour = view.kind === 'form' && mode === 'tour';
  // Jede weitere Neuplanung aus der Liste (Punkte, Profil, Vermeiden) zeigt ihren Schritt ebenfalls oben auf der
  // Karte (Koray 14.11.): Ist das Blatt klein oder der Knopf verdeckt, wirkte die App sonst hängengeblieben.
  const listBusy = inTour && !!tourPlan.step && !scan && !adjustBusy;
  const listPill = usePillText(listBusy ? tourPlan.step : null, 'tour', 0);
  const pill = usePillText(
    scan ? (tourPlan.step ?? null) : view.kind === 'working' ? view.phase : null,
    scan ? 'tour' : 'runde',
    scan ? scan.spots.length : 0,
  );
  // Entwurf ohne Route und Pins nur neu bauen, wenn sich Punkte oder Namen ändern: sonst zeichnet die Karte
  // bei jedem Rendern alles neu (Prüfung 11.11.). Während eine gezogene Strecke rechnet, bleibt die alte
  // Strecke blass stehen, bis die neue da ist.
  const draftTour = useMemo<Tour>(() => ({ name: '', laenge_km: 0, wegpunkte: tourPts, linie: [], warnungen: [] }), [tourPts]);
  const oldPlanned = tourPlan.planned;
  // alte Linie mit den neuen Punkten, damit Start und Ziel schon an der neuen Stelle stehen
  const staleTour = useMemo<Tour | null>(() => (oldPlanned ? { ...oldPlanned, wegpunkte: tourPts, warnungen: [] } : null), [oldPlanned, tourPts]);
  // Jede Neuplanung einer schon geplanten Tour (Karte oder Liste): die alte Linie bleibt stehen, nur die Etappen,
  // die sich ändern, werden blass und schimmern (Koray 19.11.2026: was fest ist, bleibt fest). Früher war die ganze
  // Linie blass und eine gestrichelte Gerade lief durch alle Punkte, das sah aus, als würde alles neu geplant.
  const busyEdit = inTour && !!tourPlan.step && !!oldPlanned && !tourFits;
  const dimSpans = useMemo(
    () => (busyEdit && oldPlanned ? legSpans(oldPlanned, changedLegs(oldPlanned.wegpunkte, tourPts).oldChanged) : null),
    [busyEdit, oldPlanned, tourPts],
  );
  const mapTour: Tour = view.kind === 'result' ? view.tour : inTour ? (routeTour ?? (busyEdit && staleTour ? staleTour : draftTour)) : EMPTY_TOUR;
  // Ergebnis da: nur die neuen Etappen zeichnen sich auf (Design Artefakt „Punkte, Zeiten, Richtung“). Eine laufende
  // Richtungsanzeige gab es kurz (Schein, dann Punktkette) und ist auf Korays Wunsch wieder weg (20.11.: zu viel).
  const lineTour = view.kind === 'result' ? view.tour : routeTour;
  const lastLine = useRef<Tour | null>(null);
  const [grow, setGrow] = useState<LineMotion | null>(null);
  useEffect(() => {
    if (!lineTour || !lineTour.linie.length || lineTour === lastLine.current) return;
    const prev = lastLine.current;
    lastLine.current = lineTour;
    const fresh = prev ? changedLegs(prev.wegpunkte, lineTour.wegpunkte).newChanged : null;
    const spans = fresh && fresh.some(Boolean) && !fresh.every(Boolean) ? legSpans(lineTour, fresh) : null;
    if (spans && spans.length) {
      const g: LineMotion = { mode: 'grow', spans, key: `wachsen-${Date.now()}` };
      setGrow(g);
      const id = setTimeout(() => setGrow((cur) => (cur === g ? null : cur)), 650);
      return () => clearTimeout(id);
    }
    setGrow(null);
  }, [lineTour]);
  const names = tourPlan.names;
  const pins = useMemo(
    () => (inTour ? tourPts.slice(1, -1).map((p, i) => ({ id: `via${i}-${keyOf(p)}`, p, label: String(i + 1), title: names[keyOf(p)] ?? tr('Zwischenziel {v0}', { v0: i + 1 }) })) : undefined),
    [inTour, tourPts, names],
  );
  /** Punkt Aktion Auf der Karte zeigen */
  const [flyTo, setFlyTo] = useState<{ p: LatLon; n: number } | null>(null);
  // Fokus der Karte (ohne Linie springt sie dorthin). Nur bei neuen Zielen springen: gewählter Pass, neuer letzter
  // Punkt, gewählter Start. Der eigene Standort zählt nur einmal am Anfang (Koray 17.11.: beim Passo Giau sprang die
  // Karte zurück auf den Standort, wenn die Pass Aktionen schlossen oder die App den Standort still auffrischte).
  const lastPt = inTour && tourPts.length ? tourPts[tourPts.length - 1] : null;
  const nextPending = inTour ? (pending?.p ?? null) : null;
  const nextPicked = inTour ? null : (picked?.p ?? null);
  const herePt = here?.p ?? null;
  // Ableitung beim Rendern mit den vorigen Werten im State (React Muster für abgeleiteten Zustand), verglichen nach Wert
  const k = (q: LatLon | null) => (q ? `${q[0]},${q[1]}` : '');
  const [fs, setFs] = useState<{ pending: string; last: string; picked: string; p: LatLon | null }>({ pending: '', last: '', picked: '', p: null });
  if (fs.pending !== k(nextPending) || fs.last !== k(lastPt) || fs.picked !== k(nextPicked) || (!fs.p && herePt)) {
    let p = fs.p;
    if (nextPending && k(nextPending) !== fs.pending) p = nextPending;
    else if (lastPt && k(lastPt) !== fs.last) p = lastPt;
    else if (nextPicked && k(nextPicked) !== fs.picked) p = nextPicked;
    else if (!p && herePt) p = herePt;
    setFs({ pending: k(nextPending), last: k(lastPt), picked: k(nextPicked), p });
  }
  const focus = fs.p;

  // Pässe, die schon als Punkt in der Route stehen, zeigt die Karte markiert
  const pickedPassIds = useMemo(
    () => new Set(inTour && tourPts.length ? PASSES.filter((ps) => passIndex(tourPts, ps) >= 0).map((ps) => ps.id) : []),
    [inTour, tourPts],
  );

  /** Tipp auf einen Pass der Karte: Aktionen schweben über der Karte, ein Tipp daneben blendet sie aus. */
  function onMapPassPress(pass: Pass) {
    workOnMap();
    setSelVia(null);
    setPending({ p: passPoint(pass), name: pass.name, pass });
  }

  /**
   * Punkte auf der Karte halten und ziehen (Koray 11.11.): Start, Ziel und Zwischenziele wandern an die neue
   * Stelle, die Strecke wird neu geplant. So lässt sich etwa ein Stich vermeiden.
   */
  function onDragPoint(id: string, p: LatLon) {
    workOnMap();
    setPending(null);
    setSelVia(null);
    setMapEdit(true);
    // Stand vorher merken: Laden oben links, danach Hinweis mit Rückgängig
    setAdjustDone(null);
    setAdjust({ snap: tourPlan.snapshot(), km: routeTour?.laenge_km ?? null, busy: false });
    if (id === 'start' || id === 'ziel') return tourPlan.setSlot(id, p, profile, avoid);
    const i = Number(/^via(\d+)-/.exec(id)?.[1] ?? -1);
    if (i >= 0) tourPlan.dragVia(i, p, profile, avoid);
  }

  /** Langer Druck auf die Linie: dort entsteht ein Zwischenziel, das sich dann ziehen lässt */
  function onLongPressLine(p: LatLon) {
    workOnMap();
    haptic('punkt');
    setPending(null);
    setMapEdit(true);
    tourPlan.add('via', p, profile, avoid);
    showToast(tr('Neuer Punkt auf der Strecke. Halten und ziehen verschiebt sie.'));
  }

  /** Tipp auf ein nummeriertes Zwischenziel: ist es ein Pass, dieselben Aktionen wie beim Pass, sonst Entfernen */
  function onPinPress(id: string) {
    const i = Number(/^via(\d+)-/.exec(id)?.[1] ?? -1);
    const p = tourPts.slice(1, -1)[i];
    if (!p) return;
    const ps = PASSES.find((x) => passIndex([p], x) === 0);
    if (ps) return onMapPassPress(ps);
    workOnMap();
    setPending(null);
    setSelVia(i);
  }

  /** Aktion für den angetippten Pass, direkt auf die Route */
  /** Zwischenziel an Stelle idx aus der Karte heraus als Start oder Ziel setzen, wie in der Liste */
  function viaFromMap(idx: number, as: 'start' | 'ziel') {
    setMapEdit(true);
    const p = tourPts[idx];
    const snap = tourPlan.snapshot();
    const turned = tourPlan.viaAs(idx, as, profile, avoid);
    if (turned && p) showToast(tr('Die Runde startet jetzt in {name}. Die Strecke bleibt gleich.', { name: tourPlan.names[keyOf(p)] ?? tr('Zwischenziel {v0}', { v0: idx }) }), { action: { label: tr('Rückgängig'), onPress: () => tourPlan.restore(snap) } });
    setSelVia(null);
  }

  function onPassAction(a: PassAction) {
    setMapEdit(true);
    if (!pending) return;
    const pts = tourPlan.pts;
    // Pass, der schon Zwischenziel ist: als Start oder Ziel umsetzen statt ein zweites Mal hinzufügen
    const at = pending.pass ? passIndex(pts, pending.pass) : -1;
    if ((a === 'start' || a === 'ziel') && tourPlan.complete && at > 0 && at < pts.length - 1) {
      viaFromMap(at, a);
      setPending(null);
      return;
    }
    if (a === 'remove' && pending.pass) {
      const i = passIndex(pts, pending.pass);
      if (tourPlan.start && i === 0) tourPlan.removeStart(profile, avoid);
      else if (tourPlan.ziel && i === pts.length - 1) tourPlan.removeZiel(profile, avoid);
      else if (i >= 0) tourPlan.removeVia(i - (tourPlan.start ? 1 : 0), profile, avoid);
    } else if (a === 'via' && !tourPlan.complete) {
      // ausdrücklich als Zwischenziel gewählt, auch wenn Start oder Ziel noch fehlen (Koray 18.11.)
      tourPlan.setSlot('via', pending.p, profile, avoid, pending.name ?? undefined);
    } else if (a !== 'remove') tourPlan.add(a, pending.p, profile, avoid, pending.name ?? undefined);
    setPending(null);
  }

  const live = usePassLive();
  const passOverlay = inTour && pending?.pass ? pending.pass : null;
  /** Pass oder neuer Punkt nach langem Druck: dieselbe schwebende Karte (Koray 18.11.) */
  const placeOverlay = inTour ? pending : null;
  const passRoleIdx = passOverlay ? passIndex(tourPts, passOverlay) : -1;
  const passRole =
    passRoleIdx < 0 ? null : passRoleIdx === 0 ? 'Start' : passRoleIdx === tourPts.length - 1 && tourPlan.complete ? tr('Ziel') : tr('Zwischenziel {passRoleIdx}', { passRoleIdx });

  function onMapLongPress(p: LatLon) {
    haptic('punkt');
    // Punkt auf der Karte: der Ausschnitt bleibt, wo du gerade bist (nicht zum Ziel springen)
    setMapEdit(true);
    // Blatt auf die kleinste Höhe wie beim Pass (Koray 18.11.): mehr Platz für Karte und Auswahl
    workOnMap();
    // Die Wahl schwebt über der Karte wie beim Pass (Koray 18.11.), das Blatt bleibt, wo es ist
    setSelVia(null);
    setPending({ p, name: null });
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
      {liveEdit && view.kind === 'form' && !scan ? (
        <AppText variant="display" style={styles.headline} accessibilityRole="header">
          {tr('Tour anpassen')}
        </AppText>
      ) : view.kind === 'form' && !scan ? (
        <TypoTabs
          value={mode === 'tour' ? 'route' : 'runde'}
          options={[
            // Namen wie bei calimoto, Tour planen zuerst (Koray 8.11.)
            { id: 'route', label: tr('Tour planen') },
            { id: 'runde', label: tr('Rundtour') },
          ]}
          onChange={(v) => switchMode(v === 'route' ? 'tour' : lastRunde.current)}
        />
      ) : view.kind === 'result' ? (
        <AppText variant="display" style={styles.headline} numberOfLines={2} accessibilityRole="header">
          {view.tour.name}
        </AppText>
      ) : (
        // Beim Erstellen steht nur der Schritt im Kopf, ohne Tour wird erstellt darüber (Koray 9.11.)
        view.kind === 'error' ? <AppText variant="label">{tr('Das hat nicht geklappt')}</AppText> : null
      )}
      {scan ? (
        <View style={styles.workBox}>
          {/* Balken über Name und Abbrechen (Koray 12.11.) */}
          <ProgressBar step={phaseIndex(tourPlan.step ?? 'route')} expectMs={8000} />
          <View style={styles.summary}>
            <AppText variant="title" style={styles.flex} numberOfLines={1}>
              {`${tourPlan.names[keyOf(tourPlan.pts[0])] ?? 'Start'} nach ${tourPlan.names[keyOf(tourPlan.pts[tourPlan.pts.length - 1])] ?? tr('Ziel')}`}
            </AppText>
            <Pressable accessibilityRole="button" onPress={tourPlan.cancel} hitSlop={4} style={({ pressed }) => [styles.cancelChip, pressed && styles.pressedDim]}>
              <AppText style={styles.cancelText}>{tr('Abbrechen')}</AppText>
            </Pressable>
          </View>
        </View>
      ) : view.kind === 'working' ? (
        <View style={styles.workBox}>
          {/* Balken mit Prozent statt Logo (Koray 8.11.) */}
          <ProgressBar step={phaseIndex(view.phase)} expectMs={12000} done={radar?.phase === 'aufloesen'} doneMs={REVEAL_MS - 300} />
          <View style={styles.summary}>
            {rolling && radar?.phase !== 'aufloesen' && <DiceTip />}
            <AppText variant="title" style={styles.flex} numberOfLines={1}>
              {radar?.phase === 'aufloesen' ? tr('Fertig') : `Rundtour, ${roundKm} km`}
            </AppText>
            <Pressable accessibilityRole="button" onPress={cancel} hitSlop={4} style={({ pressed }) => [styles.cancelChip, pressed && styles.pressedDim]}>
              <AppText style={styles.cancelText}>{tr('Abbrechen')}</AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.hintRow}>
        {view.kind === 'result' && diceShow && <DiceTip />}
        <AppText variant="caption" muted numberOfLines={2} style={[styles.summaryHint, styles.flex]}>
          {view.kind === 'error'
            ? ''
            : view.kind === 'result'
              ? `${PROFILE_WORD[view.req.profile]}, ${view.req.towardName ? tr('Richtung {towardName}', { towardName: view.req.towardName }) : dirPhrase(view.req.direction)}${roundStops.length ? tr(', mit {length} {v1}', { length: roundStops.length, v1: roundStops.length === 1 ? tr('Stopp') : tr('Stopps') }) : ''}`
              : mode === 'tour'
                ? tourPts.length
                  ? tr('Lange drücken setzt einen Punkt, Punkte halten und ziehen.')
                  : tr('Start, Ziel und Zwischenziele frei setzen.')
                : mode === 'beschreiben'
                  ? tr('Beschreib deine Runde in einem Satz, wir planen sie.')
                  : tr('Länge und Richtung wählen, zurück geht es zum Start ({v0}).', { v0: picked?.name ?? here?.name ?? 'dein Standort' })}
        </AppText>
        </View>
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
          onAvoid={() => {
            // Auslassen in der Rundtour (13.11.): dieselbe Anfrage neu planen, der Pass ist dann gesperrt
            const req = view.req;
            void run(async () => req, lastStops.current);
          }}
          fun={resultFun}
          funDelta={funDelta}
          onFun={() => setFunOpen(true)}
          rolls={rolls.length > 1 ? rolls.map((r) => r.fun) : []}
          rollIdx={rollIdx}
          onPickRoll={(i) => {
            const r = rolls[i];
            if (r) setView({ kind: 'result', tour: r.tour, req: r.req, stops: r.stops });
          }}
          onBack={(saved) => {
            // Drei Runden gesehen, nichts gespeichert: einmal freundlich nachfragen (Koray 16.11.)
            const seen = rolls.map((r) => ({ tour: r.tour, req: r.req }));
            setView({ kind: 'form' });
            if (!saved && seen.length >= ASK_AFTER_ROLLS) {
              setTimeout(() => {
                void mayAsk().then((ok) => {
                  if (ok) setAskRounds(seen);
                });
              }, ASK_DELAY_MS + SHEET_GONE_MS);
            }
          }}
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
          liveEdit={liveEdit}
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
          onListEdit={() => {
            setMapEdit(false);
    onMap.current = false;
            onMap.current = false;
          }}
          onShowPoint={(p) => {
            setMapEdit(true);
            setDetent(0);
            setFlyTo((f) => ({ p, n: (f?.n ?? 0) + 1 }));
          }}
        />
      ) : mode === 'beschreiben' ? (
        <>
          <View style={styles.inputCard}>
            <TextInput maxFontSizeMultiplier={1.2}
              value={text}
              onChangeText={setText}
              placeholder={tr('Was willst du erleben?')}
              placeholderTextColor={Colors.muted}
              multiline
              onFocus={expand}
              style={styles.freeText}
              accessibilityLabel={tr('Tourwunsch')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('Spracheingabe')}
              onPress={() => setMicHint((v) => !v)}
              style={styles.mic}>
              <MicIcon />
            </Pressable>
          </View>
          {micHint && (
            <AppText variant="caption" muted>
              {tr('Spracheingabe folgt bald. Bis dahin einfach tippen, zum Beispiel: 2 Stunden kurvig in den Schwarzwald mit Kaffee.')}
            </AppText>
          )}

          <Section label={tr('Fahrzeit')}>
            <View style={styles.durRow}>
              {DURATIONS.map((d) => {
                const active = eff.minutes === d.minutes && !eff.km;
                return (
                  <Pressable
                    key={d.minutes}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={d.unit === 'Tag' ? (d.big === '½' ? tr('Halber Tag') : tr('Tag')) : `${d.big} Stunden`}
                    onPress={() => setOver((o) => ({ ...o, minutes: active ? null : d.minutes }))}
                    style={[styles.durTile, active && styles.tileOn]}>
                    <AppText style={[styles.durBig, active && styles.onSignal]}>{d.big}</AppText>
                    <AppText variant="caption" style={active ? styles.onSignal : styles.mutedText}>
                      {d.unit === 'Tag' && d.big === '½' ? tr('Halber Tag') : d.unit}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section label={tr('Fahrstil')}>
            <ChipRow>
              {STYLE_PROFILES.map((id) => (
                <Chip
                  key={id}
                  label={PROFILES.find((p) => p.id === id)!.label}
                  active={eff.profile === id}
                  onPress={() => setOver((o) => ({ ...o, profile: id }))}
                />
              ))}
            </ChipRow>
          </Section>

          <Section label={tr('Richtung')}>
            <ChipRow>
              {eff.towardName && <Chip label={eff.towardName} active onPress={() => setOver((o) => ({ ...o, direction: 'zufall' }))} />}
              <Chip
                label={tr('Zufall')}
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
            </ChipRow>
          </Section>

          <Section label={tr('Stopps')}>
            <ChipRow>
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
            </ChipRow>
          </Section>

          <VehiclePick />

          <View style={styles.understood}>
            <View style={styles.dot} />
            <View style={styles.flex}>
              <AppText variant="label" style={styles.goodText}>{tr('Verstanden')}</AppText>
              <AppText>{understoodSentence(eff)}</AppText>
            </View>
          </View>

          <View style={styles.gapS}>
            <PrimaryButton label={tr('Tour erstellen')} onPress={createFromWish} />
            <AppText variant="caption" muted>
              {tr('Stopps werden bald eingeplant, heute zeigen wir sie nur an.')}
            </AppText>
          </View>
        </>
      ) : (
        <>
          <Section label={tr('Start')}>
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
                  <AppText variant="title">{tr('Aktueller Standort')}</AppText>
                  <AppText variant="caption" muted>
                    {locating ? tr('Standort wird bestimmt') : here ? here.name : locError ? locError.message: tr('Wird beim Start bestimmt')}
                  </AppText>
                </View>
                {locating && <ActivityIndicator color={Colors.muted} />}
              </Pressable>
              {locError && !picked && (
                <View style={styles.wrap}>
                  {locError.kind === 'permission' || locError.kind === 'services' ? (
                    <Chip label={tr('Einstellungen öffnen')} active={false} onSurface onPress={() => void Linking.openSettings()} />
                  ) : null}
                  <Chip label={tr('Nochmal versuchen')} active={false} onSurface onPress={() => void findHere()} />
                </View>
              )}
              {picked && (
                <View style={styles.startRow}>
                  <Radio on />
                  <View style={styles.flex}>
                    <AppText variant="title">{picked.name}</AppText>
                    <AppText variant="caption" muted>{tr('Gewählter Ort')}</AppText>
                  </View>
                </View>
              )}
              <Pressable accessibilityRole="button" onPress={() => setShowSearch(true)} style={styles.linkBtn}>
                <AppText style={styles.linkText}>{tr('Anderen Startort wählen')}</AppText>
              </Pressable>
              <PlaceSearch
                visible={showSearch}
                role={tr('Start der Runde')}
                placeholder={tr('Wo geht es los?')}
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

          <Section label={tr('Wie lang?')}>
            <View style={styles.card}>
              <ChipGroup style={styles.wrap}>
                <Chip label={tr('Strecke')} active={lengthBy === 'km'} onSurface onPress={() => setLengthBy('km')} />
                <Chip label={tr('Fahrzeit')} active={lengthBy === 'dauer'} onSurface onPress={() => setLengthBy('dauer')} />
              </ChipGroup>
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
                    {lengthBy === 'km' ? 'km' : tr('etwa {roundKm} km', { roundKm })}
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

          <Section label={tr('Richtung')}>
            <DirectionDial value={direction} onChange={setDirection} onDragChange={setDragging} />
          </Section>

          {PROFILE_CHOICES.length > 1 && (
            <Section label={tr('Profil')}>
              <ChipRow>
                {PROFILE_CHOICES.map((p) => (
                  <Chip key={p.id} label={p.label} active={profile === p.id} onPress={() => setProfile(p.id)} />
                ))}
              </ChipRow>
            </Section>
          )}

          <Accordion label={tr('Vermeiden')} summary={avoidSummary(avoid)}>
            <View style={styles.card}>
              <Toggle
                label={tr('Gesperrte Straßen')}
                note={tr('Wir planen um gesperrte Straßen herum.')}
                value={avoid.closures}
                onChange={(v) => setAvoid((a) => ({ ...a, closures: v }))}
              />
              <Toggle label={tr('Fähren')} value={avoid.ferries} onChange={(v) => setAvoid((a) => ({ ...a, ferries: v }))} />
              <Toggle label={tr('Maut')} value={avoid.tolls} onChange={(v) => setAvoid((a) => ({ ...a, tolls: v }))} />
              <Toggle
                label={tr('Rauer Belag')}
                note={tr('Kopfsteinpflaster und schlechter Asphalt.')}
                value={avoid.rough}
                onChange={(v) => setAvoid((a) => ({ ...a, rough: v }))}
              />
            </View>
          </Accordion>

          <PrimaryButton label={tr('Tour erstellen')} onPress={createRoundTrip} />
        </>
      )}
    </>
    );
  }

  // Zurück zur Herkunft (Koray 10.11., Muster Instagram): Pille oben links, Wischen vom linken Rand,
  // Rückfrage nur, wenn die geöffnete Tour wirklich verändert wurde
  const origin = useEditOrigin();
  const [askKeep, setAskKeep] = useState(false);
  const win = useWindowDimensions();
  const swipeX = useSharedValue(0);
  /** Planer aufräumen und zur Herkunft wechseln; danach ist Planen wieder im normalen Zustand */
  const leave = () => {
    const o = origin;
    dropNextRoll();
    abort.current?.abort();
    setAskKeep(false);
    setPending(null);
    setMapEdit(false);
    setView({ kind: 'form' });
    setMode('tour');
    setDetent(1);
    tourPlan.reset();
    if (o) router.navigate(o.href);
    // erst nach dem Tabwechsel zurückschieben, sonst blitzt der Planer kurz auf
    setTimeout(() => swipeX.set(0), 300);
  };
  // Kurven erst beim Speichern zählen: bei langen Touren kostete das vorher jedes Rendern (Prüfung 11.11.)
  const backCurvesNow = () => (routeTour ? countCurves(flatten(routeTour).map((x) => x.p)) : 0);
  const backProfile = tourPlan.legProfile(tourPlan.start ? 0 : 1, profile);
  const keepAndLeave = async (asCopy: boolean) => {
    const id = await tourPlan.save(backCurvesNow(), backProfile, avoid, undefined, asCopy ? { asCopy: true } : undefined);
    if (id) leave();
  };
  /** swiped: die Randgeste hat den Planer schon zur Seite gezogen, er gleitet dann ganz hinaus */
  // Wischen vom Rand entfernt (Koray 10.11.), zurück nur über die Pille
  const goBack = (swiped = false) => {
    if (tourPlan.changed) {
      swipeX.set(withSpring(0, Motion.snap));
      setAskKeep(true);
      return;
    }
    if (swiped) swipeX.set(withTiming(win.width, { duration: 160 }, (done) => done && scheduleOnRN(leave)));
    else leave();
  };
  // Tippt man in der Navigation auf Fertig, läuft derselbe Ablauf (navigation.tsx); nach jedem Rendern der aktuelle Stand
  useEffect(() => {
    setEditBackHandler(() => goBack());
  });
  useEffect(() => () => setEditBackHandler(null), []);
  const chipTop = insets.top + Spacing.s + (origin ? BACK_PILL_H + Spacing.s : 0);

  return (
    <>
    <View style={{ flex: 1 }}>
    <MapSheet
      detent={detent}
      onDetentChange={setDetent}
      scrollRef={scroll}
      lockScroll={dragging}
      grabberLabel={tr('Planer Höhe ändern')}
      hideBody={!!scan}
      // Beim Rechnen ist nur der Kopf zu sehen; Abstand zur Tab Leiste halbiert (Koray 17.11.: etwa 98 pt, wirkte unten zu leer)
      smallTrim={scan || view.kind === 'working' ? 73 : 0}
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
          onPressPin={inTour ? onPinPress : undefined}
          onDragPoint={inTour && tourPlan.complete ? onDragPoint : undefined}
          onDragStart={inTour ? workOnMap : undefined}
          onLongPressLine={inTour && tourPlan.complete && routeTour ? onLongPressLine : undefined}
          stale={busyEdit && !dimSpans}
          lineMotion={busyEdit ? (dimSpans?.length ? { mode: 'dim', spans: dimSpans, key: JSON.stringify(dimSpans) } : null) : grow}
          onPressMap={placeOverlay || selVia != null ? () => {
            setPending(null);
            setSelVia(null);
          } : undefined}
          overlayTop={origin ? BACK_PILL_H + Spacing.s : 0}
          pickedPassIds={inTour ? pickedPassIds : undefined}
          selectedPassId={passOverlay?.id ?? null}
          selectedPinId={inTour && selVia != null && !placeOverlay ? (pins?.[selVia]?.id ?? null) : null}
          // Kompass unter den Karteneinstellungen, nur solange das Blatt höchstens auf Mitte steht (Koray 16.11.)
          compassTop={detent <= 1 ? insets.top + Spacing.s + 48 + Spacing.s : null}
          // Pass oder Wegpunkt Aktionen schweben über dem Apple Logo: das Logo darüber setzen. Der Abstand zählt ab
          // Unterkante der Karte (MapKit setzt das Logo dann fest, ohne mapPadding), die Aktionen sind etwa 130 pt hoch
          legalBottom={passOverlay || selVia != null ? covered + 140 : null}
          flyTo={inTour ? flyTo : null}
          radar={view.kind === 'working' ? radar : null}
          scan={scan}
          // MapKit rechnet die Safe Area selbst dazu; ohne Abzug schwebt der Hinweis Apple Karten über dem Blatt
          mapPadding={{ top: 0, right: 0, bottom: Math.max(0, covered - insets.bottom), left: 0 }}
          edgePadding={{ top: insets.top + Spacing.xxxl, right: Spacing.xxxl, bottom: Spacing.xl + insets.bottom, left: Spacing.xxxl }}
          style={StyleSheet.absoluteFill}
        />
          <MapLayersButton style={[styles.layersBtn, { top: insets.top + Spacing.s }]} />
          {/* Während eine gezogene Strecke neu gerechnet wird, steht oben links der Ladehinweis statt der Zurück Pille */}
          <BackPill
            label={origin?.label}
            top={insets.top + Spacing.s}
            onPress={() => goBack()}
            onUndo={inTour && tourPlan.canUndo ? () => tourPlan.undo() : null}
            status={
              adjustBusy
                ? { kind: 'busy', text: tr('Strecke wird angepasst') }
                : listBusy
                  ? { kind: 'busy', text: listPill ?? tr('Route wird berechnet') }
                : adjustDone
                  ? {
                      kind: 'done',
                      text: adjustDone.text,
                      tone: adjustDone.tone,
                      onUndo: () => {
                        tourPlan.restore(adjustDone.snap);
                        setAdjustDone(null);
                      },
                    }
                  : null
            }
          />
          {/* Was gerade passiert, links oben neben den Karteneinstellungen (Koray 9.11.); mit Zurück Pille darunter */}
          {scan && tourPlan.step && pill && <ScanChip top={chipTop} text={pill} />}
          {view.kind === 'working' &&
            (radar?.phase === 'aufloesen' ? (
              <RadarChip key="aufloesen" count={radar.count} found={radar.roads.length} top={chipTop} />
            ) : (
              pill && <ScanChip top={chipTop} text={pill} />
            ))}
          {inTour && selVia != null && !placeOverlay && tourPts.slice(1, -1)[selVia] && (
            <MapPointActions
              label={String(selVia + 1)}
              name={tourPlan.names[keyOf(tourPts.slice(1, -1)[selVia])] ?? tr('Zwischenziel {v0}', { v0: selVia + 1 })}
              role={tr('Zwischenziel {v0}', { v0: selVia + 1 })}
              bottom={covered + Spacing.m}
              onRemove={() => {
                setMapEdit(true);
                tourPlan.removeVia(selVia, profile, avoid);
                setSelVia(null);
              }}
              onStart={() => viaFromMap(selVia + 1, 'start')}
              onZiel={() => viaFromMap(selVia + 1, 'ziel')}
            />
          )}
          {placeOverlay && (
            <MapPassActions
              pass={passOverlay}
              name={placeOverlay.name ?? tr('Neuer Punkt')}
              note={passOverlay ? passSummary(passOverlay, undefined, passState(passOverlay, live).note) : undefined}
              role={passRole}
              isVia={passRoleIdx > 0 && passRoleIdx < tourPts.length - 1}
              hasStart={!!tourPlan.start}
              detourKm={tourPlan.complete && passRole == null ? roughDetourKm(tourPts, passOverlay ? passPoint(passOverlay) : placeOverlay.p) : null}
              bottom={covered + Spacing.m}
              onAction={onPassAction}
            />
          )}
        </>
      )}>
      {body}
    </MapSheet>
      {/* Tour anpassen ist ein modaler Bildschirm: eigener Toast, sonst unsichtbar (Audit 18.11.) */}
      {liveEdit && <ToastHost />}
    </View>
    <AskFeedbackSheet rounds={askRounds} onDone={() => setAskRounds(null)} />
    <ActionSheet
      visible={!!lengthChoice}
      title={lengthChoice ? choiceText(lengthChoice.loop, lengthChoice.want).title : undefined}
      subtitle={lengthChoice ? choiceText(lengthChoice.loop, lengthChoice.want).subtitle : undefined}
      onClose={() => setLengthChoice(null)}
      items={lengthChoice?.items ?? []}
    />
    <ActionSheet
      visible={askKeep}
      title={tr('Änderungen behalten?')}
      subtitle={tr('Du hast {v0} verändert.', { v0: tourPlan.name.trim() || 'die Tour' })}
      onClose={() => setAskKeep(false)}
      items={[
        ...(routeTour
          ? [
              // Gleiche Zeilen wie die Rückfrage beim Speichern, ohne orange Taste (Koray 16.11.)
              tourPlan.cloudId
                ? { key: 'save', icon: 'checkmark' as const, label: tr('Aktuelle Tour überschreiben'), busy: tourPlan.saving, onPress: () => void keepAndLeave(false) }
                : { key: 'save', icon: 'checkmark' as const, label: tr('Speichern'), busy: tourPlan.saving, onPress: () => void keepAndLeave(false) },
              // Ungespeicherte Kopie (Community): Speichern legt ohnehin eine neue Tour an
              ...(tourPlan.cloudId ? [{ key: 'copy', icon: 'plus' as const, label: tr('Als neue Tour speichern'), onPress: () => void keepAndLeave(true) }] : []),
            ]
          : []),
        { key: 'discard', icon: 'arrow.uturn.backward' as const, label: tr('Änderungen verwerfen'), danger: true, onPress: leave },
      ]}
    />
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
