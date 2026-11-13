/**
 * Rundtour: aus Start, Ziellänge und Richtung eine Schleife bauen.
 *
 * Vorgehen: Ein Kreis, dessen Umfang zur Ziellänge passt, wird in die gewünschte Richtung
 * vom Start weg gelegt. Auf dem Kreis liegen drei bis vier Via Punkte, durch die der
 * Routenplaner mit dem gewählten Profil fährt. Straßen sind länger als die Luftlinie,
 * deshalb wird der Kreis kleiner angesetzt und nach dem ersten Versuch einmal nachgeregelt.
 */
import { route, valhallaFetch, type Avoid } from './valhalla';
import type { LatLon, Profile } from './tour';

export type Direction = 'N' | 'NO' | 'O' | 'SO' | 'S' | 'SW' | 'W' | 'NW' | 'zufall';

export const DIRECTIONS: { id: Direction; label: string; bearing: number }[] = [
  { id: 'N', label: 'Norden', bearing: 0 },
  { id: 'NO', label: 'Nordosten', bearing: 45 },
  { id: 'O', label: 'Osten', bearing: 90 },
  { id: 'SO', label: 'Südosten', bearing: 135 },
  { id: 'S', label: 'Süden', bearing: 180 },
  { id: 'SW', label: 'Südwesten', bearing: 225 },
  { id: 'W', label: 'Westen', bearing: 270 },
  { id: 'NW', label: 'Nordwesten', bearing: 315 },
];

export type RoundTripRequest = {
  start: LatLon;
  /** gewünschte Länge in km */
  km: number;
  direction: Direction;
  /** Peilung in Grad, überschreibt direction (zum Beispiel Richtung eines Orts) */
  bearing?: number;
  profile: Profile;
  avoid: Avoid;
  /** Zufallswert für Varianten (Neu würfeln) */
  seed?: number;
};

export type RoundTripResult = { shape: LatLon[]; km: number; minutes: number; via: LatLon[]; bearing: number };

/** Punkt in Entfernung (km) und Peilung (Grad) von p. */
export function destination(p: LatLon, km: number, bearing: number): LatLon {
  const R = 6371;
  const d = km / R;
  const b = (bearing * Math.PI) / 180;
  const la1 = (p[0] * Math.PI) / 180;
  const lo1 = (p[1] * Math.PI) / 180;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI];
}

/** Peilung von a nach b in Grad. */
export function bearingTo(a: LatLon, b: LatLon): number {
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const dlo = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(dlo) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Via Punkte auf einem Kreis, der in Richtung bearing vom Start weg liegt. */
export function loopPoints(start: LatLon, circumferenceKm: number, bearing: number, seed = 1): LatLon[] {
  const rand = rng(seed);
  const r = circumferenceKm / (2 * Math.PI);
  const center = destination(start, r, bearing);
  const back = (bearing + 180) % 360;
  const n = circumferenceKm > 120 ? 4 : 3;
  const dir = rand() < 0.5 ? 1 : -1;
  const pts: LatLon[] = [];
  for (let i = 1; i <= n; i++) {
    const angle = back + dir * (360 / (n + 1)) * i + (rand() - 0.5) * 30;
    const radius = r * (0.85 + rand() * 0.3);
    pts.push(destination(center, radius, angle));
  }
  return pts;
}

/**
 * Schiebt Via Punkte ins Hügelland: Für jeden Punkt werden Kandidaten im Umkreis geprüft und
 * der mit dem stärksten Relief gewählt (Höhenunterschied im Umkreis von 1 km). Hügel heißen
 * Kurven, solange der Routenplaner Kurven nicht selbst bevorzugen kann. Bei "Pässe" zählt
 * zusätzlich die absolute Höhe.
 */
export async function hillyVia(via: LatLon[], spreadKm: number, profile: Profile, signal?: AbortSignal): Promise<LatLon[]> {
  if (profile !== 'kurvig' && profile !== 'paesse') return via;
  const slots = via.map((p) => [p, ...[0, 60, 120, 180, 240, 300].map((b) => destination(p, spreadKm, b))]);
  const probe = (c: LatLon) => [c, ...[0, 90, 180, 270].map((b) => destination(c, 1, b))];
  const shape = slots.flat().flatMap(probe);
  try {
    const res = await valhallaFetch('height', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: shape.map(([lat, lon]) => ({ lat, lon })) }),
      signal,
    });
    const data = (await res.json()) as { height?: (number | null)[] };
    const h = data.height ?? [];
    let k = 0;
    return slots.map((cands) => {
      let best = cands[0];
      let bestScore = -Infinity;
      for (const c of cands) {
        const hs = h.slice(k, k + 5).filter((x): x is number => typeof x === 'number');
        k += 5;
        if (hs.length < 3) continue;
        const relief = Math.max(...hs) - Math.min(...hs);
        const score = profile === 'paesse' ? relief + hs[0] * 0.3 : relief;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      return best;
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    return via; // Höhendaten nicht erreichbar: ohne Verschiebung weiter
  }
}

export async function roundTrip(req: RoundTripRequest, signal?: AbortSignal): Promise<RoundTripResult> {
  const seed = req.seed ?? Math.floor(Math.random() * 1e9);
  const bearing =
    req.bearing ?? (req.direction === 'zufall' ? rng(seed)() * 360 : DIRECTIONS.find((d) => d.id === req.direction)!.bearing);
  // Straßen sind im Mittel etwa 1,35 mal so lang wie die Luftlinie
  let circ = req.km / 1.35;
  let best: RoundTripResult | null = null;
  let lastError: unknown = null;
  let variant = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const base = loopPoints(req.start, circ, bearing, seed + variant);
    const via = await hillyVia(base, Math.max(2, circ / (2 * Math.PI) * 0.35), req.profile, signal);
    let r;
    try {
      r = await route([req.start, ...via, req.start], req.profile, req.avoid, signal, [], true);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
      variant++; // andere Via Punkte probieren
      continue;
    }
    const result = { ...r, via, bearing };
    if (!best || Math.abs(r.km - req.km) < Math.abs(best.km - req.km)) best = result;
    const ratio = r.km / req.km;
    if (ratio > 0.85 && ratio < 1.15) break;
    circ = circ / ratio;
  }
  if (!best) throw lastError ?? new Error('Keine Rundtour gefunden.');
  return best;
}
