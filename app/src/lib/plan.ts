/**
 * Planen mit Prüfung: Route berechnen, mit dem Etappen Check prüfen und gesperrte
 * Stellen ausschließen, bis die Route sauber ist oder keine Besserung mehr kommt.
 * Das unterscheidet uns von calimoto, das gesperrte Straßen nur anzeigt.
 */
import { checkLine } from './check';
import { cumoAvailable, cumoPlan } from './cumo-routing';
import { route, type Avoid } from './valhalla';
import { haversine, type LatLon, type Profile, type Tour } from './tour';

export type PlanStep = 'route' | 'check' | 'fix';

export type PlannedTour = Tour & { minutes: number; fixes: number };

/** Punkte entlang gesperrter Abschnitte, mit Abstand zu den Wegpunkten. */
function excludePoints(tour: Pick<Tour, 'linie'>, keepAway: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  for (const run of tour.linie) {
    if (run.c !== 'raus') continue;
    let last: LatLon | null = null;
    for (const p of run.p) {
      if (last && haversine(last, p) < 250) continue;
      if (keepAway.some((w) => haversine(w, p) < 400)) continue;
      out.push(p);
      last = p;
    }
  }
  return out.slice(0, 40);
}

/** Punkt in Abstand d (Meter) entlang der Linie. */
function pointAt(shape: LatLon[], cum: number[], d: number): LatLon {
  if (d <= 0) return shape[0];
  if (d >= cum[cum.length - 1]) return shape[shape.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid;
    else hi = mid;
  }
  const t = (d - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
  return [shape[lo][0] + (shape[hi][0] - shape[lo][0]) * t, shape[lo][1] + (shape[hi][1] - shape[lo][1]) * t];
}

/**
 * Sackgassen an automatisch gesetzten Zwischenpunkten: Fährt die Route zum Punkt hinein und auf
 * demselben Weg zurück (Hin und Rückweg liegen dicht beieinander), wird der Punkt an die Abzweigung
 * verschoben. Liefert die neuen Punkte oder null, wenn keine Sackgasse da ist.
 */
export function fixSpurs(points: LatLon[], shape: LatLon[], minSpurM = 150): LatLon[] | null {
  if (points.length < 3 || shape.length < 3) return null;
  const cum = [0];
  for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + haversine(shape[i - 1], shape[i]));
  let changed = false;
  let from = 0;
  const out = points.map((p, j) => {
    if (j === 0 || j === points.length - 1) return p;
    // nächster Punkt der Linie zum Zwischenpunkt, ab dem letzten Treffer weiter
    let bi = from;
    let bd = Infinity;
    for (let i = from; i < shape.length; i++) {
      const d = haversine(p, shape[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    from = bi;
    let spur = 0;
    for (let d = 25; d <= 6000; d += 25) {
      if (cum[bi] - d < 0 || cum[bi] + d > cum[cum.length - 1]) break;
      if (haversine(pointAt(shape, cum, cum[bi] - d), pointAt(shape, cum, cum[bi] + d)) > 40) break;
      spur = d;
    }
    if (spur < minSpurM) return p;
    changed = true;
    return pointAt(shape, cum, cum[bi] - spur - 30);
  });
  return changed ? out : null;
}

export async function planChecked(
  name: string,
  points: LatLon[],
  profile: Profile,
  avoid: Avoid,
  onStep?: (s: PlanStep) => void,
  signal?: AbortSignal,
  snapMajor = false,
): Promise<PlannedTour> {
  // Eigener Routing Server (Sportwagen Profil, Prüfung ohne fremde Dienste) hat Vorrang
  if (await cumoAvailable()) {
    try {
      onStep?.('route');
      return await cumoPlan(name, points, profile, avoid, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  let exclude: LatLon[] = [];
  let best: PlannedTour | null = null;
  for (let round = 0; round < 3; round++) {
    onStep?.(round === 0 ? 'route' : 'fix');
    let r;
    try {
      r = await route(points, profile, avoid, signal, exclude, snapMajor);
    } catch (e) {
      if (best) break; // mit den Ausschlüssen gibt es keinen Weg mehr: beste Variante behalten
      throw e;
    }
    // Automatische Zwischenpunkte (Rundtour) nicht in Sackgassen: an die Abzweigung schieben und neu rechnen
    if (snapMajor && round === 0) {
      const moved = fixSpurs(points, r.shape);
      if (moved) {
        try {
          r = await route(moved, profile, avoid, signal, exclude, snapMajor);
          points = moved;
        } catch (e) {
          if (signal?.aborted) throw e;
        }
      }
    }
    onStep?.('check');
    const c = await checkLine(r.shape, undefined, signal);
    const tour: PlannedTour = {
      name, wegpunkte: points, ...c, laenge_km: +r.km.toFixed(1), minutes: r.minutes, geprueft: true, fixes: round,
    };
    const rausKm = c.km_je_klasse?.raus ?? 0;
    if (!best || rausKm < (best.km_je_klasse?.raus ?? Infinity)) best = tour;
    if (rausKm === 0) break;
    const more = excludePoints(c, points);
    if (!more.length) break;
    exclude = [...exclude, ...more];
  }
  return best!;
}
