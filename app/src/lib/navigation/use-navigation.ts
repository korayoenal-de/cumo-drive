/**
 * React Hook für die Routenführung: Standort, Anweisungen, Fortschritt, Ansagen, Neuberechnung.
 * Läuft in Expo Go (expo-location, expo-speech, expo-keep-awake sind dort enthalten).
 * Standort nur im Vordergrund; Hintergrund Ortung bräuchte einen eigenen Build.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { carPlayCamera } from '../carplay';
import { haversine, type LatLon } from '../tour';
import { replanFromHere } from './replan';
import { fetchNavRouteDetail, rejoinNavRoute } from './route';
import { pointAtKm, progress, snapToRoute } from './tracker';
import type { NavControls, NavRequest, NavRoute, NavState, SkipUndo } from './types';
import { edgesAlong, exitWord, forksIn, roundaboutByDirection, roundaboutExits, slice, withForks } from './junctions';
import { roundaboutTurn } from './roundabout';
import { townAfter, wantsToward, withToward } from './toward';
import { bbGps, bbLog, bbRoute, bbStart, bbStop } from './blackbox';
import { createVoiceGuide, speakText, type VoiceGuide } from './voice';

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

/** Sprachansagen an oder aus, über Fahrten hinweg gemerkt (Testfahrer 8.11.: war bei jeder Fahrt wieder an) */
const VOICE_KEY = 'cumo.drive.stimme.v1';

/** virtual: im Tunnel fortgeschrieben, kein GPS; accuracy: Genauigkeit des GPS in Metern */
type Fix = { pos: LatLon; heading: number | null; speedKmh: number | null; at: number; accuracy?: number | null; virtual?: boolean };

/**
 * Tunnel (Navigationsklassiker): ohne GPS stand das Auto still oder sprang danach. Kommt länger als 2,5 s keine
 * brauchbare Position, fährt die Anzeige mit dem letzten Tempo auf der Route weiter, höchstens 3 Minuten und
 * 5 km, nur wenn man vorher auf der Route und schneller als 20 km/h war.
 */
const DR_AFTER_MS = 2500;
const DR_MAX_MS = 180000;
const DR_MAX_KM = 5;
const DR_MIN_KMH = 20;
/** Positionen ungenauer als das gelten im Tunnel als unbrauchbar */
const DR_BAD_ACCURACY_M = 80;
/** Parallel zur Route und nah dran (Brücke, Nebenstraße, GPS Versatz): erst nach dieser Zeit abweichend */
const PARALLEL_MS = 16000;
const PARALLEL_M = 130;
const PARALLEL_DEG = 25;

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
  const lastNextRef = useRef(-1);
  /** Tunnel: letzte echte Position auf der Route und ob gerade fortgeschrieben wird */
  const drRef = useRef<{
    last: { at: number; km: number; speedKmh: number | null; offM: number } | null;
    lastGood: number;
    active: boolean;
    timer: ReturnType<typeof setInterval> | null;
  }>({ last: null, lastGood: 0, active: false, timer: null });
  /** letzte Position (GPS oder Simulation), für Überspringen */
  const posRef = useRef<{ p: LatLon; h: number | null } | null>(null);
  /** Wie oft hintereinander die Rückführung auf die Tour ignoriert wurde */
  const ignoredRef = useRef(0);
  /** darf die App nach zweimal Ignorieren selbst neu planen (allein ja, in der Gruppe nein) */
  const autoFreshRef = useRef(true);

  useEffect(() => {
    reqRef.current = req;
    ignoredRef.current = 0;
  }, [req]);

  const voice = useCallback(() => {
    // jede Ansage auch in die Blackbox
    if (!voiceRef.current)
      voiceRef.current = createVoiceGuide((t) => {
        bbLog('say', t);
        speakText(t);
      });
    return voiceRef.current;
  }, []);

  // gemerkte Wahl laden
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(VOICE_KEY)
      .then((v) => {
        if (!alive || v !== '0') return;
        voice().setEnabled(false);
        setState((s) => ({ ...s, voice: false }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [voice]);

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
    if (activeRef.current) bbStop();
    activeRef.current = false;
    subRef.current?.remove();
    subRef.current = null;
    stopSim();
    if (drRef.current.timer) clearInterval(drRef.current.timer);
    drRef.current = { last: null, lastGood: 0, active: false, timer: null };
    abortRef.current?.abort();
    abortRef.current = null;
    keepAwake(false);
    voiceRef.current?.stop();
  }, [keepAwake, stopSim]);

  const setRoute = useCallback(
    (route: NavRoute) => {
      routeRef.current = route;
      bbRoute(route);
      // Neue Routen beginnen am Standort (Anfahrt) oder am Tour Start: von vorne suchen. Sonst landet
      // man bei einer Runde, deren Start gleich Ziel ist, sofort am Ende (Ziel erreicht).
      hintRef.current = 0;
      doneIndexRef.current = 0;
      offSinceRef.current = null;
      voice().reset();
    },
    [voice],
  );

  /**
   * Orte an den nächsten Abzweigungen ergänzen (Tester Gregor 12.11.), im Hintergrund und nur für die
   * nächsten drei Manöver: so steht der Ort, bevor die erste Ansage kommt, und es gibt kaum Abfragen.
   */
  const towardTried = useRef(new Set<string>());
  /** Route ersetzen, ohne Fortschritt und Ansagen zurückzusetzen (Ergänzungen im Hintergrund) */
  const patchRoute = useCallback((base: NavRoute, change: (cur: NavRoute) => NavRoute | null) => {
    const cur = routeRef.current;
    // dieselbe Route (eine Ergänzung davor ersetzt nur das Objekt, nicht die Linie)
    if (!activeRef.current || !cur || cur.shape !== base.shape) return;
    const updated = change(cur);
    if (!updated) return;
    // vollständig, damit sich die Fahrt nachspielen lässt: [km, Art, Text, Ansage, Ausfahrt, Index]
    const added = updated.maneuvers
      .filter((m) => !cur.maneuvers.includes(m))
      .map((m) => [Math.round(m.km * 1000) / 1000, m.kind, m.text, m.speech, m.exit ?? null, m.index]);
    if (added.length) bbLog('enrich', added);
    routeRef.current = updated;
    setState((s) => (s.route === cur ? { ...s, route: updated } : s));
  }, []);

  const enrichAhead = useCallback(
    (route: NavRoute, next: number) => {
      for (let i = next; i < Math.min(route.maneuvers.length, next + 3); i++) {
        const m = route.maneuvers[i];
        const key = `${m.km.toFixed(2)}|${m.text}`;
        if (towardTried.current.has(key)) continue;
        const round = m.kind === 'kreisverkehr' && m.exit != null;
        if (!round && !wantsToward(m)) continue;
        towardTried.current.add(key);
        void (async () => {
          let out = m;
          // Kreisverkehr: zählt Valhalla eine Zufahrt oder einen Wirtschaftsweg mit, gilt die Richtung statt der Zahl
          if (round) {
            const s = slice(route, m.km - 0.08, m.km + 0.5, 0);
            const ex = s.points.length >= 2 ? roundaboutExits((await edgesAlong(s.points)).edges) : null;
            const word = exitWord(roundaboutTurn(route, i));
            if (ex && word && (ex.all !== ex.real || ex.all !== m.exit)) out = roundaboutByDirection(m, word);
          }
          if (wantsToward(out)) {
            const town = await townAfter(route, out).catch(() => null);
            if (town) out = withToward(out, town);
          }
          if (out === m) return;
          patchRoute(route, (cur) => ({ ...cur, maneuvers: cur.maneuvers.map((x) => (x.index === m.index && x.text === m.text ? out : x)) }));
        })().catch(() => undefined);
      }
    },
    [patchRoute],
  );

  /**
   * Gabelungen ohne Hinweis (Klassiker: die Straße teilt sich, die App schweigt): die nächsten 6 km der Route
   * ansehen, sobald man auf 3 km an das Ende des geprüften Stücks herankommt.
   */
  const forkScan = useRef<{ shape: LatLon[] | null; toKm: number; busy: boolean }>({ shape: null, toKm: 0, busy: false });
  const scanForks = useCallback(
    (route: NavRoute, atKm: number) => {
      const f = forkScan.current;
      if (f.shape !== route.shape) {
        f.shape = route.shape;
        f.toKm = 0;
        f.busy = false;
      }
      if (f.busy || f.toKm >= route.km || f.toKm - atKm > 3) return;
      const from = Math.max(atKm, f.toKm);
      const to = Math.min(route.km, from + 6);
      f.busy = true;
      const shape = route.shape;
      const s = slice(route, from, to + 0.05, 25);
      void edgesAlong(s.points)
        .then(({ edges, shape: sh }) => {
          const forks = forksIn(edges, sh);
          if (forks.length) patchRoute(route, (cur) => withForks(cur, forks, s.from, s.to));
        })
        .catch(() => undefined)
        .finally(() => {
          if (forkScan.current.shape !== shape) return;
          forkScan.current.toKm = to;
          forkScan.current.busy = false;
        });
    },
    [patchRoute],
  );

  /** Neue Route nach einer Abweichung holen, höchstens alle 20 s. */
  const reroute = useCallback(
    /** mode: auto nach Regel, rejoin oder fresh, wenn die Fahrerin selbst gewählt hat (Martin 11.11.) */
    async (pos: LatLon, heading?: number | null, mode: 'auto' | 'rejoin' | 'fresh' = 'auto') => {
      const r = reqRef.current;
      const current = routeRef.current;
      if (!r || !current || reroutingRef.current) return;
      reroutingRef.current = true;
      lastRerouteRef.current = Date.now();
      setState((s) => ({ ...s, status: 'neuberechnung' }));
      // Zweimal die Rückführung ignoriert: bewusst anders gefahren, also ab hier neu planen (Koray 11.11.)
      // in der Gruppe nie von selbst: das würde einen still von der Gruppe trennen (Koray 11.11.)
      const fresh = mode === 'fresh' || (mode === 'auto' && ignoredRef.current >= 2 && autoFreshRef.current);
      const t0 = Date.now();
      bbLog('reroute', [mode, fresh ? 'neu' : 'zurueck', 'start']);
      voice().say(fresh ? 'Neue Route ab hier.' : 'Route wird neu berechnet.', true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        let route: NavRoute;
        if (fresh) {
          const out = await replanFromHere(r, pos, ctrl.signal, heading);
          reqRef.current = out.req;
          route = out.route;
          ignoredRef.current = 0;
        } else {
          route = (await rejoinNavRoute(r, current, doneIndexRef.current, pos, ctrl.signal, heading)).route;
          ignoredRef.current += 1;
        }
        if (!activeRef.current) return;
        bbLog('reroute', [mode, fresh ? 'neu' : 'zurueck', 'ok', Date.now() - t0]);
        setRoute(route);
        setState((s) => ({ ...s, status: 'laeuft', route, error: undefined }));
      } catch (e) {
        bbLog('reroute', [mode, fresh ? 'neu' : 'zurueck', 'fehler', Date.now() - t0, e instanceof Error ? e.message.slice(0, 120) : '']);
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
      // Im Tunnel liefert das GPS oft noch Positionen, aber weit daneben: dann weiter fortschreiben
      const bad = !fix.virtual && (fix.accuracy ?? 0) > DR_BAD_ACCURACY_M;
      if (bad && drRef.current.active) return;
      if (!fix.virtual && !bad) drRef.current.lastGood = fix.at;
      posRef.current = { p: fix.pos, h: fix.heading };
      // So weit kann man seit der letzten Position höchstens gekommen sein (Serpentinen, Kehren übereinander)
      const last = drRef.current.last;
      const dtS = last ? Math.max(0, (fix.at - last.at) / 1000) : 0;
      const maxAheadM = last && dtS > 0 && dtS < 30 ? Math.max(fix.speedKmh ?? 0, last.speedKmh ?? 0, 30) / 3.6 * dtS * 1.6 + 60 : undefined;
      // Fahrtrichtung nur bei Fahrt, im Stand ist der GPS Kurs Zufall
      const snap = snapToRoute(route, fix.pos, hintRef.current, (fix.speedKmh ?? 0) >= 12 ? fix.heading : null, maxAheadM);
      if (!fix.virtual) {
        drRef.current.last = { at: fix.at, km: snap.km, speedKmh: fix.speedKmh, offM: snap.offM };
        if (!bad && drRef.current.active) bbLog('dr', 'aus');
        if (!bad) drRef.current.active = false;
      }
      bbGps(fix.pos, { kmh: fix.speedKmh, heading: fix.heading, accuracy: fix.accuracy, offM: snap.offM, km: snap.km, virtual: fix.virtual }, fix.at);
      hintRef.current = snap.index;
      if (snap.offM <= OFF_ROUTE_M) doneIndexRef.current = Math.max(doneIndexRef.current, snap.index);
      // Nach einer Rückführung wieder 1 km auf der Route: die Abweichung war ein Versehen, Zählung von vorn
      if (snap.offM <= OFF_ROUTE_M && snap.km > 1) ignoredRef.current = 0;
      const pr = progress(route, snap.km);
      if (pr.next !== lastNextRef.current) {
        lastNextRef.current = pr.next;
        const nm = route.maneuvers[pr.next];
        bbLog('next', nm ? [nm.text, Math.round(pr.distToNextM ?? 0)] : null);
      }
      const end = route.shape[route.shape.length - 1];
      const toEndM = haversine(fix.pos, end);
      // angekommen erst, wenn man den größten Teil der Route gefahren ist (Runden enden am Start)
      const covered = route.km < 2 || route.cumKm[Math.min(doneIndexRef.current, route.cumKm.length - 1)] > route.km * 0.6;
      const arrived = toEndM < ARRIVE_M && pr.remainingKm < 0.3 && covered;

      // Ankunftszeit: geplante Restzeit mal dem bisherigen Tempo. Gezählt wird nur fahrend auf der Route,
      // Pausen und Umwege verfälschen es nicht; ältere Kilometer verlieren an Gewicht (etwa 20 km Halbwertszeit),
      // so passt sich die Ankunft laufend an Autobahn, Pässe oder Kolonne an.
      const p = paceRef.current;
      if (p && !fix.virtual && snap.offM <= OFF_ROUTE_M) {
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
        voice().say('Du bist am Ziel.', true);
        subRef.current?.remove();
        subRef.current = null;
        stopSim();
        keepAwake(false);
      } else {
        enrichAhead(route, pr.next);
        scanForks(route, snap.km);
        voice().update(route, pr.next, pr.distToNextM, fix.speedKmh);
      }

      // Abweichung erkennen: ungenaue Positionen zählen mit ihrer Ungenauigkeit, fortgeschriebene gar nicht.
      // Läuft man parallel zur Route und nah dran (Brücke über Unterführung, Nebenstraße neben der Bundesstraße,
      // GPS Versatz in der Stadt), wartet die App doppelt so lange, bevor sie neu plant.
      const now = fix.at;
      const offLimit = Math.max(OFF_ROUTE_M, (fix.accuracy ?? 0) * 1.5);
      const along = pointAtKm(route, snap.km).heading;
      const parallel =
        fix.heading != null && (fix.speedKmh ?? 0) >= 12 && snap.offM < PARALLEL_M && Math.abs((((fix.heading - along) % 360) + 540) % 360 - 180) < PARALLEL_DEG;
      if (!arrived && !fix.virtual && snap.offM > offLimit) {
        if (offSinceRef.current == null) offSinceRef.current = now;
        if (now - offSinceRef.current > (parallel ? PARALLEL_MS : OFF_ROUTE_MS) && Date.now() - lastRerouteRef.current > REROUTE_GAP_MS) {
          void reroute(fix.pos, fix.heading);
        }
      } else {
        offSinceRef.current = null;
      }

      // Kamera im Auto direkt bei jeder Position, nicht erst über React: bei gesperrtem iPhone laufen die Effekte
      // erst wieder, wenn der Bildschirm angeht, und das Auto fuhr aus dem Bild (Tester Tom 11.11.). Ohne CarPlay tut das nichts.
      // Auf der Route: Punkt auf der Linie und Richtung der Straße (Koray 12.11.: das Auto stand schief neben der Spur)
      if (snap.offM <= OFF_ROUTE_M) {
        const on = pointAtKm(route, snap.km);
        carPlayCamera(on.point, on.heading);
      } else if (fix.heading != null) carPlayCamera(fix.pos, fix.heading);

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
        ignored: ignoredRef.current,
      }));
    },
    [enrichAhead, keepAwake, reroute, scanForks, stopSim, voice],
  );

  const start = useCallback(async () => {
    const r = reqRef.current;
    if (!r) {
      setState((s) => ({ ...s, status: 'fehler', error: 'Es ist keine Tour ausgewählt.' }));
      return;
    }
    cleanup();
    bbStart();
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
          const { latitude, longitude, heading, speed, accuracy } = loc.coords;
          onFix({
            pos: [latitude, longitude],
            heading: heading != null && heading >= 0 ? heading : null,
            speedKmh: speed != null && speed >= 0 ? speed * 3.6 : null,
            at: loc.timestamp || Date.now(),
            accuracy,
          });
        },
        (reason) => {
          if (activeRef.current) setState((s) => ({ ...s, error: `Standort Fehler: ${reason}` }));
        },
      );
      if (!activeRef.current) {
        subRef.current?.remove();
        subRef.current = null;
      } else {
        // Tunnel: jede Sekunde prüfen, ob eine brauchbare Position fehlt, und dann auf der Route weiterfahren
        if (drRef.current.timer) clearInterval(drRef.current.timer);
        drRef.current.timer = setInterval(() => {
          const d = drRef.current;
          const r = routeRef.current;
          const last = d.last;
          if (!r || !last || simRef.current || pausedRef.current || arrivedRef.current || !activeRef.current) return;
          const now = Date.now();
          const since = now - Math.max(d.lastGood, last.at);
          if (since < DR_AFTER_MS || since > DR_MAX_MS) {
            d.active = false;
            return;
          }
          if ((last.speedKmh ?? 0) < DR_MIN_KMH || last.offM > OFF_ROUTE_M) return;
          const km = Math.min(r.km, last.km + Math.min(DR_MAX_KM, ((last.speedKmh ?? 0) / 3.6) * (now - last.at) / 1000 / 1000));
          const p = pointAtKm(r, km);
          if (!d.active) bbLog('dr', 'an');
          d.active = true;
          onFix({ pos: p.point, heading: p.heading, speedKmh: last.speedKmh, at: now, virtual: true });
        }, 1000);
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
      AsyncStorage.setItem(VOICE_KEY, on ? '1' : '0').catch(() => undefined);
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
    async (index: number, fast = false, speech = 'Das nächste Zwischenziel wird übersprungen.'): Promise<SkipUndo | null> => {
      const r = reqRef.current;
      const current = routeRef.current;
      const pos = posRef.current;
      if (!r || !current || !pos || !activeRef.current || arrivedRef.current || reroutingRef.current) return null;
      const undo: SkipUndo = { route: current, done: doneIndexRef.current, hint: hintRef.current };
      reroutingRef.current = true;
      lastRerouteRef.current = Date.now();
      setState((s) => ({ ...s, status: 'neuberechnung' }));
      voice().say(speech, true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { route } = await rejoinNavRoute(r, current, index, pos.p, ctrl.signal, pos.h, fast);
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

  /** Wahl bei einer Abweichung: zurück zur Tour oder neue Route ab hier, sofort */
  const choose = useCallback(
    (mode: 'rejoin' | 'fresh') => {
      const pos = posRef.current;
      if (!pos || !activeRef.current) return;
      void reroute(pos.p, pos.h, mode);
    },
    [reroute],
  );

  /** Zurück zur ursprünglichen Tour (Gruppe): Weg zum nächsten Punkt der Tour, dann ihr folgen */
  const backToTour = useCallback(async () => {
    const pos = posRef.current;
    if (!pos || !activeRef.current || !req || reroutingRef.current) return;
    reroutingRef.current = true;
    lastRerouteRef.current = Date.now();
    setState((s) => ({ ...s, status: 'neuberechnung' }));
    voice().say('Zurück zur Tour der Gruppe.', true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      reqRef.current = req;
      // am nächsten Punkt der Tour einsteigen, nicht zurück zum Start
      const { route } = await fetchNavRouteDetail({ ...req, entry: undefined }, pos.p, ctrl.signal);
      if (!activeRef.current) return;
      ignoredRef.current = 0;
      setRoute(route);
      setState((s) => ({ ...s, status: 'laeuft', route, error: undefined }));
    } catch (e) {
      if (isAbort(e) || !activeRef.current) return;
      setState((s) => ({ ...s, status: 'laeuft', error: friendly(e) }));
    } finally {
      reroutingRef.current = false;
      offSinceRef.current = null;
    }
  }, [req, setRoute, voice]);

  const setAutoFresh = useCallback((on: boolean) => {
    autoFreshRef.current = on;
  }, []);

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

  return [state, { start, stop, pause, setVoice, say, simulate, skipTo, restore, choose, backToTour, setAutoFresh }];
}
