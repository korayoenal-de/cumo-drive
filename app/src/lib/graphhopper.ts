/**
 * GraphHopper Anbindung (Prototyp mit kostenlosem Schlüssel).
 *
 * Das kostenlose Paket erlaubt keine eigenen Profile, liefert aber Rundtouren und pro
 * Abschnitt Kurvigkeit, Höchstbreite und Belag. Wir erzeugen daher mehrere Varianten und
 * nehmen die kurvigste, die unsere Regeln erfüllt.
 *
 * Achtung: Der Schlüssel steckt im Browser Code (EXPO_PUBLIC_). Für den Betrieb laufen
 * Anfragen später über unseren Server.
 */
import { countCurves } from './stats';
import { haversine, type LatLon } from './tour';

const URL_ROUTE = 'https://graphhopper.com/api/1/route';

export function graphhopperKey(): string | undefined {
  return process.env.EXPO_PUBLIC_GRAPHHOPPER_KEY || undefined;
}

type Detail = [number, number, number | string | null];

export type GhRoute = {
  shape: LatLon[];
  km: number;
  minutes: number;
  /** Anteil der Strecke mit Kurvigkeit unter 0,8 (1 heißt gerade) */
  curvyShare: number;
  curves: number;
  /** km mit Höchstbreite unter 2,5 m */
  narrowKm: number;
  /** km mit unbefestigtem Belag laut GraphHopper */
  unpavedKm: number;
  /** km auf Autobahn und Schnellstraße */
  fastKm: number;
  seed: number;
};

const UNPAVED = new Set(['unpaved', 'gravel', 'dirt', 'ground', 'grass', 'compacted', 'fine_gravel', 'sand', 'mud']);

function segKm(shape: LatLon[], a: number, b: number) {
  let d = 0;
  for (let i = a + 1; i <= b; i++) d += haversine(shape[i - 1], shape[i]);
  return d / 1000;
}

export async function ghRoundTrip(start: LatLon, km: number, heading: number, seed: number, signal?: AbortSignal): Promise<GhRoute> {
  const key = graphhopperKey();
  if (!key) throw new Error('Kein GraphHopper Schlüssel hinterlegt.');
  const res = await fetch(`${URL_ROUTE}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      points: [[start[1], start[0]]],
      profile: 'car',
      algorithm: 'round_trip',
      'round_trip.distance': Math.round(km * 1000),
      'round_trip.seed': seed,
      heading: [heading],
      points_encoded: false,
      instructions: false,
      details: ['curvature', 'max_width', 'surface', 'road_class'],
    }),
  });
  const data = (await res.json()) as {
    message?: string;
    paths?: { distance: number; time: number; points: { coordinates: [number, number][] }; details: Record<string, Detail[]> }[];
  };
  if (!res.ok || !data.paths?.length) throw new Error(`GraphHopper: ${data.message ?? `Fehler ${res.status}`}`);
  const p = data.paths[0];
  const shape: LatLon[] = p.points.coordinates.map(([lon, lat]) => [lat, lon]);
  const total = p.distance / 1000;
  let curvy = 0;
  let narrow = 0;
  let unpaved = 0;
  let fast = 0;
  for (const [a, b, v] of p.details.curvature ?? []) if (typeof v === 'number' && v < 0.8) curvy += segKm(shape, a, b);
  for (const [a, b, v] of p.details.max_width ?? []) if (typeof v === 'number' && v < 2.5) narrow += segKm(shape, a, b);
  for (const [a, b, v] of p.details.surface ?? []) if (typeof v === 'string' && UNPAVED.has(v)) unpaved += segKm(shape, a, b);
  for (const [a, b, v] of p.details.road_class ?? []) if (v === 'motorway' || v === 'trunk') fast += segKm(shape, a, b);
  return {
    shape,
    km: total,
    minutes: p.time / 60000,
    curvyShare: total ? curvy / total : 0,
    curves: countCurves(shape),
    narrowKm: narrow,
    unpavedKm: unpaved,
    fastKm: fast,
    seed,
  };
}

/**
 * Bewertung einer Variante: Kurven pro 100 km und kurviger Anteil zählen positiv; Abzug für
 * Schmales, Unbefestigtes, Autobahn und Schnellstraße (Anteil) und Abweichung von der Wunschlänge.
 */
export function scoreRoute(r: GhRoute, targetKm: number): number {
  const per100 = r.km ? (r.curves / r.km) * 100 : 0;
  const lengthPenalty = Math.abs(r.km - targetKm) / targetKm;
  const fastShare = r.km ? r.fastKm / r.km : 0;
  return per100 + r.curvyShare * 40 - r.narrowKm * 15 - r.unpavedKm * 25 - fastShare * 60 - lengthPenalty * 30;
}

/** Mehrere Rundtour Varianten parallel holen und nach Bewertung sortieren. */
export async function ghRoundTripCandidates(
  start: LatLon,
  km: number,
  heading: number,
  count = 3,
  baseSeed = Math.floor(Math.random() * 1000),
  signal?: AbortSignal,
): Promise<GhRoute[]> {
  // nacheinander mit Pause, das kostenlose Paket erlaubt nur wenige Anfragen pro Minute
  const ok: GhRoute[] = [];
  let lastError: unknown = null;
  for (let i = 0; i < count; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1200));
    try {
      ok.push(await ghRoundTrip(start, km, heading, baseSeed + i, signal));
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  if (!ok.length) throw lastError ?? new Error('GraphHopper lieferte keine Rundtour.');
  return ok.sort((a, b) => scoreRoute(b, km) - scoreRoute(a, km));
}
