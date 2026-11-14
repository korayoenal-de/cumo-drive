/**
 * Navigationsscreen: Karte vollflächig, oben das nächste Manöver, unten Ankunft und Steuerung.
 * Läuft außerhalb der Tabs im Vollbild. Die Logik kommt aus useNavigation (src/lib/navigation).
 */
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/route-map';
import { formatClock, formatDistance } from '@/components/navigation/format';
import { soonThresholdM, symbolFor } from '@/components/navigation/maneuver-geometry';
import { DriveRatingCard, type DrivenHighlight } from '@/components/navigation/drive-rating';
import { SpeedBadge } from '@/components/navigation/speed-badge';
import { FunkBanner, HighlightCard, HighlightStrip, LeadHaltPill, StopAlert } from '@/components/navigation/nav-alerts';
import { BigButton, BottomBar, InfoCard, LANES_SHOW_M, laneSymbol, ManeuverCard, Recalculating } from '@/components/navigation/nav-panels';
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { useActiveTour } from '@/lib/active-tour';
import { getEditOrigin, requestEditBack } from '@/lib/edit-tour';
import { PACE_NOTES_RELEASED, useDriveSettings } from '@/lib/drive-settings';
import { showToast } from '@/lib/toast';
import { carPlayAlert, carPlayAskRating, carPlayHint, carPlaySetGroup, carPlaySetMenu, carPlayCamera, carPlayHasRejoin, carPlayTrims, carPlaySetGuide, carPlaySetRejoin, carPlaySetVoice, carPlayStart, carPlayStop, carPlayUpdate, takeCarPlayStart, useCarPlayEvent } from '@/lib/carplay';
import { roundaboutTurn } from '@/lib/navigation/roundabout';
import { toFunLevel } from '@/components/ui/fun-gauge';
import { endAllNavActivities, endNavActivity, showNavActivity, symbolForKind } from '@/live/nav-live';
import { useSession } from '@/lib/auth';
import { saveDrive, sendNavReport } from '@/lib/drives';
import { bbLog, bbSnapshot } from '@/lib/navigation/blackbox';
import { haptic } from '@/lib/haptics';
import { useNavigation } from '@/lib/navigation';
import { feedbackKey } from '@/lib/highlight-feedback';
import { curveCue, sharpCurves } from '@/lib/navigation/curves';
import { leadKm, paceNotes, paceText } from '@/lib/navigation/pace-notes';
import { reportEta, sharingFor } from '@/lib/ride-day';
import { closureLabel, closuresNear, closuresOnRoute } from '@/lib/road-closures';
import { limitAt, loadSpeedZones, shownLimitAt, type SpeedZones } from '@/lib/navigation/speed-zones';
import { findHighlights, highlightSpeech, type Highlight } from '@/lib/navigation/highlights';
import { warnLabel } from '@/lib/passes';
import { predictPosition } from '@/lib/group/predict';
import type { NavEntry, NavRequest, NavRoute } from '@/lib/navigation/types';
import Animated, { FadeOut } from 'react-native-reanimated';
import { softEnter } from '@/components/ui/motion';
import { elevationProfile } from '@/lib/stats';
import { connectFunk, disconnectFunk, pushToTalk, setFunkListen, setOnlyLead, useFunk } from '@/lib/group/funk';
import { announceStop, clearStop, QUICK_MESSAGES, sendMessage, sendPosition, setOwnRoute, STOP_REASONS, useRide } from '@/lib/group/ride';
import { currentVehicle, useVehicles } from '@/lib/vehicle';
import { VehiclePick } from '@/components/navigation/vehicle-pick';
import { fmtG, rideStats, type RideStats, type Sample } from '@/lib/ride-stats';
import { flatten, formatKm, haversine, type LatLon, type Tour } from '@/lib/tour';

/** So lange ersetzt die Highlight Ansage die Routenführung */
const HL_SHOW_MS = 5000;
/** Ab dieser Entfernung zeigt CarPlay das Manöversymbol in Signal Orange (statt der Animation auf dem iPhone) */
const CP_SOON_M = 200;
/** Ab so viel Abstand zur Route gilt man auf dem Autodisplay als abseits (wie in der App) */
const CP_OFF_M = 60;

export default function NavigationScreen() {
  useKeepAwake();
  const active = useActiveTour();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [secret, setSecret] = useState(false);
  const showSim = __DEV__ || secret;

  const [entry, setEntry] = useState<NavEntry>('einsteigen');
  // Abstand zum Tourstart vorab, damit bei weiter Anreise die passende Wahl vorgeschlagen wird
  const [here, setHere] = useState<LatLon | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const p =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      if (alive && p) setHere([p.coords.latitude, p.coords.longitude]);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const toStartKm = useMemo(() => {
    const first = active ? flatten(active.tour)[0]?.p : undefined;
    return here && first ? haversine(here, first) / 1000 : null;
  }, [here, active]);
  const far = toStartKm != null && toStartKm > 30;
  const [entryTouched, setEntryTouched] = useState(false);
  // weit weg: über den Startpunkt in die ganze Tour (nur zum Start navigieren ist kein Anwendungsfall, Koray 6.11.)
  const effEntry: NavEntry = entryTouched ? entry : far ? 'start' : entry;
  const req = useMemo<NavRequest | null>(
    () =>
      active
        ? {
            tour: active.tour,
            profile: active.profile,
            avoid: active.avoid,
            entry: effEntry,
          }
        : null,
    [active, effEntry],
  );
  const [state, controls] = useNavigation(req);
  const ride = useRide();
  const vehicles = useVehicles();
  const inRide = ride.status === 'aktiv';
  // Gruppen Bedienung nur, wenn wirklich jemand mitfährt (Tester Gregor 10.11.: allein gefahren, trotzdem Kurznachrichten)
  const withOthers = inRide && ride.members.some((m) => m.id !== ride.me?.id);
  // In der Gruppe plant die App nie von selbst neu, nur auf Wunsch (Koray 11.11.)
  const { setAutoFresh } = controls;
  useEffect(() => {
    setAutoFresh(!withOthers);
  }, [setAutoFresh, withOthers]);
  const [ownRoute, setOwnRouteState] = useState(false);
  const [confirmOwn, setConfirmOwn] = useState(false);
  // Funk der Gruppenfahrt: verbinden, solange die Fahrt aktiv ist (nur Fahrten mit ID, nicht alte Fahrtcodes)
  useEffect(() => {
    if (inRide && ride.rideId) void connectFunk(ride.rideId, ride.myRole === 'lead');
    else void disconnectFunk();
  }, [inRide, ride.rideId, ride.myRole]);
  useEffect(() => () => void disconnectFunk(), []);
  const [msgOpen, setMsgOpen] = useState(false);
  const funk = useFunk();
  const driveSettings = useDriveSettings();
  // Karte "Zwischenziel überspringen" nach langem Druck auf das Manöver, schließt nach 6 s von selbst
  const [skipOpen, setSkipOpen] = useState(false);
  // Planung ansehen (Koray 8.11.): Karte zeigt kurz die ganze restliche Route, dazu die Ziele
  const [overview, setOverview] = useState(0);
  useEffect(() => {
    if (!overview) return;
    const t = setTimeout(() => setOverview(0), 12000);
    return () => clearTimeout(t);
  }, [overview]);
  useEffect(() => {
    if (!skipOpen) return;
    const t = setTimeout(() => setSkipOpen(false), 6000);
    return () => clearTimeout(t);
  }, [skipOpen]);
  // Position der Navigation (auch simuliert) an die Gruppe geben
  useEffect(() => {
    if (!inRide || !state.position) return;
    const r = state.route;
    const backKm = r?.rejoinIndex != null && state.remainingKm != null ? r.cumKm[r.rejoinIndex] - (r.km - state.remainingKm) : 0;
    sendPosition(state.position, state.heading, state.speedKmh, (state.offRouteM ?? 0) > 60 || backKm > 0.02);
  }, [inRide, state.position, state.heading, state.speedKmh, state.offRouteM, state.route, state.remainingKm]);
  const others = useMemo(
    () =>
      ride.members
        .filter((m) => m.id !== ride.me?.id && m.p)
        .map((m) => ({
          id: m.id,
          p: m.p!,
          name: m.name,
          role: m.role,
          stale: !m.seenAt,
          off: m.off,
          own: m.own,
          heading: m.heading,
          speedKmh: m.speedKmh,
          seenAt: m.seenAt,
        })),
    [ride.members, ride.me?.id],
  );
  // Highlights (Pässe) entlang der Route: mit Höhenprofil für Anfang und Ende des Abschnitts
  const [hl, setHl] = useState<{ route: NavRoute; list: Highlight[] } | null>(null);
  useEffect(() => {
    const r = state.route;
    if (!r) return;
    const ctrl = new AbortController();
    elevationProfile(r.shape, ctrl.signal)
      .then((e) => setHl({ route: r, list: findHighlights(r.shape, r.cumKm, e) }))
      .catch(() => {
        if (!ctrl.signal.aborted) setHl({ route: r, list: findHighlights(r.shape, r.cumKm, null) });
      });
    return () => ctrl.abort();
  }, [state.route]);
  const atKm = state.route && state.remainingKm != null ? state.route.km - state.remainingKm : null;
  const nextHl =
    hl && hl.route === state.route && atKm != null ? (hl.list.find((h) => atKm >= h.startKm - 1 && atKm <= h.startKm + 0.3) ?? null) : null;
  const hlDistM = nextHl && atKm != null ? (nextHl.startKm - atKm) * 1000 : 0;
  const saidHl = useRef(new Set<string>());
  // Zeit der letzten Highlight Ansage: die Kurvenansage wartet kurz, damit beides nicht übereinander spricht
  const hlSaidAt = useRef(0);
  // Ankündigung tauscht für 5 s den Platz der Routenführung (Konzept Highlight Ansage, 7.11.)
  const [hlShow, setHlShow] = useState<{ id: string; until: number } | null>(null);
  // Gefahrene Highlights für die Bewertung nach der Fahrt: Anteil je Highlight, der wirklich gefahren wurde
  // (kleinster und größter Anteil, an dem man drin war; Ids bleiben bei Neuberechnung gleich)
  const hlSeen = useRef(new Map<string, { name: string; kind: Highlight['kind']; lo: number; hi: number }>());
  useEffect(() => {
    if (!hl || hl.route !== state.route || atKm == null || state.status !== 'laeuft') return;
    for (const h of hl.list) {
      const len = h.endKm - h.startKm;
      if (len <= 0 || atKm < h.startKm || atKm > h.endKm) continue;
      const f = (atKm - h.startKm) / len;
      const key = feedbackKey(h.id);
      const cur = hlSeen.current.get(key);
      hlSeen.current.set(key, cur ? { ...cur, lo: Math.min(cur.lo, f), hi: Math.max(cur.hi, f) } : { name: h.name, kind: h.kind, lo: f, hi: f });
    }
  }, [hl, state.route, atKm, state.status]);
  const [driven, setDriven] = useState<DrivenHighlight[]>([]);
  const drivenHighlights = (): DrivenHighlight[] =>
    [...hlSeen.current.entries()]
      .filter(([, v]) => v.hi - v.lo >= 0.7)
      .map(([key, v]) => ({ key, name: v.name, kind: v.kind === 'pass' ? ('pass' as const) : ('strecke' as const) }));
  useEffect(() => {
    if (!hlShow) return;
    const t = setTimeout(() => setHlShow(null), Math.max(0, hlShow.until - Date.now()));
    return () => clearTimeout(t);
  }, [hlShow]);
  // Highlight, auf dem du gerade fährst: Hinweiszeile in der Routenführung
  const onHl = hl && hl.route === state.route && atKm != null ? (hl.list.find((h) => atKm >= h.startKm && atKm <= h.endKm) ?? null) : null;
  useEffect(() => {
    if (!nextHl || state.status !== 'laeuft' || hlDistM > 650 || saidHl.current.has(nextHl.id)) return;
    saidHl.current.add(nextHl.id);
    hlSaidAt.current = Date.now();
    setHlShow({ id: nextHl.id, until: Date.now() + HL_SHOW_MS });
    controls.say(highlightSpeech(nextHl, hlDistM));
    const len = Math.max(1, Math.round(nextHl.endKm - nextHl.startKm));
    const where = hlDistM > 150 ? `In ${Math.round(hlDistM / 100) * 100} m` : 'Jetzt';
    // CarPlay: Warnung als erstes Wort der Unterzeile, Text wie am Telefon (Konzept 12.11.)
    const warn = warnLabel(nextHl.warn);
    carPlayAlert(nextHl.name, `${warn ? `${warn} · ` : ''}${where}, ${len} km${nextHl.hairpins >= 3 ? `, ${nextHl.hairpins} Kehren` : ''}`, `fun-${toFunLevel(nextHl.level)}`);
  }, [nextHl, hlDistM, state.status, controls]);

  // Halt Ansage der Lead: großes Overlay und Ansage für alle anderen
  const stop = inRide ? ride.stop : null;
  const myStop = !!stop && stop.from === ride.me?.id;
  const stopDistM = stop?.p && state.position ? haversine(state.position, stop.p) : null;
  const saidStop = useRef<string | null>(null);
  useEffect(() => {
    if (!stop || myStop || saidStop.current === stop.id) return;
    saidStop.current = stop.id;
    const r = STOP_REASONS.find((x) => x.id === stop.reason) ?? STOP_REASONS[0];
    controls.say(`Achtung. ${r.title}. Bitte gleich anhalten.`);
  }, [stop, myStop, controls]);
  // angekommen: Overlay nach einer Minute am Haltepunkt von selbst weg
  useEffect(() => {
    if (!stop || myStop || stopDistM == null || stopDistM > 60) return;
    const id = setTimeout(() => clearStop(false), 60000);
    return () => clearTimeout(id);
  }, [stop, myStop, stopDistM]);


  // Restkilometer beim Start, daraus ergeben sich am Ende die gefahrenen km
  const [startKm, setStartKm] = useState<number | null>(null);
  if (state.status === 'laeuft' && startKm == null && state.remainingKm != null) setStartKm(state.remainingKm);
  // Beginn der Fahrt für den Schnitt (erste Position im Fahrbetrieb)
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (state.status !== 'laeuft' || startedAt != null) return;
    const id = setTimeout(() => setStartedAt(Date.now()), 0);
    return () => clearTimeout(id);
  }, [state.status, startedAt]);

  // Tempolimits entlang der Route: die Kurvenwarnung gilt nur in Zonen ab 70 km/h
  const [zones, setZones] = useState<{ route: NavRoute; z: SpeedZones } | null>(null);
  useEffect(() => {
    const r = state.route;
    if (!r) return;
    const ctrl = new AbortController();
    loadSpeedZones(r.shape, (z) => !ctrl.signal.aborted && setZones({ route: r, z }), ctrl.signal).catch(() => {});
    return () => ctrl.abort();
  }, [state.route]);

  // Kurven, die man stark anbremsen muss (ohne Abbiegungen, die sind Manöver), für das Label 150 m vorher
  const curves = useMemo(() => (state.route ? sharpCurves(state.route.shape, state.route.maneuvers.map((m) => m.km)) : []), [state.route]);

  // Zwischenziele der Tour als km auf der Route, für "bis zum nächsten Punkt"
  const viaKms = useMemo(() => {
    const r = state.route;
    const wp = active?.tour.wegpunkte ?? [];
    if (!r || wp.length < 3) return [];
    const out: number[] = [];
    let from = 0;
    for (const w of wp.slice(1, -1)) {
      let best = from;
      let bd = Infinity;
      for (let i = from; i < r.shape.length; i++) {
        const d = haversine(w, r.shape[i]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd < 500) {
        out.push(r.cumKm[best]);
        from = best;
      }
    }
    return out;
  }, [state.route, active]);

  // Richtung beim Verlassen jedes Kreisverkehrs (die Ausfahrt Nummer allein kann täuschen)
  const turns = useMemo(() => {
    const r = state.route;
    return r ? r.maneuvers.map((_, i) => roundaboutTurn(r, i)) : [];
  }, [state.route]);
  // nur den noch zu fahrenden Teil des Rückwegs zeigen, in 10 m Schritten und genau an der Stelle abgeschnitten
  // (Koray 9.11.: die gelbe Linie hing hinter dem Auto nach, weil sie am vorigen Stützpunkt begann)
  const doneStep = state.route && state.remainingKm != null ? Math.floor((state.route.km - state.remainingKm) * 100) : 0;
  // Tour für die Karte: nur was noch vor einem liegt (Koray 8.11.: die schon gefahrene weiße Linie irritiert).
  // Nach einer Abweichung wird der Weg zurück gestrichelt gezeichnet, durchgezogen nur die Tour danach.
  // Aktuelle Sperrungen vor einem (TomTom Verkehrsmeldungen, Koray 8.11.): beim Start, nach jeder
  // Neuberechnung und alle 10 Minuten; jede Sperrung einmal melden, als Marker auf der Karte
  const [closed, setClosed] = useState<{ id: string; label: string; km: number; mitte: LatLon }[]>([]);
  const toldClosed = useRef(new Set<string>());
  const remRef = useRef(state.remainingKm);
  useEffect(() => {
    remRef.current = state.remainingKm;
  }, [state.remainingKm]);
  const navRoute = state.route;
  const navRunning = state.status === 'laeuft' || state.status === 'pausiert';
  useEffect(() => {
    if (!navRoute || !navRunning) return;
    let alive = true;
    const run = async () => {
      const at = Math.max(0, navRoute.km - (remRef.current ?? navRoute.km));
      const from = navRoute.cumKm.findIndex((k) => k >= at);
      const to = navRoute.cumKm.findIndex((k) => k >= at + 80);
      const ahead = navRoute.shape.slice(Math.max(0, from), to < 0 ? undefined : to + 1);
      const hits = closuresOnRoute(ahead, await closuresNear(ahead));
      if (!alive) return;
      const list = hits.map((h) => ({
        id: h.closure.id,
        label: closureLabel(h.closure),
        km: navRoute.cumKm[Math.max(0, from) + h.firstIndex] - at,
        mitte: h.points[Math.floor(h.points.length / 2)],
      }));
      setClosed(list);
      for (const c of list) {
        if (toldClosed.current.has(c.id)) continue;
        toldClosed.current.add(c.id);
        const km = c.km < 1 ? 'gleich' : `in ${formatKm(c.km)}`;
        showToast(`${c.label}, ${km}. Laut Verkehrsmeldung, bitte umfahren.`, { tone: 'error' });
        carPlayAlert('Gesperrt laut Verkehrsmeldung', `${c.label.replace(/^Gesperrt:? ?/, '')} ${km}`.trim());
      }
    };
    void run();
    const t = setInterval(() => void run(), 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [navRoute, navRunning]);
  // In 10 m Schritten und genau ab der gefahrenen Stelle, sonst zieht ein Schweif hinter dem Auto her (Koray 8.11.)
  const fineStep = state.route && state.remainingKm != null ? Math.floor((state.route.km - state.remainingKm) * 100) : 0;
  // Akku (8.11.): nur ein kurzes Stück bis zur nächsten 2 km Marke wird alle 10 m neu gezeichnet, der Rest
  // bleibt dieselbe Linie und wird nur an jeder Marke getauscht. Vorher entstand alle 10 m die ganze Route neu.
  const block = Math.floor(fineStep / 200);
  const farLine = useMemo(() => {
    const r = state.route;
    if (!r) return null;
    const startKm = Math.max((block + 1) * 2, r.cumKm[r.rejoinIndex ?? 0]);
    const idx = r.cumKm.findIndex((k) => k >= startKm);
    return idx < 0 || idx >= r.shape.length - 1 ? null : { idx, p: r.shape.slice(idx) };
  }, [state.route, block]);
  const mapTour = useMemo<Tour | null>(() => {
    if (!active) return null;
    const r = state.route;
    if (!r) return active.tour;
    const ahead = aheadOf(r, fineStep / 100);
    const warnungen = closed.length
      ? [
          ...active.tour.warnungen,
          ...closed.map((c) => ({ klasse: 'raus' as const, start_km: 0, laenge_km: 0, name: c.label, ort: '', gruende: ['Gesperrt laut Verkehrsmeldung'], mitte: c.mitte })),
        ]
      : active.tour.warnungen;
    if (!farLine) return { ...active.tour, warnungen, linie: [{ c: 'ok', p: ahead }] };
    // Nahes Stück: vom Auto bis zum Beginn der fernen Linie (inklusive, damit beide sich berühren)
    const nearLen = ahead.length - (r.shape.length - farLine.idx) + 1;
    const near = nearLen >= 2 ? ahead.slice(0, nearLen) : null;
    return { ...active.tour, warnungen, linie: near ? [{ c: 'ok', p: near }, { c: 'ok', p: farLine.p }] : [{ c: 'ok', p: farLine.p }] };
  }, [active, state.route, fineStep, farLine, closed]);
  const dashed = useMemo(() => {
    const r = state.route;
    if (!r?.rejoinIndex) return null;
    const at = doneStep / 100;
    let i = 0;
    while (i < r.rejoinIndex && r.cumKm[i + 1] <= at) i++;
    // Anfang auf dem Stück zwischen Stützpunkt i und i + 1 einsetzen, genau bei der gefahrenen Strecke
    const seg = r.cumKm[i + 1] - r.cumKm[i];
    const k = i < r.rejoinIndex && seg > 0 ? Math.max(0, Math.min(1, (at - r.cumKm[i]) / seg)) : 0;
    const a = r.shape[i];
    const b = r.shape[Math.min(i + 1, r.shape.length - 1)];
    const head: LatLon = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    return [head, ...r.shape.slice(i + 1, r.rejoinIndex + 1)];
  }, [state.route, doneStep]);

  // Fahrtstatistik: GPS Punkte während der Fahrt sammeln
  const samples = useRef<Sample[]>([]);
  const [summary, setSummary] = useState<RideStats | null>(null);
  useEffect(() => {
    if (state.status !== 'laeuft' || !state.position) return;
    const last = samples.current[samples.current.length - 1];
    if (last && last.p[0] === state.position[0] && last.p[1] === state.position[1]) return;
    samples.current.push({ t: Date.now(), p: state.position, v: state.speedKmh, h: state.heading });
  }, [state.status, state.position, state.speedKmh, state.heading]);
  const [arrivedStats, setArrivedStats] = useState<RideStats | null>(null);
  useEffect(() => {
    if (state.status !== 'angekommen') return;
    const t = setTimeout(() => {
      setDriven(drivenHighlights());
      setArrivedStats(rideStats(samples.current));
    }, 0);
    return () => clearTimeout(t);
  }, [state.status]);
  const shownStats = summary ?? arrivedStats;

  // Gefahrene Tour einmal im Konto speichern (nicht bei Simulation, nicht ohne Konto)
  const simulated = useRef(false);
  const session = useSession();
  const [saved, setSaved] = useState<'nein' | 'ok' | 'fehler' | 'simulation' | 'ohne_konto' | null>(null);
  const savedFor = useRef<RideStats | null>(null);
  const [driveId, setDriveId] = useState<string | null>(null);
  useEffect(() => {
    if (!shownStats || savedFor.current === shownStats || !active) return;
    savedFor.current = shownStats;
    const why = simulated.current ? 'simulation' : !session ? 'ohne_konto' : shownStats.km < 1 ? 'nein' : null;
    if (why) {
      const t = setTimeout(() => setSaved(why), 0);
      return () => clearTimeout(t);
    }
    saveDrive(active.tour.name, shownStats, samples.current, currentVehicle(), bbSnapshot())
      .then((id) => {
        setDriveId(id);
        setSaved('ok');
      })
      .catch(() => setSaved('fehler'));
  }, [shownStats, session, active]);
  const pins = useMemo(() => {
    if (!shownStats) return undefined;
    const out = [];
    if (shownStats.maxKmh) out.push({ id: 'v', p: shownStats.maxKmh.p, label: `${Math.round(shownStats.maxKmh.value)} km/h`, title: 'Höchstgeschwindigkeit' });
    if (shownStats.maxLatG) out.push({ id: 'q', p: shownStats.maxLatG.p, label: fmtG(shownStats.maxLatG.value), title: 'Größte Querbeschleunigung' });
    if (shownStats.maxBrakeG) out.push({ id: 'b', p: shownStats.maxBrakeG.p, label: `−${fmtG(shownStats.maxBrakeG.value)}`, title: 'Stärkste Bremsung' });
    return out;
  }, [shownStats]);

  const exit = () => {
    controls.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  // Fertig nach der Fahrt: kam die Tour aus Meine Touren oder der Community, dorthin zurück (Koray 10.11.)
  const done = () => {
    const fromOrigin = !!getEditOrigin();
    exit();
    if (fromOrigin) setTimeout(requestEditBack, 0);
  };
  // Beenden mitten in der Fahrt: erst die Statistik zeigen, wenn es genug Punkte gibt
  const close = () => {
    if (!summary && (state.status === 'laeuft' || state.status === 'pausiert')) {
      const st = rideStats(samples.current);
      if (st && st.km > 1) {
        controls.stop();
        setDriven(drivenHighlights());
        setSummary(st);
        return;
      }
    }
    exit();
  };

  const skip = async (index: number) => {
    setSkipOpen(false);
    // schnellster Weg zum Ziel danach, dort weiter auf der Tour (Koray 8.11.)
    const undo = await controls.skipTo(index, true);
    if (undo) showToast('Zwischenziel übersprungen', { action: { label: 'Rückgängig', onPress: () => controls.restore(undo) } });
    else showToast('Überspringen hat gerade nicht geklappt.', { tone: 'error' });
  };

  // Live Activity: nächstes Manöver auf Sperrbildschirm, Dynamic Island und CarPlay Dashboard
  useEffect(() => {
    const st = state.status;
    const running = st === 'laeuft' || st === 'pausiert' || st === 'neuberechnung';
    const m = state.route?.maneuvers[state.next];
    if (!running || !m || !active) {
      // keine Fahrt: nichts in der Dynamic Island stehen lassen (beim Laden der Route fehlt nur das Manöver)
      if (!running) endAllNavActivities();
      return;
    }
    const d = formatDistance(state.distToNextM);
    // gröber runden, damit nicht jede Sekunde aktualisiert wird
    showNavActivity({
      symbol: symbolForKind(m.kind, m.exit),
      dist: d.value,
      unit: d.unit,
      text: m.text,
      street: m.street ?? '',
      eta: formatClock(state.eta),
      rest: state.remainingKm != null ? `${formatKm(state.remainingKm, 0)} km` : '',
      soon: state.distToNextM != null && state.distToNextM <= soonThresholdM(state.speedKmh),
      tour: active.tour.name,
    });
  }, [state.status, state.route, state.next, state.distToNextM, state.eta, state.remainingKm, state.speedKmh, active]);
  useEffect(() => () => endNavActivity(), []);

  // CarPlay: Führung auf dem Autodisplay spiegeln (Manöver, Restweg, Ankunft)
  const cpRunning = state.status === 'laeuft' || state.status === 'pausiert' || state.status === 'neuberechnung';
  const cpWas = useRef(false);
  useEffect(() => {
    if (cpRunning && !cpWas.current) carPlayStart();
    if (!cpRunning && cpWas.current) {
      carPlayStop(state.status === 'angekommen');
      // Build 14: nach der Ankunft im Auto nach dem Fahrspaß fragen, Details später am iPhone
      if (state.status === 'angekommen') setTimeout(carPlayAskRating, 1500);
    }
    cpWas.current = cpRunning;
  }, [cpRunning, state.status]);
  useEffect(() => () => carPlayStop(false), []);
  // Linie auf dem Autodisplay = die Route, nach der angesagt wird (auch nach Neuberechnung)
  // mit Rückweg: durchgezogen nur die Tour, der Weg zurück gestrichelt (wie in der App, ab Build 10)
  // Auch im Auto nur die Strecke vor einem; in 250 m Schritten, die ganze Linie geht jedes Mal über die Brücke
  const cpStep = carPlayTrims ? 0 : Math.floor(fineStep / 25);
  useEffect(() => {
    const r = state.route;
    if (!cpRunning || !r) return carPlaySetGuide(null);
    const line = carPlayHasRejoin ? aheadOf(r, cpStep / 4) : r.shape.slice(nearIndexAt(r, cpStep / 4));
    carPlaySetGuide(line, r.km, r.minutes);
  }, [cpRunning, state.route, cpStep]);
  useEffect(() => {
    carPlaySetRejoin(cpRunning ? dashed : null);
  }, [cpRunning, dashed]);
  // Kamera auf dem Autodisplay: kommt direkt aus der Navigation (use-navigation, auf der Linie eingerastet).
  // Hier nur der Anfang, bevor die erste Position verarbeitet ist; sonst zogen zwei Quellen an der Kamera.
  const cpStarted = useRef(false);
  useEffect(() => {
    if (!cpRunning) cpStarted.current = false;
    else if (!cpStarted.current && state.position && state.heading != null) {
      cpStarted.current = true;
      carPlayCamera(state.position, state.heading);
    }
  }, [cpRunning, state.position, state.heading]);
  // Ton Knopf auf dem Autodisplay
  useEffect(() => {
    if (cpRunning) carPlaySetVoice(state.voice);
  }, [cpRunning, state.voice]);
  useCarPlayEvent('onVoice', () => controls.setVoice(!state.voice));
  useEffect(() => () => carPlaySetGuide(null), []);
  useEffect(() => {
    const r = state.route;
    const m = r?.maneuvers[state.next];
    if (!cpRunning || !r || !m || state.distToNextM == null) return;
    const v = Math.max(8, (state.speedKmh ?? 50) / 3.6);
    // kurz vor dem Manöver wird das Symbol orange (CarPlay erlaubt dort keine Animation); neuer Schlüssel,
    // damit CarPlay das Bild austauscht
    const soon = state.distToNextM < CP_SOON_M;
    const restSecs = state.eta ? Math.max(0, (state.eta.getTime() - Date.now()) / 1000) : 0;
    // Abseits der Tour (Testfahrt 7.11.): ohne neue Route ein eigener Hinweis statt "0 m",
    // mit Rückweg steht "Zurück zur Tour" vor jeder Anweisung, bis die Tour wieder erreicht ist
    const rejoin = r.rejoinIndex != null && state.remainingKm != null ? (r.cumKm[r.rejoinIndex] - (r.km - state.remainingKm)) * 1000 : 0;
    const lost = (state.offRouteM ?? 0) > CP_OFF_M;
    if (lost) {
      carPlayUpdate({
        key: `abseits-${state.status}`,
        text: state.status === 'neuberechnung' ? 'Abseits der Tour. Der Weg zurück wird berechnet.' : 'Abseits der Tour. Fahr zurück auf die orange Linie.',
        symbol: 'arrow.uturn.backward',
        icon: '',
        distM: state.offRouteM ?? 0,
        secs: 0,
        restKm: state.remainingKm ?? 0,
        restSecs,
      });
      return;
    }
    const icon = (k: number) => {
      const x = r.maneuvers[k];
      return `nav-${symbolFor(x.kind, x.exit, turns[k]).replaceAll('_', '-')}`;
    };
    const t = r.maneuvers[state.next + 1];
    // Spurpfeile wie auf dem iPhone, ab 1,5 km vor dem Manöver (neuer Schlüssel, damit CarPlay das Bild zeigt)
    const lanes = m.lanes && state.distToNextM < LANES_SHOW_M ? m.lanes.map((l) => `${laneSymbol(l.dirs)}|${l.use ? 'u' : l.ok ? 'o' : 'x'}`).join(',') : '';
    carPlayUpdate({
      key: `${r.shape.length}-${r.km.toFixed(2)}-${state.next}${soon ? '-on' : ''}${rejoin > 20 ? '-zurueck' : ''}${lanes ? '-spur' : ''}`,
      ...(lanes ? { lanes } : {}),
      text: rejoin > 20 ? `Zurück zur Tour: ${m.text}` : m.text,
      symbol: symbolForKind(m.kind, m.exit),
      icon: `${icon(state.next)}${soon ? '-on' : ''}`,
      ...(t ? { thenText: t.text, thenSymbol: symbolForKind(t.kind, t.exit), thenIcon: icon(state.next + 1) } : {}),
      distM: state.distToNextM,
      secs: state.distToNextM / v,
      restKm: state.remainingKm ?? 0,
      restSecs,
    });
  }, [cpRunning, state.route, state.next, state.distToNextM, state.remainingKm, state.eta, state.speedKmh, state.offRouteM, state.status, turns]);
  // beim Verlassen der Tour einmal deutlich auf dem Autodisplay melden (höchstens einmal pro Minute)
  const cpOffAt = useRef(0);
  const cpOff = cpRunning && (state.offRouteM ?? 0) > CP_OFF_M;
  useEffect(() => {
    if (!cpOff || Date.now() - cpOffAt.current < 60000) return;
    cpOffAt.current = Date.now();
    carPlayAlert('Abseits der Tour', 'Wir führen dich zurück auf die Route.');
  }, [cpOff]);
  // "Los" auf dem Autodisplay: sofort starten, sobald die Navigation bereit ist
  useEffect(() => {
    if ((state.status === 'bereit' || state.status === 'angekommen') && takeCarPlayStart()) void controls.start();
  }, [state.status, controls]);
  useCarPlayEvent('onStart', () => {
    if ((state.status === 'bereit' || state.status === 'angekommen') && takeCarPlayStart()) void controls.start();
  });
  useCarPlayEvent('onEnd', close);
  // Bewertung vom Autodisplay: geht in dieselbe Karte wie am iPhone und wird dort gespeichert
  const [cpScore, setCpScore] = useState<number | null>(null);
  useCarPlayEvent('onRate', (e) => {
    if (typeof e.score === 'number') setCpScore(e.score);
  });
  // Auto erst während der Fahrt verbunden: Führung dort gleich aufnehmen
  useCarPlayEvent('onConnect', () => {
    if (cpRunning) carPlayStart();
  });

  // Das Manöver hat Vorrang: ist es nah, bleibt die Routenführung stehen
  const maneuverSoon = state.distToNextM != null && state.distToNextM <= soonThresholdM(state.speedKmh);
  const hlById = (id: string) => (hl && hl.route === state.route ? (hl.list.find((h) => h.id === id) ?? null) : null);
  const showHlCard = hlShow && !maneuverSoon && !stop ? hlById(hlShow.id) : null;

  const { status, route } = state;
  const running = status === 'laeuft' || status === 'pausiert' || status === 'neuberechnung';
  // Eigene Route in der Gruppe: erst nachfragen (Blatt wie überall, Prüfung 11.11.), dann Gruppe informieren
  const chooseOwn = () => {
    if (!withOthers) return controls.choose('fresh');
    setConfirmOwn(true);
  };
  const goOwn = () => {
    setOwnRouteState(true);
    setOwnRoute(true);
    controls.choose('fresh');
    controls.say('Du fährst jetzt deine eigene Route. Die Gruppe sieht dich weiter auf der Karte.');
  };
  // Sammelpunkt (Martin 11.11.): Halt der Lead mit Ort, sonst die Lead selbst, wenn sie vor einem fährt.
  // Ziel ist die Stelle der Tour dort; der Weg dahin ist der schnellste, danach geht es auf der Tour weiter.
  const meet = (() => {
    if (!withOthers || !route || ride.myRole === 'lead') return null;
    const lead = ride.members.find((m) => m.role === 'lead' && m.id !== ride.me?.id && m.p);
    const target = stop?.p ?? lead?.p ?? null;
    if (!target) return null;
    const doneKm = state.remainingKm != null ? route.km - state.remainingKm : 0;
    let from = route.cumKm.findIndex((k) => k >= doneKm);
    if (from < 0) from = 0;
    let best = -1;
    let bd = Infinity;
    for (let i = from; i < route.shape.length; i++) {
      const d = haversine(route.shape[i], target);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // nur, wenn der Punkt nah an der Tour und vor einem liegt
    if (best < 0 || bd > 2000 || route.cumKm[best] - doneKm < 0.3) return null;
    return { index: best, label: stop?.p ? 'Zum Halt der Lead' : 'Zur Lead aufschließen', speech: stop?.p ? 'Ich führe dich zum Halt der Gruppe.' : 'Ich führe dich zur Lead.' };
  })();
  const goMeet = () => {
    if (!meet) return;
    if (ownRoute) {
      setOwnRouteState(false);
      setOwnRoute(false);
    }
    void controls.skipTo(meet.index, true, meet.speech);
  };
  const backToGroup = () => {
    setOwnRouteState(false);
    setOwnRoute(false);
    void controls.backToTour();
  };
  // Abseits der Tour: Meter bis zurück auf die Route (gestrichelter Weg), oder nur abseits ohne neue Route
  const rejoinM =
    route?.rejoinIndex != null && state.remainingKm != null ? (route.cumKm[route.rejoinIndex] - (route.km - state.remainingKm)) * 1000 : null;
  const offTour = running && ((rejoinM != null && rejoinM > 20) || (state.offRouteM != null && state.offRouteM > 60));
  const maneuver = route?.maneuvers[state.next];
  // Scharfe Kurve voraus: nur in Zonen ab 70 km/h und nicht, solange das Label "Abseits der Tour" steht.
  // Sind die Tempolimits (noch) nicht geladen, zählt das eigene Tempo ab 60 km/h.
  const ahead = status === 'laeuft' && !offTour && atKm != null ? curveCue(curves, atKm, state.speedKmh) : null;
  const zoneLimit = ahead && zones?.route === route ? limitAt(zones.z, ahead.startKm) : null;
  // Bremshinweis in der Tempo Plakette ab Zonen mit 60 km/h (Koray 8.11.); ohne Tempolimits zählt das eigene
  // Tempo ab 60. Weite Kurven nur, wenn sie deutlich langsamer sind als das, was man dort fährt.
  // Weite Kurven nur, wenn man wirklich anbremsen muss: mindestens 10 km/h unter dem eigenen Tempo
  // (ohne Tempo das Limit). Vorher reichte "unter Limit plus 15", das meldete auch Kurven, die man so fährt.
  const ref = state.speedKmh ?? zoneLimit ?? 0;
  const relevant = ahead && (ahead.kind !== 'kurve' || (ahead.vmax ?? 999) <= ref - 10);
  const cue = ahead && relevant && (zoneLimit != null ? zoneLimit >= 60 : (state.speedKmh ?? 0) >= 60) ? ahead : null;
  const brakeHint = cue ? { big: cue.big, label: cue.label, icon: cue.icon, a11y: cue.a11y } : null;
  const then = route?.maneuvers[state.next + 1];
  // Tempo unten links: Limit an der aktuellen Stelle der Route, sobald die Zonen geladen sind
  // Angezeigt wird ein bekanntes Schild, außerorts ohne Eintrag die geschätzten 100 in Grau (Koray 12.11.)
  const shownLimit = atKm != null && zones?.route === route ? shownLimitAt(zones.z, atKm) : null;
  const limitHere = shownLimit?.limit ?? null;
  const limitEst = shownLimit?.estimated ?? false;
  // Blackbox: jedes angezeigte Tempolimit mit Stelle (Klassiker Tempolimit, Koray 12.11.)
  useEffect(() => {
    if (running) bbLog('limit', [limitHere, limitEst ? 1 : 0, atKm == null ? null : Math.round(atKm * 1000) / 1000]);
    // nur bei Wechsel des Limits, nicht bei jedem Meter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, limitHere, limitEst]);
  // Angepingt und Teilen gewählt (Koray 14.11.): jede Minute Ankunft in Minuten und Punkt an die Gruppe,
  // bis man am Treffpunkt ist (dann "da") oder die Gruppe losfährt
  const etaSent = useRef(0);
  useEffect(() => {
    if (!sharingFor() || status !== 'laeuft' || !state.position || !state.eta) return;
    if (Date.now() - etaSent.current < 60000) return;
    etaSent.current = Date.now();
    void reportEta(Math.max(0, (state.eta.getTime() - Date.now()) / 60000), state.position);
  }, [status, state.position, state.eta]);
  useEffect(() => {
    if (status === 'angekommen' && sharingFor() && state.position) void reportEta(0, state.position);
  }, [status, state.position]);

  // Kurvenansagen wie ein Beifahrer, Stufe Einfach, nur auf Highlights (Koray 13.11., Schalter unter Fahren).
  // Abbiegehinweise, Highlight Ansage und Funk gehen vor; eine Kurve, die dann zu spät käme, entfällt.
  const paces = useMemo(
    () =>
      PACE_NOTES_RELEASED && driveSettings.paceNotes && route && hl && hl.route === route && hl.list.length
        ? paceNotes(route.shape, route.maneuvers.map((m) => m.km), hl.list.map((h) => ({ startKm: h.startKm, endKm: h.endKm })))
        : [],
    [driveSettings.paceNotes, route, hl],
  );
  const paceNext = useRef({ list: paces, i: 0 });
  useEffect(() => {
    if (!paces.length || status !== 'laeuft' || offTour || atKm == null) return;
    const p = paceNext.current;
    if (p.list !== paces) paceNext.current = { list: paces, i: 0 };
    let i = paceNext.current.i;
    while (i < paces.length && paces[i].startKm < atKm + 0.02) i++;
    const n = paces[i];
    if (!n) {
      paceNext.current.i = i;
      return;
    }
    const t = paceText(paces, i);
    if (n.startKm - atKm > leadKm(state.speedKmh, t.count * 2)) {
      paceNext.current.i = i;
      return;
    }
    paceNext.current.i = i + t.count;
    if (inRide && (funk.talking || funk.speaker)) return;
    if (state.distToNextM != null && state.distToNextM < 250) return;
    if (Date.now() - hlSaidAt.current < 6000) return;
    controls.say(t.text);
  }, [paces, status, offTour, atKm, state.speedKmh, state.distToNextM, inRide, funk.talking, funk.speaker, controls]);

  // Problem melden: ein Tipp während der Fahrt, die letzten vier Minuten gehen mit
  const reportProblem = () => {
    haptic('punkt');
    const m = route?.maneuvers[state.next];
    const context = {
      tour: active?.tour.name ?? null,
      km: atKm == null ? null : Math.round(atKm * 1000) / 1000,
      manoever: m ? { text: m.text, speech: m.speech, km: m.km, kind: m.kind } : null,
      danach: route?.maneuvers[state.next + 1]?.text ?? null,
      abstand: state.distToNextM == null ? null : Math.round(state.distToNextM),
      tempo: state.speedKmh == null ? null : Math.round(state.speedKmh),
      limit: limitHere,
      limitGeschaetzt: limitEst,
      abseits: state.offRouteM == null ? null : Math.round(state.offRouteM),
      status: state.status,
    };
    bbLog('report', context);
    void sendNavReport({ p: state.position, context, log: bbSnapshot(240) })
      .catch(() => false)
      .then((ok) => showToast(ok ? 'Danke, die Stelle ist gemerkt.' : 'Gemerkt, die Stelle steht im Protokoll der Fahrt.'));
  };
  // Nächstes Zwischenziel überspringen: Ziel ist das Zwischenziel danach, sonst das Ende der Route
  const nextVia = atKm != null ? viaKms.findIndex((k) => k > atKm + 0.1) : -1;
  const skipTarget = (() => {
    if (!route || nextVia < 0) return null;
    const afterKm = viaKms[nextVia + 1];
    if (afterKm == null) return { index: route.shape.length - 1, toZiel: true };
    const i = route.cumKm.findIndex((k) => k >= afterKm - 0.05);
    return { index: Math.max(0, i), toZiel: false };
  })();
  const drivenKm = route ? Math.max(0, (startKm ?? route.km) - (state.remainingKm ?? 0)) : 0;

  // CarPlay Build 14: Menü Mehr (Überspringen, Pause), Bremshinweis und Gruppe auf dem Autodisplay
  const cpSkipLabel = skipTarget && !inRide ? `${active?.tour.namen?.[nextVia + 1] || 'Zwischenziel'} überspringen` : '';
  useEffect(() => {
    if (cpRunning) carPlaySetMenu(cpSkipLabel, state.status === 'pausiert');
  }, [cpRunning, cpSkipLabel, state.status]);
  useCarPlayEvent('onSkip', () => {
    if (skipTarget && !inRide) void skip(skipTarget.index);
  });
  useCarPlayEvent('onPause', (e) => controls.pause(e.on ?? state.status !== 'pausiert'));
  const cueKey = cue ? `${cue.startKm.toFixed(3)}|${cue.label}` : '';
  const cueSent = useRef('');
  useEffect(() => {
    if (!cpRunning || !cue || cueKey === cueSent.current) return;
    // nur einmal je Kurve oder Kette, nicht bei jedem Meter Countdown
    const head = cueKey.split('|')[0];
    if (cueSent.current.startsWith(head)) return;
    cueSent.current = cueKey;
    carPlayHint(cue.a11y, 'Co Pilot');
  }, [cpRunning, cue, cueKey]);
  useEffect(() => {
    if (!cpRunning) return;
    carPlaySetGroup(
      others.map((o) => {
        // CarPlay lässt den Punkt in 0,8 s an die neue Stelle gleiten; wir geben die Stelle, an der der Fahrer
        // dann voraussichtlich ist. Dieser Effekt läuft mit jeder eigenen Position (etwa jede Sekunde).
        const q = predictPosition(o.p, o.heading, o.speedKmh, o.seenAt, Date.now() + 800);
        return {
        id: o.id,
        name: o.name,
        lat: q[0],
        lon: q[1],
        detail: state.position ? `${formatKm(haversine(state.position, o.p) / 1000)} km entfernt${o.own ? ', eigener Weg' : o.off ? ', abseits der Tour' : ''}` : undefined,
        };
      }),
    );
  }, [cpRunning, others, state.position]);

  if (!active || !mapTour) {
    return (
      <View style={[styles.root, styles.pad, { paddingTop: insets.top + Spacing.xl }]}>
        <InfoCard>
          <AppText variant="title">Keine Tour gewählt.</AppText>
          <AppText muted>Erstelle zuerst eine Tour im Tab Planen und tippe auf Losfahren.</AppText>
          <BigButton label="Schließen" kind="ghost" onPress={close} />
        </InfoCard>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <RouteMap
        tour={mapTour}
        style={StyleSheet.absoluteFill}
        followUser={running}
        overview={overview}
        onOverviewEnd={() => setOverview(0)}
        showUser
        position={state.position}
        heading={state.heading}
        speedKmh={state.speedKmh}
        others={others}
        pins={pins}
        dashed={rejoinM != null && rejoinM > 0 ? dashed : null}
        edgePadding={{
          top: insets.top + 60,
          right: 40,
          bottom: insets.bottom + 260,
          left: 40,
        }}
      />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.s }]} pointerEvents="box-none">
        {running && maneuver && (
          <Pressable
            onLongPress={() => skipTarget && !inRide && setSkipOpen(true)}
            delayLongPress={400}
            accessibilityHint={skipTarget && !inRide ? 'Lange drücken, um das nächste Zwischenziel zu überspringen' : undefined}
            accessibilityActions={skipTarget && !inRide ? [{ name: 'skip', label: 'Nächstes Zwischenziel überspringen' }] : undefined}
            onAccessibilityAction={() => skipTarget && void skip(skipTarget.index)}>
            {showHlCard ? (
              <Animated.View key={`hl-${showHlCard.id}`} entering={softEnter()} exiting={FadeOut.duration(160)}>
                <Pressable accessibilityRole="button" accessibilityHint="Antippen schließt die Ansage" onPress={() => setHlShow(null)}>
                  <HighlightCard h={showHlCard} distM={showHlCard === nextHl ? hlDistM : 0} />
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View key="man" entering={softEnter()}>
                <ManeuverCard
                  maneuver={maneuver}
                  distM={state.distToNextM}
                  then={then}
                  turn={turns[state.next]}
                  thenTurn={turns[state.next + 1]}
                  soon={maneuverSoon}
                  footer={onHl && atKm != null ? <HighlightStrip h={onHl} atKm={atKm} onPress={() => setHlShow({ id: onHl.id, until: Date.now() + HL_SHOW_MS })} /> : undefined}
                />
              </Animated.View>
            )}
          </Pressable>
        )}
        {running && overview > 0 && atKm != null && (
          <Animated.View entering={softEnter()} exiting={FadeOut.duration(160)}>
            <Pressable accessibilityRole="button" accessibilityHint="Antippen schließt die Übersicht" onPress={() => setOverview(0)} style={styles.planCard}>
              <AppText style={styles.skipTitle}>Deine Planung</AppText>
              {[
                ...viaKms.map((k, i) => ({ k, name: active?.tour.namen?.[i + 1] || `Zwischenziel ${i + 1}`, ziel: false })),
                { k: route?.km ?? 0, name: active?.tour.namen?.[(active?.tour.wegpunkte.length ?? 1) - 1] || 'Ziel', ziel: true },
              ]
                .filter((x) => x.k > atKm + 0.1)
                .slice(0, 4)
                .map((x, i) => (
                  <View key={`${x.name}-${i}`} style={styles.planRow}>
                    <View style={[styles.planDot, x.ziel && styles.planDotZiel]} />
                    <AppText style={styles.planName} numberOfLines={1}>
                      {x.name}
                    </AppText>
                    <AppText style={styles.planKm}>{`${formatKm(Math.max(0, x.k - atKm), 0)} km`}</AppText>
                  </View>
                ))}
            </Pressable>
          </Animated.View>
        )}
        {running && skipOpen && skipTarget && atKm != null && (
          <Animated.View entering={softEnter()} exiting={FadeOut.duration(160)} style={styles.skipCard}>
            <View style={styles.flex}>
              <AppText style={styles.skipTitle}>Nächstes Zwischenziel überspringen</AppText>
              <AppText style={styles.skipText} numberOfLines={1}>
                {`Noch ${formatKm(Math.max(0, viaKms[nextVia] - atKm), 0)} km, danach direkt ${skipTarget.toZiel ? 'zum Ziel' : 'zum nächsten Zwischenziel'}`}
              </AppText>
            </View>
            <Pressable accessibilityRole="button" onPress={() => void skip(skipTarget.index)} style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.85 }]}>
              <AppText style={styles.skipBtnText}>Überspringen</AppText>
            </Pressable>
          </Animated.View>
        )}
        {status === 'neuberechnung' && <Recalculating first={!route} />}
        {offTour && (
          <View style={styles.offCard} accessibilityRole="alert">
            <View style={styles.offRow}>
              <View style={styles.offDash} />
              <AppText style={styles.offText} numberOfLines={1}>
                {rejoinM != null && rejoinM > 20 && status !== 'neuberechnung'
                  ? `Abseits der Tour, zurück in ${formatDistance(rejoinM).value} ${formatDistance(rejoinM).unit}`
                  : 'Abseits der Tour'}
              </AppText>
            </View>
            {/* Selbst wählen statt warten (Martin 11.11.): wer nicht umdrehen kann, nimmt gleich eine neue Route.
                Ohne Tipp führt die App nach 8 s zurück, nach zweimal Ignorieren plant sie selbst neu. */}
            {/* erst nach dem ersten Ignorieren fragen (Koray 11.11.): beim ersten Mal führt die App einfach zurück */}
            {status !== 'neuberechnung' && (state.ignored ?? 0) >= 1 && meet && (
              <Pressable accessibilityRole="button" onPress={goMeet} style={({ pressed }) => [styles.offBtn, styles.offBtnWide, pressed && styles.offPressed]}>
                <AppText style={styles.offBtnText}>{meet.label}</AppText>
              </Pressable>
            )}
            {status !== 'neuberechnung' && (state.ignored ?? 0) >= 1 && (
              <View style={styles.offBtns}>
                <Pressable accessibilityRole="button" onPress={() => controls.choose('rejoin')} style={({ pressed }) => [styles.offBtn, pressed && styles.offPressed]}>
                  <AppText style={styles.offBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    Zurück zur Tour
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={withOthers ? 'Eigene Route, verlässt die Strecke der Gruppe' : 'Neue Route ab hier'}
                  onPress={chooseOwn}
                  style={({ pressed }) => [styles.offBtn, styles.offBtnMain, pressed && styles.offPressed]}>
                  {/* kurze Wörter: zwei Tasten nebeneinander haben je nur etwa 140 pt (Prüfung 11.11.) */}
                  <AppText style={[styles.offBtnText, styles.offBtnMainText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {withOthers ? 'Eigene Route' : 'Neue Route'}
                  </AppText>
                </Pressable>
              </View>
            )}
          </View>
        )}
        {/* Eigene Route in der Gruppe: leise zurück zur gemeinsamen Tour (Koray 11.11.) */}
        {running && withOthers && ownRoute && status !== 'neuberechnung' && (
          <Pressable accessibilityRole="button" onPress={backToGroup} style={({ pressed }) => [styles.groupBack, pressed && styles.offPressed]}>
            <AppText style={styles.groupBackText}>‹ Zurück zur Gruppe</AppText>
          </Pressable>
        )}
        {/* Funk: wer gerade spricht (Funk Konzept, Koray 10.11.) */}
        {running && inRide && (funk.talking || funk.speaker || funk.status === 'getrennt') && <FunkBanner funk={funk} />}
        {/* Halt der Lead oben rechts, getrennt vom Funk (Funk Konzept, Koray 10.11.) */}
        {running && withOthers && ride.myRole === 'lead' && !stop && <LeadHaltPill onAnnounce={announceStop} />}
        {running && stop && (
          <StopAlert stop={stop} distM={stopDistM} mine={myStop} onDismiss={() => clearStop(false)} onCancel={() => clearStop(true)} />
        )}
      </View>

      <View style={[styles.bottom, !running && { paddingBottom: insets.bottom + Spacing.m }]} pointerEvents="box-none">
        {running && (
          <>
            {(driveSettings.speed || brakeHint) && (
              <View style={styles.leadWrap}>
                <SpeedBadge speedKmh={state.speedKmh} limit={limitHere} estimated={shownLimit?.estimated} hint={brakeHint} showSpeed={driveSettings.speed} />
              </View>
            )}
            {inRide && msgOpen && (
              <View style={styles.msgSheet}>
                <AppText variant="label">An die Gruppe</AppText>
                <View style={styles.msgChips}>
                  {QUICK_MESSAGES.map((m) => (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      onPress={() => {
                        sendMessage(m);
                        setMsgOpen(false);
                      }}
                      style={({ pressed }) => [styles.msgChip, pressed && { opacity: 0.7 }]}
                    >
                      <AppText style={styles.msgChipText}>{m}</AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <BottomBar
              eta={state.eta}
              remainingKm={state.remainingKm}
              extra={(() => {
                if (!route || state.remainingKm == null || route.km <= 0) return undefined;
                const at = route.km - state.remainingKm;
                return {
                  donePct: Math.round((at / route.km) * 100),
                  viaPct: viaKms.map((k) => Math.round((k / route.km) * 1000) / 10).filter((v) => v > 0 && v < 100),
                };
              })()}
              paused={state.status === 'pausiert'}
              onPause={controls.pause}
              voice={state.voice}
              group={withOthers}
              onFunk={inRide ? () => setMsgOpen(!msgOpen) : undefined}
              talk={
                withOthers && funk.status !== 'nicht' && funk.status !== 'gesperrt'
                  ? { talking: funk.talking, waiting: funk.waiting, disabled: funk.onlyLead && ride.myRole !== 'lead', onTalk: pushToTalk }
                  : undefined
              }
              extraActions={[
                { key: 'melden', label: 'Problem melden', icon: 'exclamationmark.bubble.fill' as const, run: reportProblem },
                ...(withOthers && funk.status === 'gesperrt'
                  ? [{ key: 'msg', label: 'Kurznachricht an die Gruppe', icon: 'bubble.left.fill' as const, run: () => setMsgOpen(true) }]
                  : []),
                ...(withOthers && funk.status !== 'nicht' && funk.status !== 'gesperrt'
                  ? [
                      { key: 'msg', label: 'Kurznachricht an die Gruppe', icon: 'bubble.left.fill' as const, run: () => setMsgOpen(true) },
                      { key: 'hoeren', label: funk.listen ? 'Funk stumm' : 'Funk hören', icon: (funk.listen ? 'speaker.slash.fill' : 'speaker.wave.2.fill') as 'speaker.slash.fill', run: () => setFunkListen(!funk.listen) },
                      ...(ride.myRole === 'lead'
                        ? [{ key: 'nurlead', label: funk.onlyLead ? 'Alle dürfen sprechen' : 'Nur die Lead spricht', icon: 'person.wave.2.fill' as const, run: () => setOnlyLead(!funk.onlyLead) }]
                        : []),
                    ]
                  : []),
              ]}
              showSim={showSim}
              bottomInset={insets.bottom + Spacing.m}
              onEnd={close}
              onOverview={() => setOverview(Date.now())}
              skipLabel={skipTarget && !inRide ? `${active?.tour.namen?.[nextVia + 1] || 'Zwischenziel'} überspringen` : undefined}
              onSkip={skipTarget && !inRide ? () => void skip(skipTarget.index) : undefined}
              onVoice={() => controls.setVoice(!state.voice)}
              onSecret={() => setSecret(true)}
              onSimulate={() => {
                simulated.current = true;
                controls.simulate(true);
              }}
            />
          </>
        )}

        {status === 'bereit' && !summary && (
          <View style={styles.pad}>
            <InfoCard>
              <Pressable onLongPress={() => setSecret(true)} delayLongPress={800}>
                <AppText variant="label">Bereit</AppText>
                <AppText style={styles.tourName} numberOfLines={2}>
                  {active.tour.name}
                </AppText>
                <AppText variant="caption" muted>
                  {formatKm(route?.km ?? active.tour.laenge_km, 0)} km
                  {active.tour.minutes ? `, etwa ${Math.round(active.tour.minutes)} min` : ''}
                </AppText>
              </Pressable>
              {far && (
                <AppText style={styles.farNote}>
                  Der Start ist {Math.round(toStartKm!).toLocaleString('de-DE')} km entfernt. Erst zum Start fahren oder unterwegs
                  einsteigen?
                </AppText>
              )}
              <View style={styles.entry} accessibilityRole="radiogroup">
                {(
                  [
                    {
                      id: 'einsteigen',
                      label: 'Einsteigen',
                      hint: 'Schnell auf die Tour, möglichst nah am Anfang',
                    },
                    {
                      id: 'start',
                      label: 'Über den Startpunkt fahren',
                      hint: 'Schnellster Weg zum Start, dann die ganze Tour',
                    },
                  ] as { id: NavEntry; label: string; hint: string }[]
                ).map((o) => (
                  <Pressable
                    key={o.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: effEntry === o.id }}
                    onPress={() => {
                      setEntry(o.id);
                      setEntryTouched(true);
                    }}
                    style={styles.entryRow}
                  >
                    <View style={styles.flex}>
                      <AppText style={styles.entryLabel}>{o.label}</AppText>
                      <AppText variant="caption" muted>
                        {o.hint}
                      </AppText>
                    </View>
                    <View style={[styles.radio, effEntry === o.id && styles.radioOn]}>
                      {effEntry === o.id && <View style={styles.radioDot} />}
                    </View>
                  </Pressable>
                ))}
              </View>
              {vehicles.list.length > 0 && (
                <VehiclePick list={vehicles.list} current={vehicles.current ?? null} />
              )}
              <BigButton label="Start" onPress={() => void controls.start()} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <BigButton label="Schließen" kind="ghost" onPress={close} />
                </View>
                {showSim && (
                  <View style={styles.flex}>
                    <BigButton
                      label="Simulieren"
                      kind="ghost"
                      onPress={() => {
                        simulated.current = true;
                        controls.simulate(true);
                      }}
                    />
                  </View>
                )}
              </View>
            </InfoCard>
          </View>
        )}

        {summary && (
          <ScrollView style={{ maxHeight: win.height - insets.top - Spacing.l }} contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <InfoCard>
              <AppText variant="label">Fahrt beendet</AppText>
              <AppText style={styles.tourName} numberOfLines={2}>
                {active.tour.name}
              </AppText>
              <StatsGrid st={summary} />
              {(saved === null || saved === 'ok') && <DriveRatingCard driveId={driveId} highlights={driven} preset={cpScore} />}
              <SavedNote saved={saved} />
              <BigButton label="Fertig" onPress={done} />
            </InfoCard>
          </ScrollView>
        )}

        {status === 'angekommen' && (
          <ScrollView style={{ maxHeight: win.height - insets.top - Spacing.l }} contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <InfoCard tone="good">
              <AppText variant="label">Angekommen</AppText>
              <AppText style={styles.congrats}>Starke Runde!</AppText>
              <AppText muted>
                {formatKm(drivenKm || route?.km || active.tour.laenge_km)} km gefahren auf {active.tour.name}.
              </AppText>
              {arrivedStats && <StatsGrid st={arrivedStats} />}
              {(saved === null || saved === 'ok') && <DriveRatingCard driveId={driveId} highlights={driven} preset={cpScore} />}
              <SavedNote saved={saved} />
              <BigButton label="Fertig" onPress={done} />
            </InfoCard>
          </ScrollView>
        )}

        {status === 'fehler' && (
          <View style={styles.pad}>
            <InfoCard tone="signal">
              <AppText variant="label">Navigation gestoppt</AppText>
              <AppText>{state.error || 'Die Route konnte nicht geladen werden.'}</AppText>
              <BigButton label="Nochmal" onPress={() => void controls.start()} />
              <BigButton label="Schließen" kind="ghost" onPress={close} />
            </InfoCard>
          </View>
        )}
      </View>
      <ConfirmSheet
        visible={confirmOwn}
        title="Möchtest du die Strecke der Gruppe wirklich verlassen?"
        text="Du fährst dann deine eigene Route. Die Gruppe sieht dich weiter auf der Karte und erfährt davon."
        confirmLabel="Eigene Route"
        onConfirm={goOwn}
        onClose={() => setConfirmOwn(false)}
      />
    </View>
  );
}

function SavedNote({ saved }: { saved: string | null }) {
  const text: Record<string, string> = {
    ok: 'Im Konto gespeichert, du findest die Fahrt unter Touren, Gefahren.',
    fehler: 'Speichern hat nicht geklappt. Prüfe die Verbindung.',
    simulation: 'Simulation, wird nicht gespeichert.',
    ohne_konto: 'Melde dich unter Einstellungen an, dann werden deine Fahrten gespeichert.',
  };
  if (!saved || !text[saved]) return null;
  return (
    <AppText variant="caption" muted>
      {text[saved]}
    </AppText>
  );
}

function StatsGrid({ st }: { st: RideStats }) {
  const h = Math.floor(st.movingMin / 60);
  const m = Math.round(st.movingMin % 60);
  const items: [string, string][] = [
    [formatKm(st.km, st.km < 10 ? 1 : 0), 'km'],
    [h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`, 'Fahrzeit in Bewegung'],
    [`${Math.round(st.avgKmh)} km/h`, 'Schnitt'],
    [st.maxKmh ? `${Math.round(st.maxKmh.value)} km/h` : '–', 'Spitze'],
    [st.maxLatG ? fmtG(st.maxLatG.value) : '–', st.maxLatG ? `Querbeschleunigung, Kurve ${st.maxLatG.side}` : 'Querbeschleunigung'],
    [st.maxBrakeG ? fmtG(st.maxBrakeG.value) : '–', 'Stärkste Bremsung'],
    [st.maxAccelG ? fmtG(st.maxAccelG.value) : '–', 'Stärkste Beschleunigung'],
    [String(st.curves), 'Kurven'],
  ];
  return (
    <View style={styles.statsGrid}>
      {items.map(([v, l]) => (
        <View key={l} style={styles.statCell}>
          <AppText style={styles.statValue}>{v}</AppText>
          <AppText variant="caption" muted>
            {l}
          </AppText>
        </View>
      ))}
      <AppText variant="caption" muted style={styles.statNote}>
        Aus den GPS Daten berechnet, die Spitzenwerte sind auf der Karte markiert.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.m },
  statCell: { width: '50%', gap: 2, paddingRight: Spacing.s },
  statValue: { fontFamily: Fonts.display, fontSize: 22, fontVariant: ['tabular-nums'] },
  statNote: { width: '100%' },
  root: { flex: 1, backgroundColor: Colors.ground },
  pad: { paddingHorizontal: Spacing.l },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.s },
  entry: { gap: Spacing.s },
  msgSheet: {
    marginHorizontal: Spacing.l,
    marginBottom: Spacing.s,
    padding: Spacing.l,
    gap: Spacing.m,
    borderRadius: Radius.l,
    backgroundColor: Colors.overlaySurface,
  },
  msgChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  msgChip: {
    minHeight: 52,
    paddingHorizontal: Spacing.l,
    borderRadius: 26,
    backgroundColor: Colors.surface2,
    justifyContent: 'center',
  },
  msgChipText: { fontFamily: Fonts.bold, fontSize: Type.title },
  farNote: {
    fontFamily: Fonts.semibold,
    fontSize: Type.body,
    lineHeight: 21,
    color: Colors.warn,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    paddingVertical: Spacing.s,
  },
  entryLabel: { fontFamily: Fonts.semibold, fontSize: Type.input },
  radio: {
    width: 24,
    height: 24,
    borderRadius: Radius.s,
    borderWidth: 2,
    borderColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.text },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.text,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.m,
    gap: Spacing.s,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  leadWrap: { paddingHorizontal: Spacing.m, paddingBottom: Spacing.s },
  skipCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: 'rgba(11,11,12,0.94)', borderRadius: Radius.l, padding: Spacing.m, paddingLeft: Spacing.l },
  skipTitle: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  planCard: { gap: Spacing.s, backgroundColor: 'rgba(11,11,12,0.94)', borderRadius: Radius.l, padding: Spacing.l },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 28 },
  planDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: Colors.text },
  planDotZiel: { backgroundColor: Colors.signal, borderColor: Colors.signal },
  planName: { flex: 1, minWidth: 0, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  planKm: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, fontVariant: ['tabular-nums'] },
  skipText: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  skipBtn: { minHeight: 44, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.onSignal },
  curve: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, alignSelf: 'flex-start', backgroundColor: Colors.overlay, borderRadius: Radius.pill, paddingVertical: Spacing.s, paddingHorizontal: Spacing.l },
  groupBack: { alignSelf: 'flex-start', height: 44, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  groupBackText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  offCard: { alignSelf: 'stretch', gap: Spacing.m, backgroundColor: Colors.overlay, borderRadius: Radius.l, padding: Spacing.m },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingHorizontal: Spacing.xs },
  offBtns: { flexDirection: 'row', gap: Spacing.s },
  offBtn: { flex: 1, height: 52, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.s },
  offBtnMain: { backgroundColor: Colors.signal },
  offBtnWide: { flex: 0, alignSelf: 'stretch' },
  offBtnText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  offBtnMainText: { color: Colors.onSignal },
  offPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  offDash: { width: 22, height: 4, borderRadius: 2, backgroundColor: Colors.warn },
  offText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.warn },
  tourName: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    textTransform: 'uppercase',
    marginTop: Spacing.xs,
  },
  congrats: {
    fontFamily: Fonts.display,
    fontSize: Type.display,
    lineHeight: 38,
    textTransform: 'uppercase',
  },
});

/** Index des letzten Punkts der Route vor der Stelle at km */
function nearIndexAt(r: NavRoute, at: number): number {
  let i = 0;
  while (i < r.shape.length - 2 && r.cumKm[i + 1] <= at) i++;
  return i;
}

/** Route ab der Stelle at km (genau dort beginnend), nie vor dem Wiedereinstieg in die Tour */
function aheadOf(r: NavRoute, at: number): LatLon[] {
  const i = nearIndexAt(r, at);
  const join = r.rejoinIndex ?? 0;
  if (i < join) return r.shape.slice(join);
  const a = r.shape[i];
  const b = r.shape[i + 1] ?? a;
  const seg = (r.cumKm[i + 1] ?? r.cumKm[i]) - r.cumKm[i];
  const k = seg > 0 ? Math.max(0, Math.min(1, (at - r.cumKm[i]) / seg)) : 0;
  const p: LatLon = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return [p, ...r.shape.slice(i + 1)];
}
