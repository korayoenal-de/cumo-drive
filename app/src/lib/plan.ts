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
