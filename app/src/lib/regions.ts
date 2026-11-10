/**
 * Fahrregionen (Koray 10.11.): Gegenden, die als Ganzes zum Fahren gemacht sind, etwa Schwarzwald, Pfälzerwald,
 * Odenwald, Vogesen oder Dolomiten. Zwei Arten: sport (anspruchsvoll, viele Kurven) und panorama (flüssig, Aussicht).
 * Flächen aus OpenStreetMap (Naturparks, Kreise und Bezirke, © OpenStreetMap Mitwirkende, ODbL), vereinfacht auf etwa 1 km.
 * Quelle der Liste und Abfragen: routing/data/regions.
 *
 * Wirkung: ein sanfter Zug, nie stärker als die Bewertung der einzelnen Straße. Auf dem Server kosten Straßen
 * außerhalb aller Regionen etwas mehr, in der Bewertung der Rundtour zählt jeder km in einer Region ein wenig.
 */
import UNION_RAW from '@/data/regions-union.json';
import REGIONS_RAW from '@/data/regions.json';

import { haversine, type LatLon } from './tour';

export type RegionArt = 'sport' | 'panorama';
export type Region = { id: string; name: string; land: string; art: RegionArt; bbox: [number, number, number, number]; rings: LatLon[][] };

export const REGIONS = REGIONS_RAW as unknown as Region[];
/** Alle Regionen vereinigt (überlappende Flächen sind für den Server ungültig), Ring als lon, lat */
const UNION = UNION_RAW as unknown as { bbox: [number, number, number, number]; ring: number[][] }[];

function inRing(p: LatLon, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Raster 0,1 Grad: welche Regionen die Zelle berühren (über die bbox), einmal aufgebaut */
const CELL = 0.1;
let grid: Map<string, Region[]> | null = null;
function candidates(p: LatLon): Region[] {
  if (!grid) {
    grid = new Map();
    for (const r of REGIONS) {
      const [s, w, n, e] = r.bbox;
      for (let y = Math.floor(s / CELL); y <= Math.floor(n / CELL); y++)
        for (let x = Math.floor(w / CELL); x <= Math.floor(e / CELL); x++) {
          const k = `${y},${x}`;
          const l = grid.get(k);
          if (l) l.push(r);
          else grid.set(k, [r]);
        }
    }
  }
  return grid.get(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`) ?? [];
}

/** Region, in der ein Punkt liegt (sport vor panorama), oder null */
export function regionAt(p: LatLon): Region | null {
  let pano: Region | null = null;
  for (const r of candidates(p)) {
    if (!r.rings.some((ring) => inRing(p, ring))) continue;
    if (r.art === 'sport') return r;
    pano = pano ?? r;
  }
  return pano;
}

/** km einer Linie in Regionen, getrennt nach Art (Stichprobe etwa alle 500 m). Je Linie gemerkt. */
const kmMemo = new WeakMap<object, { sport: number; panorama: number }>();
export function regionKm(line: LatLon[]): { sport: number; panorama: number } {
  const known = kmMemo.get(line);
  if (known) return known;
  const out = { sport: 0, panorama: 0 };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += haversine(line[i - 1], line[i]);
    if (acc < 500 && i < line.length - 1) continue;
    const r = regionAt(line[i]);
    if (r) out[r.art] += acc / 1000;
    acc = 0;
  }
  out.sport = +out.sport.toFixed(1);
  out.panorama = +out.panorama.toFixed(1);
  kmMemo.set(line, out);
  return out;
}

/** Punkte für die Bewertung: je km in einer sportlichen Region 1,5, in einer Panorama Region 0,75 */
export function regionScore(line: LatLon[], relaxed = false): number {
  if ((globalThis as any).__NOREG) return 0;
  const k = regionKm(line);
  return relaxed ? k.sport * 0.75 + k.panorama * 1.5 : k.sport * 1.5 + k.panorama * 0.75;
}

/** Regionen in Reichweite der Punkte als GeoJSON Fläche für den Server (Koordinaten lon, lat) */
const areaMemo = new Map<string, unknown>();
export function regionArea(near: LatLon[], radiusKm: number) {
  if ((globalThis as any).__NOREG) return null;
  if (!near.length) return null;
  const key = `${radiusKm.toFixed(0)}|${near.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(';')}`;
  if (areaMemo.has(key)) return areaMemo.get(key) as { type: 'Feature'; id: 'region'; properties: Record<string, never>; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } } | null;
  const dLat = radiusKm / 111 + 0.1;
  const hit = UNION.filter((r) =>
    near.some((p) => {
      const dLon = dLat / Math.max(0.2, Math.cos((p[0] * Math.PI) / 180));
      return p[0] > r.bbox[0] - dLat && p[0] < r.bbox[2] + dLat && p[1] > r.bbox[1] - dLon && p[1] < r.bbox[3] + dLon;
    }),
  );
  const coords = hit.map((r) => [r.ring]);
  const area = coords.length ? { type: 'Feature' as const, id: 'region' as const, properties: {}, geometry: { type: 'MultiPolygon' as const, coordinates: coords } } : null;
  if (areaMemo.size > 40) areaMemo.clear();
  areaMemo.set(key, area);
  return area;
}
