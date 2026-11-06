/**
 * Stopp in eine fertige Tour einbauen, ohne den Rest der Strecke anzufassen (6.11.).
 * Liegt der Stopp höchstens STOP_SNAP_M neben der Linie, bleibt die Strecke wie sie ist: man hält am Rand.
 * Sonst wird nur ein kurzes Stück um den Stopp neu geplant (etwa 1,5 km davor bis 1,5 km danach),
 * hin zum Stopp und auf demselben Weg zurück, und in die Linie eingesetzt.
 * Früher wurde die ganze Runde durch Start, Stopp und Ziel neu geplant und sah danach anders aus.
 */
import { allowTurnAt } from './cumo-routing';
import { planChecked, type PlannedTour } from './plan';
import { haversine, type CheckClass, type LatLon, type Profile } from './tour';
import type { Avoid } from './valhalla';

export const STOP_SNAP_M = 300;
const SPAN_KM = 1.5;

type Pt = { p: LatLon; c: CheckClass; km: number };

function points(t: PlannedTour): Pt[] {
  const out: Pt[] = [];
  let km = 0;
  for (const run of t.linie) {
    for (const p of run.p) {
      const last = out[out.length - 1];
      if (last) {
        if (last.p[0] === p[0] && last.p[1] === p[1]) continue;
        km += haversine(last.p, p) / 1000;
      }
      out.push({ p, c: run.c, km });
    }
  }
  return out;
}

function runs(list: { p: LatLon; c: CheckClass }[]): PlannedTour['linie'] {
  const out: PlannedTour['linie'] = [];
  for (const x of list) {
    const last = out[out.length - 1];
    if (last && last.c === x.c) last.p.push(x.p);
    else out.push({ c: x.c, p: last ? [last.p[last.p.length - 1], x.p] : [x.p] });
  }
  return out;
}

/** Nächster Punkt der Linie zum Stopp: Index, Abstand in m, km */
export function nearestOnLine(line: LatLon[], p: LatLon): { i: number; d: number } {
  let i = 0;
  let d = Infinity;
  line.forEach((q, k) => {
    const x = haversine(q, p);
    if (x < d) {
      d = x;
      i = k;
    }
  });
  return { i, d };
}

/** Wegpunkt nach seinem km entlang der Linie einsortieren (nie vor den Start, nie hinter das Ziel) */
function insertByKm(wp: LatLon[], pts: Pt[], p: LatLon, km: number): LatLon[] {
  if (wp.length < 2) return [...wp, p];
  const kmOf = (q: LatLon) => pts[nearestOnLine(pts.map((x) => x.p), q).i]?.km ?? 0;
  let at = 1;
  for (let i = 1; i < wp.length - 1; i++) if (kmOf(wp[i]) < km) at = i + 1;
  return [...wp.slice(0, at), p, ...wp.slice(at)];
}

export async function spliceStop(tour: PlannedTour, p: LatLon, profile: Profile, avoid: Avoid): Promise<PlannedTour> {
  const pts = points(tour);
  if (pts.length < 2) return tour;
  const { i, d } = nearestOnLine(pts.map((x) => x.p), p);
  const km = pts[i].km;
  if (d <= STOP_SNAP_M) {
    // Am Rand halten: Strecke bleibt, der Stopp wird als Wegpunkt auf der Linie gemerkt
    return { ...tour, wegpunkte: insertByKm(tour.wegpunkte, pts, pts[i].p, km) };
  }
  let a = i;
  while (a > 0 && pts[i].km - pts[a].km < SPAN_KM) a--;
  let b = i;
  while (b < pts.length - 1 && pts[b].km - pts[i].km < SPAN_KM) b++;
  allowTurnAt(p);
  const seg = await planChecked(tour.name, [pts[a].p, p, pts[b].p], profile, avoid, () => undefined);
  const segPts = points(seg);
  const merged = [...pts.slice(0, a + 1), ...segPts.slice(1, -1), ...pts.slice(b)];
  const linie = runs(merged);
  let len = 0;
  for (let k = 1; k < merged.length; k++) len += haversine(merged[k - 1].p, merged[k].p) / 1000;
  const oldPart = pts[b].km - pts[a].km;
  const minutes = Math.round(tour.minutes - (oldPart / Math.max(1, tour.laenge_km)) * tour.minutes + seg.minutes);
  // Warnungen hinter dem Stück verschieben sich um den Umweg
  const shift = seg.laenge_km - oldPart;
  const warnungen = [
    ...tour.warnungen.filter((w) => w.start_km < pts[a].km),
    ...seg.warnungen.map((w) => ({ ...w, start_km: w.start_km + pts[a].km })),
    ...tour.warnungen.filter((w) => w.start_km > pts[b].km).map((w) => ({ ...w, start_km: w.start_km + shift })),
  ];
  return { ...tour, linie, laenge_km: Math.round(len * 10) / 10, minutes, warnungen, wegpunkte: insertByKm(tour.wegpunkte, pts, p, km) };
}
