/**
 * Rundtour mit dem besten verfügbaren Routing.
 *
 * Valhalla baut eine Runde ohne Autobahn (Via Punkte im Hügelland), GraphHopper liefert,
 * wenn ein Schlüssel hinterlegt ist, mehrere Zufallsrunden mit Kurven, Breiten und
 * Straßenklassen. Alle Kandidaten werden mit derselben Bewertung verglichen und die beste
 * Runde gewinnt, die den Etappen Check besteht.
 *
 * Grenze heute: Keiner der beiden öffentlichen Dienste kann Kurven aktiv bevorzugen. Das
 * leistet erst ein eigener Routing Server mit Sportwagen Profil.
 */
import { checkLine } from './check';
import { cumoAvailable, cumoRoundTrips } from './cumo-routing';
import { ghRoundTripCandidates, graphhopperKey, scoreRoute, type GhRoute } from './graphhopper';
import { PASSES, passLoopVia, TIER_WEIGHT } from './passes';
import { planChecked, type PlannedTour, type PlanStep } from './plan';
import { DIRECTIONS, roundTrip, type Direction } from './roundtrip';
import { countCurves } from './stats';
import { flatten, type LatLon, type Profile } from './tour';
import type { Avoid } from './valhalla';

export type SmartRequest = {
  name: string;
  start: LatLon;
  km: number;
  direction: Direction;
  bearing?: number;
  profile: Profile;
  avoid: Avoid;
  seed?: number;
};

export type Engine = 'cumo' | 'graphhopper' | 'valhalla';
export type SmartTour = PlannedTour & { engine: Engine; score: number; curves: number; passes?: string[] };

/** Gleiche Bewertung für alle Kandidaten; gesperrte km wiegen schwer. */
function scoreTour(t: PlannedTour, curves: number, fastKm: number, targetKm: number): number {
  const ghLike: GhRoute = {
    shape: [], km: t.laenge_km, minutes: t.minutes, curvyShare: 0, curves, narrowKm: 0, unpavedKm: 0, fastKm, seed: 0,
  };
  return scoreRoute(ghLike, targetKm) - (t.km_je_klasse?.raus ?? 0) * 40;
}

export async function smartRoundTrip(req: SmartRequest, onStep?: (s: PlanStep) => void, signal?: AbortSignal): Promise<SmartTour> {
  const seed = req.seed ?? Math.floor(Math.random() * 1e6);
  const heading =
    req.bearing ?? (req.direction === 'zufall' ? seed % 360 : DIRECTIONS.find((d) => d.id === req.direction)!.bearing);
  const candidates: SmartTour[] = [];
  let lastError: unknown = null;

  // Pässe Profil: gezielt über bekannte Pässe in Reichweite, die jetzt offen sind.
  // Bergstraßen sind viel länger als die Luftlinie; passt die Länge nicht, wird die Reichweite
  // nachgeregelt und neu gewählt (höchstens drei Versuche).
  if (req.profile === 'paesse') {
    const month = new Date().getMonth() + 1;
    const dir = req.direction === 'zufall' && req.bearing === undefined ? null : heading;
    const own = await cumoAvailable();
    let reachKm = req.km;
    const tried = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const loop = passLoopVia(PASSES, req.start, reachKm, dir, month);
      if (!loop) break;
      const key = loop.passes.map((p) => p.id).join('+');
      if (tried.has(key)) break;
      tried.add(key);
      try {
        onStep?.('route');
        const t = await planChecked(req.name, [req.start, ...loop.via, req.start], req.profile, req.avoid, onStep, signal, true);
        const curves = countCurves(flatten(t).map((x) => x.p));
        const bonus = loop.passes.reduce((sum, p) => sum + TIER_WEIGHT[p.tier] * 15, 0);
        const cand: SmartTour = {
          ...t,
          engine: own ? 'cumo' : 'valhalla',
          curves,
          score: scoreTour(t, curves, 0, req.km) + bonus,
          passes: loop.passes.map((p) => p.name),
        };
        candidates.push(cand);
        const ratio = t.laenge_km / req.km;
        if ((t.km_je_klasse?.raus ?? 0) === 0 && ratio > 0.7 && ratio < 1.3) return cand;
        reachKm = reachKm / Math.max(0.5, Math.min(2.5, ratio));
      } catch (e) {
        if (signal?.aborted) throw e;
        lastError = e;
        break;
      }
    }
    const fit = candidates.filter((c) => (c.km_je_klasse?.raus ?? 0) === 0 && c.laenge_km < req.km * 1.5);
    if (fit.length) return fit.sort((a, b) => b.score - a.score)[0];
  }

  // 0. Eigener Routing Server: Sportwagen Profil mit Kurven, mehrere Varianten, alles lokal
  if (await cumoAvailable()) {
    try {
      onStep?.('route');
      // Ohne Richtung in sechs Richtungen suchen: so gewinnt das Hügelland mit Kurven statt der Weg durch die Ebene und Städte
      const free = req.direction === 'zufall' && req.bearing === undefined;
      const own = await cumoRoundTrips(req.name, req.start, req.km, heading, req.profile, req.avoid, free ? 6 : 5, seed % 100000, signal, free);
      for (const t of own) candidates.push({ ...t, engine: 'cumo', score: scoreTour(t, t.curves, 0, req.km) });
      const clean = candidates.filter((c) => (c.km_je_klasse?.raus ?? 0) === 0);
      if (clean.length) return clean.sort((a, b) => b.score - a.score)[0];
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }

  // 1. Valhalla: ohne Autobahn, Via Punkte im Hügelland, geprüft und umgeplant
  onStep?.('route');
  try {
    const r = await roundTrip(
      { start: req.start, km: req.km, direction: req.direction, bearing: heading, profile: req.profile, avoid: req.avoid, seed },
      signal,
    );
    const t = await planChecked(req.name, [req.start, ...r.via, req.start], req.profile, req.avoid, onStep, signal, true);
    const curves = countCurves(flatten(t).map((x) => x.p));
    candidates.push({ ...t, engine: 'valhalla', curves, score: scoreTour(t, curves, 0, req.km) });
  } catch (e) {
    if (signal?.aborted) throw e;
    lastError = e;
  }

  // 2. GraphHopper Varianten, nur für kurvige Profile und mit Schlüssel
  if (graphhopperKey() && req.profile !== 'schnell') {
    try {
      onStep?.('route');
      const gh = await ghRoundTripCandidates(req.start, req.km, heading, 4, seed % 100000, signal);
      for (const c of gh.slice(0, 2)) {
        onStep?.('check');
        const chk = await checkLine(c.shape, undefined, signal);
        const t: PlannedTour = {
          name: req.name, wegpunkte: [req.start, req.start], ...chk, laenge_km: +c.km.toFixed(1), minutes: c.minutes, geprueft: true, fixes: 0,
        };
        candidates.push({ ...t, engine: 'graphhopper', curves: c.curves, score: scoreTour(t, c.curves, c.fastKm, req.km) });
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = lastError ?? e;
    }
  }

  if (!candidates.length) throw lastError ?? new Error('Keine Rundtour gefunden.');
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}
