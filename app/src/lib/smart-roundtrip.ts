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
import { ghRoundTripCandidates, graphhopperKey, scoreRoute, type GhRoute } from './graphhopper';
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

export type Engine = 'graphhopper' | 'valhalla';
export type SmartTour = PlannedTour & { engine: Engine; score: number; curves: number };

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
