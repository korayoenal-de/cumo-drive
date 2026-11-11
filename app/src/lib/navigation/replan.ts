/**
 * Neue Route ab hier (Koray 11.11., Tester Gregor): Wer die Rückführung auf die Tour zweimal ignoriert,
 * fährt bewusst anders. Dann plant die App ab dem Standort neu, über die noch offenen Zwischenziele zum
 * Ziel, mit demselben Profil (Kurvig samt Traumstrecken), damit der Fahrspaß erhalten bleibt.
 */
import { planChecked } from '../plan';
import { flatten, haversine, type LatLon } from '../tour';
import { fetchNavRouteDetail } from './route';
import type { NavRequest, NavRoute } from './types';

/** Zwischenziele, die auf der Tour noch vor einem liegen (nach der Stelle, die dem Standort am nächsten ist) */
export function remainingStops(req: NavRequest, pos: LatLon): LatLon[] {
  const w = req.tour.wegpunkte;
  if (w.length < 2) return w.slice(-1);
  const line = flatten(req.tour).map((x) => x.p);
  const near = (p: LatLon, from = 0) => {
    let best = from;
    let bd = Infinity;
    for (let i = from; i < line.length; i++) {
      const d = haversine(p, line[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  // Lage der Zwischenziele auf der Linie in Fahrtrichtung, so stimmt es auch bei Runden (Start gleich Ziel)
  const idx: number[] = [];
  let from = 0;
  for (const p of w.slice(1, -1)) {
    const i = near(p, from);
    idx.push(i);
    from = i;
  }
  const here = near(pos);
  const vias = w.slice(1, -1).filter((_, k) => idx[k] > here);
  return [...vias, w[w.length - 1]];
}

export async function replanFromHere(req: NavRequest, pos: LatLon, signal?: AbortSignal): Promise<{ req: NavRequest; route: NavRoute }> {
  const stops = remainingStops(req, pos);
  const tour = await planChecked(req.tour.name, [pos, ...stops], req.profile, req.avoid, undefined, signal);
  const next: NavRequest = { ...req, tour, entry: 'start' };
  const { route } = await fetchNavRouteDetail(next, pos, signal);
  return { req: next, route };
}
