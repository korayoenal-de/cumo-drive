/**
 * Planen mit Prüfung: Route berechnen, mit dem Etappen Check prüfen und gesperrte
 * Stellen ausschließen, bis die Route sauber ist oder keine Besserung mehr kommt.
 * Das unterscheidet uns von calimoto, das gesperrte Straßen nur anzeigt.
 */
import { checkLine } from './check';
import { cumoAvailable, cumoPlan } from './cumo-routing';
import { tourFun } from './fun-score';
import { route, VALHALLA_URL, type Avoid } from './valhalla';
import { flatten, haversine, type CheckClass, type LatLon, type Profile, type Tour } from './tour';

export type PlanStep = 'route' | 'check' | 'fix';

/** direkt: Etappen, auf denen die kurvige Variante nichts brachte und der direkte Weg gewählt wurde */
export type PlannedTour = Tour & { minutes: number; fixes: number; direkt?: number };

/** Hinweis für die Route, wenn kurvig nichts Besseres fand (Koray 7.11.: dann ist der direkte Weg okay) */
export function directNote(n: number | undefined, legs: number): string | null {
  if (!n) return null;
  if (n >= legs) return 'Hier gibt es keine kurvigere Strecke. Du fährst den direkten Weg.';
  return n === 1 ? 'Auf einer Etappe gibt es keine kurvigere Strecke, dort fährst du den direkten Weg.' : `Auf ${n} Etappen gibt es keine kurvigere Strecke, dort fährst du den direkten Weg.`;
}

/**
 * Lohnt die kurvige Variante? Sie muss beim Fahrspaß klar vorn liegen, sonst ist sie nur ein Umweg
 * durch Orte (Testfahrt 7.11.: sehr kurvig ab Heppenheim führte im Zickzack durch die Stadt).
 */
function curvyWorthIt(curvy: PlannedTour, direct: PlannedTour): boolean {
  if (curvy.laenge_km <= direct.laenge_km * 1.05) return true;
  const a = tourFun(flatten(curvy).map((x) => x.p))?.score ?? 0;
  const b = tourFun(flatten(direct).map((x) => x.p))?.score ?? 0;
  return a >= b + 6;
}

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

/** Nächster Punkt auf einer Straße (Valhalla locate), null wenn keine gefunden. */
async function snapToRoad(p: LatLon, signal?: AbortSignal): Promise<LatLon | null> {
  try {
    const res = await fetch(`${VALHALLA_URL}/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [{ lat: p[0], lon: p[1] }], costing: 'auto', verbose: false }),
      signal,
    });
    const data = (await res.json()) as { edges?: { correlated_lat: number; correlated_lon: number }[] | null }[];
    const e = data[0]?.edges?.[0];
    return e ? [e.correlated_lat, e.correlated_lon] : null;
  } catch {
    return null;
  }
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
    onStep?.('route');
    let pts = points;
    // Punkte abseits der Straße (zum Beispiel Passhöhen aus der Liste) findet der Server nicht.
    // Dann den Punkt auf die nächste Straße setzen und nochmal, statt auf den langsamen Weg zu fallen.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const curvy = profile === 'kurvig' || profile === 'paesse';
        const [main, direct] = await Promise.all([
          cumoPlan(name, pts, profile, avoid, signal),
          curvy ? cumoPlan(name, pts, 'schnell', avoid, signal).catch(() => null) : Promise.resolve(null),
        ]);
        if (direct && !curvyWorthIt(main, direct)) return { ...direct, direkt: 1 };
        return main;
      } catch (e) {
        if (signal?.aborted) throw e;
        const m = /Cannot find point (\d+)/.exec((e as Error).message);
        if (!m) break;
        const i = Number(m[1]);
        const snapped = await snapToRoad(pts[i], signal);
        if (!snapped) break;
        pts = pts.map((p, k) => (k === i ? snapped : p));
      }
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

/**
 * Einzeln geplante Etappen zu einer Tour zusammenfügen: Linien aneinander (der doppelte erste Punkt
 * späterer Etappen fällt weg), Kilometer, Minuten, Umplanungen und km je Klasse summiert,
 * Warnungen um die bis dahin gefahrenen Kilometer verschoben.
 */
export function mergeLegs(name: string, points: LatLon[], parts: PlannedTour[]): PlannedTour {
  const linie: Tour['linie'] = [];
  const warnungen: Tour['warnungen'] = [];
  const klassen: Record<CheckClass, number> = { ok: 0, pruefen: 0, raus: 0 };
  let hasKlassen = false;
  let km = 0;
  let minutes = 0;
  let fixes = 0;
  let direkt = 0;
  let geprueft = true;
  parts.forEach((t, i) => {
    t.linie.forEach((run, j) => {
      const p = i > 0 && j === 0 ? run.p.slice(1) : run.p;
      if (p.length) linie.push({ c: run.c, p });
    });
    for (const w of t.warnungen) warnungen.push({ ...w, start_km: +(w.start_km + km).toFixed(2) });
    if (t.km_je_klasse) {
      hasKlassen = true;
      for (const c of ['ok', 'pruefen', 'raus'] as CheckClass[]) klassen[c] += t.km_je_klasse[c] ?? 0;
    }
    km += t.laenge_km;
    minutes += t.minutes;
    fixes += t.fixes;
    direkt += t.direkt ?? 0;
    geprueft = geprueft && !!t.geprueft;
  });
  return {
    name,
    wegpunkte: points,
    linie,
    warnungen,
    ...(hasKlassen ? { km_je_klasse: klassen } : {}),
    laenge_km: +km.toFixed(1),
    minutes,
    fixes,
    geprueft,
    ...(direkt ? { direkt } : {}),
  };
}

/**
 * Planen mit eigenem Profil je Etappe (profiles[i] gilt von points[i] bis points[i+1]).
 * Haben alle Etappen dasselbe Profil, bleibt es bei einem einzigen Aufruf wie bisher.
 * Sonst wird jede Etappe nacheinander geplant und danach zusammengefügt.
 */
export async function planLegs(
  name: string,
  points: LatLon[],
  profiles: Profile[],
  avoid: Avoid,
  onStep?: (s: PlanStep) => void,
  signal?: AbortSignal,
): Promise<PlannedTour> {
  const first = profiles[0] ?? 'kurvig';
  if (points.length < 3 || profiles.every((p) => p === first)) {
    const t = await planChecked(name, points, first, avoid, onStep, signal);
    // in einem Stück geplant: gilt für alle Etappen
    return t.direkt ? { ...t, direkt: points.length - 1 } : t;
  }
  const parts: PlannedTour[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (signal?.aborted) throw new Error('Abgebrochen');
    parts.push(await planChecked(name, [points[i], points[i + 1]], profiles[i] ?? first, avoid, onStep, signal));
  }
  return mergeLegs(name, points, parts);
}
