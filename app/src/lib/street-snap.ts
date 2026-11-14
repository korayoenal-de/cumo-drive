/**
 * Start und Ziel auf eine richtige Straße legen (Koray 14.11.): Ein Treffpunkt an einer Tankstelle rastete auf
 * der Zufahrt ein, die Tour begann mit einer Schleife über das Gelände. GraphHopper kennt keine Sperre für
 * Zufahrten beim Einrasten, darum fragt die App vorher Valhalla (locate) nach der nächsten Straße ab der Klasse
 * Wohnstraße, also ohne Zufahrten, Parkplätze und Feldwege. Nur wenn die nah genug ist (MAX_SHIFT_M), wird der
 * Punkt verschoben; sonst bleibt er, wie er ist. Ohne Netz oder bei Fehlern ändert sich nichts.
 */
import { haversine, type LatLon } from './tour';
import { valhallaFetch } from './valhalla';

const MAX_SHIFT_M = 150;
const cache = new Map<string, LatLon>();
const key = (p: LatLon) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

type Located = { edges?: { correlated_lat: number; correlated_lon: number }[] }[];

export async function snapEndsToStreet(points: LatLon[], signal?: AbortSignal): Promise<LatLon[]> {
  if (points.length < 2) return points;
  const ends = [0, points.length - 1];
  const todo = ends.filter((i) => !cache.has(key(points[i])));
  if (todo.length) {
    try {
      const res = await valhallaFetch('locate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: todo.map((i) => ({ lat: points[i][0], lon: points[i][1], radius: MAX_SHIFT_M, search_filter: { min_road_class: 'residential' } })),
          costing: 'auto',
          verbose: false,
        }),
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as Located;
        todo.forEach((i, j) => {
          const e = data[j]?.edges?.[0];
          const p = points[i];
          const q: LatLon = e ? [e.correlated_lat, e.correlated_lon] : p;
          cache.set(key(p), haversine(p, q) <= MAX_SHIFT_M ? q : p);
        });
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return points.map((p, i) => (ends.includes(i) ? cache.get(key(p)) ?? p : p));
}
