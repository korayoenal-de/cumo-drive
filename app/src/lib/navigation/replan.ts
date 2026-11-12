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

/** So weit vor und hinter der Stelle neben dem Standort gilt die alte Tour als bewusst gemieden */
const AVOID_BACK_KM = 1.5;
const AVOID_AHEAD_KM = 3;

/**
 * Das Stück der Tour, das die Fahrerin gerade umfährt (Tester Gregor 12.11.: Ort umfahren, Neue Route getippt,
 * dreimal zurück durch den Ort geschickt). Die neue Planung fand denselben Weg wieder gut. Diese Punkte werden
 * deshalb deutlich teurer, bleiben aber erlaubt, falls es keinen anderen Weg gibt.
 */
export function avoidedStretch(req: NavRequest, pos: LatLon, stops: LatLon[]): LatLon[] {
  const line = flatten(req.tour).map((x) => x.p);
  if (line.length < 2) return [];
  let here = 0;
  let bd = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = haversine(pos, line[i]);
    if (d < bd) {
      bd = d;
      here = i;
    }
  }
  let a = here;
  for (let km = 0; a > 0 && km < AVOID_BACK_KM; a--) km += haversine(line[a - 1], line[a]) / 1000;
  let b = here;
  for (let km = 0; b < line.length - 1 && km < AVOID_AHEAD_KM; b++) km += haversine(line[b], line[b + 1]) / 1000;
  const out: LatLon[] = [];
  for (let i = a; i <= b; i++) {
    const p = line[i];
    if (out.length && haversine(out[out.length - 1], p) < 250) continue;
    // nicht am Standort selbst und nicht an den Zielen, dort muss die Route hin
    if (haversine(p, pos) < 120 || stops.some((w) => haversine(w, p) < 600)) continue;
    out.push(p);
  }
  return out;
}

export async function replanFromHere(
  req: NavRequest,
  pos: LatLon,
  signal?: AbortSignal,
  heading?: number | null,
): Promise<{ req: NavRequest; route: NavRoute }> {
  const stops = remainingStops(req, pos);
  const hint = { heading, penalize: avoidedStretch(req, pos, stops) };
  const tour = await planChecked(req.tour.name, [pos, ...stops], req.profile, req.avoid, undefined, signal, false, hint);
  const next: NavRequest = { ...req, tour, entry: 'start' };
  const { route } = await fetchNavRouteDetail(next, pos, signal);
  return { req: next, route };
}
