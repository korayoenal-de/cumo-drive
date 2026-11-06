/**
 * React Hook für die Routenführung: Standort, Anweisungen, Fortschritt, Ansagen, Neuberechnung.
 * Läuft in Expo Go (expo-location, expo-speech, expo-keep-awake sind dort enthalten).
 * Standort nur im Vordergrund; Hintergrund Ortung bräuchte einen eigenen Build.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { haversine, type LatLon } from '../tour';
import { fetchNavRouteDetail, rejoinNavRoute } from './route';
import { pointAtKm, progress, snapToRoute } from './tracker';
import type { NavControls, NavRequest, NavRoute, NavState, SkipUndo } from './types';
import { createVoiceGuide, type VoiceGuide } from './voice';

const KEEP_AWAKE_TAG = 'cumo-navigation';
/** Abstand zur Route, ab dem man als abgewichen gilt */
const OFF_ROUTE_M = 60;
/** so lange muss die Abweichung dauern */
const OFF_ROUTE_MS = 8000;
/** frühestens so oft neu berechnen */
const REROUTE_GAP_MS = 20000;
/** Ziel erreicht unter diesem Abstand */
const ARRIVE_M = 40;
/** Takt der Simulation */
const SIM_TICK_MS = 1000;

const INITIAL: NavState = {
  status: 'bereit',
  route: null,
  position: null,
  heading: null,
  speedKmh: null,
  next: 0,
  distToNextM: null,
  remainingKm: null,
  pace: 1,
  eta: null,
  offRouteM: null,
  voice: true,
};

type Fix = { pos: LatLon; heading: number | null; speedKmh: number | null; at: number };

/** Fehler in einen freundlichen deutschen Satz übersetzen. */
function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Routenplaner|Netzverbindung|Tour/.test(msg)) return msg;
  if (/network|fetch|Netz/i.test(msg)) return 'Keine Verbindung zum Routenplaner. Bitte die Netzverbindung prüfen.';
  if (/location|Standort|position/i.test(msg)) return 'Der Standort ist gerade nicht verfügbar. Bitte Ortungsdienste prüfen.';
  return `Die Navigation konnte nicht starten (${msg}).`;
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

export function useNavigation(req: NavRequest | null): [NavState, NavControls] {
  const [state, setState] = useState<NavState>(INITIAL);

  // veränderlicher Zustand außerhalb von React, damit Rückrufe immer den aktuellen Stand sehen
  const reqRef = useRef(req);
  const routeRef = useRef<NavRoute | null>(null);
  const hintRef = useRef(-1);
  const doneIndexRef = useRef(0);
  const offSinceRef = useRef<number | null>(null);
  const lastRerouteRef = useRef(0);
  const reroutingRef = useRef(false);
  const activeRef = useRef(false);
  const arrivedRef = useRef(false);
  /** Tatsächliches Tempo: geplante und gefahrene Minuten der jüngsten Kilometer (ältere zählen immer weniger) */
  const paceRef = useRef<{ at: number; km: number; plan: number; real: number } | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const simRef = useRef<{ timer: ReturnType<typeof setInterval>; km: number; speedKmh: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voiceRef = useRef<VoiceGuide | null>(null);
  const keepAwakeRef = useRef(false);
  /** Pause: Positionen werden nicht verarbeitet, keine Ansagen, die Simulation steht */
  const pausedRef = useRef(false);
  /** letzte Position (GPS oder Simulation), für Überspringen */
  const posRef = useRef<{ p: LatLon; h: number | null } | null>(null);

  useEffect(() => {
    reqRef.current = req;
  }, [req]);

  const voice = useCallback(() => {
    if (!voiceRef.current) voiceRef.current = createVoiceGuide();
    return voiceRef.current;
  }, []);

  const keepAwake = useCallback((on: boolean) => {
    if (on && !keepAwakeRef.current) {
      keepAwakeRef.current = true;
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else if (!on && keepAwakeRef.current) {
      keepAwakeRef.current = false;
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
  }, []);

  const stopSim = useCallback(() => {
    if (simRef.current) clearInterval(simRef.current.timer);
    simRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    subRef.current?.remove();
    subRef.current = null;
    stopSim();
    abortRef.current?.abort();
    abortRef.current = null;
    keepAwake(false);
    voiceRef.current?.stop();
  }, [keepAwake, stopSim]);

  const setRoute = useCallback(
    (route: NavRoute) => {
      routeRef.current = route;
      // Neue Routen beginnen am Standort (Anfahrt) oder am Tour Start: von vorne suchen. Sonst landet
      // man bei einer Runde, deren Start gleich Ziel ist, sofort am Ende (Ziel erreicht).
      hintRef.current = 0;
      doneIndexRef.current = 0;
      offSinceRef.current = null;
      voice().reset();
    },
    [voice],
  );

  /** Neue Route nach einer Abweichung holen, höchstens alle 20 s. */
  const reroute = useCallback(
    async (pos: LatLon, heading?: number | null) => {
      const r = reqRef.current;
      const current = routeRef.current;
      if (!r || !current || reroutingRef.current) return;
      reroutingRef.current = true;
      lastRerouteRef.current = Date.now();
      setState((s) => ({ ...s, status: 'neuberechnung' }));
      voice().say('Route wird neu berechnet.', true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { route } = await rejoinNavRoute(r, current, doneIndexRef.current, pos, ctrl.signal, heading);
        if (!activeRef.current) return;
        setRoute(route);
        setState((s) => ({ ...s, status: 'laeuft', route, error: undefined }));
      } catch (e) {
        if (isAbort(e) || !activeRef.current) return;
        // alte Route behalten, nächster Versuch frühestens in 20 s
        setState((s) => ({ ...s, status: 'laeuft', error: friendly(e) }));
      } finally {
        reroutingRef.current = false;
        offSinceRef.current = null;
      }
    },
    [setRoute, voice],
  );

  /** Eine neue Position verarbeiten (vom GPS oder aus der Simulation). */
  const onFix = useCallback(
    (fix: Fix) => {
      const route = routeRef.current;
      if (!activeRef.current || !route || arrivedRef.current) return;
      posRef.current = { p: fix.pos, h: fix.heading };
      // Fahrtrichtung nur bei Fahrt, im Stand ist der GPS Kurs Zufall
      const snap = snapToRoute(route, fix.pos, hintRef.current, (fix.speedKmh ?? 0) >= 12 ? fix.heading : null);
      hintRef.current = snap.index;
      if (snap.offM <= OFF_ROUTE_M) doneIndexRef.current = Math.max(doneIndexRef.current, snap.index);
      const pr = progress(route, snap.km);
      const end = route.shape[route.shape.length - 1];
      const toEndM = haversine(fix.pos, end);
      // angekommen erst, wenn man den größten Teil der Route gefahren ist (Runden enden am Start)
      const covered = route.km < 2 || route.cumKm[Math.min(doneIndexRef.current, route.cumKm.length - 1)] > route.km * 0.6;
      const arrived = toEndM < ARRIVE_M && pr.remainingKm < 0.3 && covered;

      // Ankunftszeit: geplante Restzeit mal dem bisherigen Tempo. Gezählt wird nur fahrend auf der Route,
      // Pausen und Umwege verfälschen es nicht; ältere Kilometer verlieren an Gewicht (etwa 20 km Halbwertszeit),
      // so passt sich die Ankunft laufend an Autobahn, Pässe oder Kolonne an.
      const p = paceRef.current;
      if (p && snap.offM <= OFF_ROUTE_M) {
        const dkm = snap.km - p.km;
        const dt = fix.at - p.at;
        if (dkm > 0 && dkm < 1 && dt > 0 && dt < 30000 && (fix.speedKmh ?? 0) > 3) {
          const decay = Math.exp(-dkm / 30);
          p.plan = p.plan * decay + (route.km > 0 ? (route.minutes * dkm) / route.km : 0);
          p.real = p.real * decay + dt / 60000;
        }
      }
      paceRef.current = { at: fix.at, km: snap.km, plan: p?.plan ?? 0, real: p?.real ?? 0 };
      const pp = paceRef.current;
      const pace = pp.plan > 4 ? Math.min(1.8, Math.max(0.6, pp.real / pp.plan)) : 1;
      const restMin = route.km > 0 ? route.minutes * (pr.remainingKm / route.km) * pace : 0;
      const eta = new Date(fix.at + restMin * 60000);

      if (arrived) {
        arrivedRef.current = true;
        voice().say('Sie haben das Ziel erreicht.', true);
        subRef.current?.remove();
        subRef.current = null;
        stopSim();
        keepAwake(false);
      } else {
        voice().update(route, pr.next, pr.distToNextM, fix.speedKmh);
      }

      // Abweichung erkennen
      const now = fix.at;
      if (!arrived && snap.offM > OFF_ROUTE_M) {
        if (offSinceRef.current == null) offSinceRef.current = now;
        if (now - offSinceRef.current > OFF_ROUTE_MS && Date.now() - lastRerouteRef.current > REROUTE_GAP_MS) {
          void reroute(fix.pos, fix.heading);
        }
      } else {
        offSinceRef.current = null;
      }

      setState((s) => ({
        ...s,
        status: arrived ? 'angekommen' : reroutingRef.current ? 'neuberechnung' : s.status === 'fehler' ? 'laeuft' : s.status,
        position: fix.pos,
        heading: fix.heading,
        speedKmh: fix.speedKmh,
        next: pr.next,
        distToNextM: arrived ? 0 : pr.distToNextM,
        remainingKm: arrived ? 0 : pr.remainingKm,
        eta: arrived ? new Date(fix.at) : eta,
        pace,
        offRouteM: snap.offM,
      }));
    },
    [keepAwake, reroute, stopSim, voice],
  );

  const start = useCallback(async () => {
    const r = reqRef.current;
    if (!r) {
      setState((s) => ({ ...s, status: 'fehler', error: 'Es ist keine Tour ausgewählt.' }));
      return;
    }
    cleanup();
    arrivedRef.current = false;
    paceRef.current = null;
    activeRef.current = true;
    setState((s) => ({ ...INITIAL, voice: s.voice, status: 'neuberechnung' }));

    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!activeRef.current) return;
      if (perm.status !== 'granted') {
        activeRef.current = false;
        setState((s) => ({
          ...s,
          status: 'fehler',
          error: 'Ohne Standort geht keine Navigation. Bitte in den Einstellungen den Standortzugriff für Expo Go erlauben.',
        }));
        return;
      }
      let here: LatLon | undefined;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        here = [loc.coords.latitude, loc.coords.longitude];
      } catch {
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) here = [last.coords.latitude, last.coords.longitude];
      }
      if (!activeRef.current) return;
      if (!here) throw new Error('Der Standort ist gerade nicht verfügbar. Bitte Ortungsdienste prüfen.');

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const { route } = await fetchNavRouteDetail(r, here, ctrl.signal);
      if (!activeRef.current) return;
      setRoute(route);
      lastRerouteRef.current = 0;
      keepAwake(true);
      setState((s) => ({ ...s, status: 'laeuft', route, position: here ?? null, error: undefined }));
      const first = route.maneuvers[0];
      if (first) voice().say(first.speech);

      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 10 },
        (loc) => {
          if (simRef.current || pausedRef.current) return; // Simulation hat Vorrang, Pause hält an
          const { latitude, longitude, heading, speed } = loc.coords;
          onFix({
            pos: [latitude, longitude],
            heading: heading != null && heading >= 0 ? heading : null,
            speedKmh: speed != null && speed >= 0 ? speed * 3.6 : null,
            at: loc.timestamp || Date.now(),
          });
        },
        (reason) => {
          if (activeRef.current) setState((s) => ({ ...s, error: `Standort Fehler: ${reason}` }));
        },
      );
      if (!activeRef.current) {
        subRef.current?.remove();
        subRef.current = null;
      }
    } catch (e) {
      if (isAbort(e)) return;
      cleanup();
      setState((s) => ({ ...s, status: 'fehler', error: friendly(e) }));
    }
  }, [cleanup, keepAwake, onFix, setRoute, voice]);

  /** Fahrt anhalten oder fortsetzen. In der Pause kommen keine Ansagen, Restzeit und Tempo stehen. */
  const pause = useCallback(
    (on: boolean) => {
      if (!activeRef.current || arrivedRef.current) return;
      pausedRef.current = on;
      voiceRef.current?.stop();
      setState((s) => (s.status === 'laeuft' || s.status === 'pausiert' ? { ...s, status: on ? 'pausiert' : 'laeuft' } : s));
    },
    [],
  );

  const stop = useCallback(() => {
    pausedRef.current = false;
    cleanup();
    arrivedRef.current = false;
    routeRef.current = null;
    setState((s) => ({ ...INITIAL, voice: s.voice }));
  }, [cleanup]);

  const setVoice = useCallback(
    (on: boolean) => {
      voice().setEnabled(on);
      setState((s) => ({ ...s, voice: on }));
    },
    [voice],
  );

  const say = useCallback((text: string) => voice().say(text), [voice]);

  /**
   * Simulation ohne GPS. Braucht eine Route; läuft noch keine, wird sie ab dem Tour Anfang
   * geholt (ohne Standort Abfrage). Startet an der aktuellen Stelle auf der Route.
   */
  const simulate = useCallback(
    (on: boolean, speedKmh = 70) => {
      stopSim();
      if (!on) return;
      const begin = (route: NavRoute) => {
        const snapKm = hintRef.current >= 0 ? route.cumKm[hintRef.current] : 0;
        const sim = { km: snapKm, speedKmh, timer: setInterval(() => tick(), SIM_TICK_MS) };
        simRef.current = sim;
        keepAwake(true);
        const tick = () => {
          const r = routeRef.current;
          if (!r || simRef.current !== sim || pausedRef.current) return;
          sim.km = Math.min(r.km, sim.km + (sim.speedKmh / 3600) * (SIM_TICK_MS / 1000));
          const p = pointAtKm(r, sim.km);
          onFix({ pos: p.point, heading: p.heading, speedKmh: sim.speedKmh, at: Date.now() });
          if (sim.km >= r.km) stopSim();
        };
        tick();
      };
      if (routeRef.current && activeRef.current && !arrivedRef.current) {
        begin(routeRef.current);
        return;
      }
      const r = reqRef.current;
      if (!r) {
        setState((s) => ({ ...s, status: 'fehler', error: 'Es ist keine Tour ausgewählt.' }));
        return;
      }
      cleanup();
      arrivedRef.current = false;
      activeRef.current = true;
      setState((s) => ({ ...INITIAL, voice: s.voice, status: 'neuberechnung' }));
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      fetchNavRouteDetail(r, undefined, ctrl.signal)
        .then(({ route }) => {
          if (!activeRef.current) return;
          setRoute(route);
          setState((s) => ({ ...s, status: 'laeuft', route, error: undefined }));
          const first = route.maneuvers[0];
          if (first) voice().say(first.speech);
          begin(route);
        })
        .catch((e) => {
          if (isAbort(e)) return;
          cleanup();
          setState((s) => ({ ...s, status: 'fehler', error: friendly(e) }));
        });
    },
    [cleanup, keepAwake, onFix, setRoute, stopSim, voice],
  );

  /** Zwischenziel überspringen: wie eine Neuberechnung, aber zurück auf die Route erst ab index */
  const skipTo = useCallback(
    async (index: number): Promise<SkipUndo | null> => {
      const r = reqRef.current;
      const current = routeRef.current;
      const pos = posRef.current;
      if (!r || !current || !pos || !activeRef.current || arrivedRef.current || reroutingRef.current) return null;
      const undo: SkipUndo = { route: current, done: doneIndexRef.current, hint: hintRef.current };
      reroutingRef.current = true;
      lastRerouteRef.current = Date.now();
      setState((s) => ({ ...s, status: 'neuberechnung' }));
      voice().say('Das nächste Zwischenziel wird übersprungen.', true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { route } = await rejoinNavRoute(r, current, index, pos.p, ctrl.signal, pos.h);
        if (!activeRef.current) return null;
        setRoute(route);
        // die Simulation fährt auf der neuen Route am Standort weiter
        if (simRef.current) simRef.current.km = 0;
        setState((s) => ({ ...s, status: pausedRef.current ? 'pausiert' : 'laeuft', route, error: undefined }));
        return undo;
      } catch (e) {
        if (!isAbort(e) && activeRef.current) setState((s) => ({ ...s, status: 'laeuft', error: friendly(e) }));
        return null;
      } finally {
        reroutingRef.current = false;
        offSinceRef.current = null;
      }
    },
    [setRoute, voice],
  );

  const restore = useCallback(
    (u: SkipUndo) => {
      if (!activeRef.current) return;
      setRoute(u.route);
      doneIndexRef.current = u.done;
      hintRef.current = u.hint;
      if (simRef.current) simRef.current.km = u.route.cumKm[Math.max(0, u.hint)] ?? 0;
      lastRerouteRef.current = Date.now();
      setState((s) => ({ ...s, route: u.route }));
    },
    [setRoute],
  );

  // beim Verlassen des Screens alles aufräumen
  useEffect(() => cleanup, [cleanup]);

  // andere Tour: laufende Navigation beenden
  useEffect(() => {
    if (!activeRef.current) return;
    cleanup();
    routeRef.current = null;
    setState((s) => ({ ...INITIAL, voice: s.voice }));
  }, [req?.tour, cleanup]);

  return [state, { start, stop, pause, setVoice, say, simulate, skipTo, restore }];
}
