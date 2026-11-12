/**
 * Planen mit Prüfung: Route berechnen, mit dem Etappen Check prüfen und gesperrte
 * Stellen ausschließen, bis die Route sauber ist oder keine Besserung mehr kommt.
 * Das unterscheidet uns von calimoto, das gesperrte Straßen nur anzeigt.
 */
import { avoidedPoints } from './avoid-pass';
import { checkLine } from './check';
import { cumoAvailable, cumoPlan, type PlanHint } from './cumo-routing';
import { tourFun } from './fun-score';
import { closureExclude, closureLabel, closuresNear, closuresOnRoute, prefetchClosures, type ClosureHit } from './road-closures';
import { flatten, haversine, type CheckClass, type LatLon, type Profile, type Tour, type Warning } from './tour';
import { seamsOk, windowFor } from './plan-window';
import { route, VALHALLA_URL, type Avoid } from './valhalla';

/** Schritte beim Planen; traffic: Verkehrsmeldungen, compare: Varianten vergleichen (Rundtour) */
export type PlanStep = 'route' | 'traffic' | 'check' | 'fix' | 'compare';

/** direkt: Etappen, auf denen die kurvige Variante nichts brachte und der direkte Weg gewählt wurde */
export type PlannedTour = Tour & {
  minutes: number;
  fixes: number;
  direkt?: number;
  kurvenKm?: number;
  autobahnKm?: number;
  wohnKm?: number;
  stadtKm?: number;
  bebautKm?: number;
  /** je Etappe (Wegpunkt zu Wegpunkt): Minuten und km vom Router, und ob der direkte Weg gewählt wurde.
   *  Damit lassen sich unveränderte Etappen beim Ändern wiederverwenden (plan-window.ts). */
  legMin?: number[];
  legKm?: number[];
  legDirekt?: boolean[];
};

/** Hinweis für die Route, wenn kurvig nichts Besseres fand (Koray 7.11.: dann ist der direkte Weg okay) */
export function directNote(n: number | undefined, legs: number): string | null {
  if (!n) return null;
  if (n >= legs) return 'Hier gibt es keine kurvigere Strecke. Du fährst den direkten Weg.';
  return n === 1 ? 'Auf einer Etappe gibt es keine kurvigere Strecke, dort fährst du den direkten Weg.' : `Auf ${n} Etappen gibt es keine kurvigere Strecke, dort fährst du den direkten Weg.`;
}

/**
 * Lohnt die kurvige Variante? Sie muss beim Fahrspaß klar vorn liegen, sonst ist sie nur ein Umweg
 * durch Orte (Testfahrt 7.11.: sehr kurvig ab Heppenheim führte im Zickzack durch die Stadt).
 * Seit 10.11. (Stresstest) zählt der Fahrspaß Wert statt der km auf kurvigen Kanten: die sind auch auf
 * guten Strecken nur wenige km, und bei längeren Etappen gewann so fast immer der direkte Weg, etwa
 * Titisee nach Lindau mit 75 km Autobahn und Fahrspaß 3 statt kurvig mit Fahrspaß 40.
 */
function curvyWorthIt(curvy: PlannedTour, direct: PlannedTour): boolean {
  if (curvy.laenge_km <= direct.laenge_km * 1.05) return true;
  // Umweg über das Doppelte ist zu viel, egal wie kurvig
  if (curvy.laenge_km > direct.laenge_km * 2) return false;
  // nicht durch Orte: höchstens 2 km plus 3 % mehr in Wohnstraßen als der direkte Weg
  const townOk = curvy.wohnKm == null || direct.wohnKm == null || curvy.wohnKm <= direct.wohnKm + 2 + 0.03 * curvy.laenge_km;
  if (!townOk) return false;
  // Der direkte Weg führt zu einem guten Teil über die Autobahn: kurvig fährt fast ohne, dann lohnt es sich
  if (direct.autobahnKm != null && curvy.autobahnKm != null && direct.autobahnKm > direct.laenge_km * 0.2 && curvy.autobahnKm < direct.autobahnKm * 0.3 && curvy.laenge_km <= direct.laenge_km * 1.6)
    return true;
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
  hint?: PlanHint,
): Promise<PlannedTour> {
  // Pässe mit Warnung, die du herausgenommen hast (Doch umfahren): Passhöhe gesperrt, außer sie ist selbst ein Punkt
  const skip = avoidedPoints().filter((q) => !points.some((w) => haversine(w, q) < 400));
  const first = await planCore(name, points, profile, avoid, onStep, signal, snapMajor, skip, true, hint);
  onStep?.('traffic');
  // Aktuelle Sperrungen aus Verkehrsmeldungen (Koray 8.11.): umplanen, was nicht geht als Warnung
  const closures = await closuresNear(lineOf(first), signal);
  if (!closures.length) return first;
  let tour = first;
  let hits = closuresOnRoute(lineOf(first), closures);
  const ex = closureExclude(hits, points);
  if (hits.length && ex.length) {
    onStep?.('fix');
    try {
      // Nur die gewählte Variante um die Sperrung herum neu rechnen, ohne nochmal zu vergleichen
      // (10.11.: das Umplanen fragte sonst wieder beide Varianten mit allen Runden ab)
      // Mit Frist: findet sich in FIX_BUDGET_MS kein Weg um die Sperrung, bleibt die erste Route mit Hinweis
      // (12.11.: das Umplanen um eine Wintersperre lief über eine Minute und blieb dann stehen)
      const again = await withBudget(signal, FIX_BUDGET_MS, (s) =>
        planCore(name, points, first.direkt ? 'schnell' : profile, avoid, onStep, s, snapMajor, [...skip, ...ex], false, hint),
      );
      if (first.direkt) again.direkt = first.direkt;
      const h2 = closuresOnRoute(lineOf(again), closures);
      if (h2.length < hits.length) {
        tour = again;
        hits = h2;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return hits.length ? withClosureWarnings(tour, hits) : tour;
}

const lineOf = (t: Tour): LatLon[] => flatten(t).map((x) => x.p);

/** Bis zu dieser Summe der Luftlinien wird Kurvig mit dem direkten Weg verglichen */
const COMPARE_MAX_M = 200000;
/** So lange darf der Vergleich mit dem direkten Weg dauern */
const COMPARE_BUDGET_MS = 8000;

/** So lange darf das Umplanen um eine Sperrung dauern */
const FIX_BUDGET_MS = 12000;

/** Aufgabe mit eigener Frist: bricht nach ms ab (oder wenn der Aufrufer abbricht) und wirft dann */
async function withBudget<T>(signal: AbortSignal | undefined, ms: number, job: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await Promise.race([
      job(ctrl.signal),
      new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new Error('Frist abgelaufen')), { once: true })),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Verbliebene Sperrungen als Warnung "Gesperrt" an der Stelle (Liste und Marker wie beim Etappen Check) */
function withClosureWarnings(tour: PlannedTour, hits: ClosureHit[]): PlannedTour {
  const line = lineOf(tour);
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]) / 1000);
  const extra: Warning[] = hits.map((h) => ({
    klasse: 'raus',
    start_km: +(cum[Math.min(h.firstIndex, cum.length - 1)] ?? 0).toFixed(1),
    laenge_km: +(h.points.length > 1 ? h.points.slice(1).reduce((a, p, i) => a + haversine(h.points[i], p), 0) / 1000 : 0.1).toFixed(1),
    name: closureLabel(h.closure),
    ort: h.closure.from ?? '',
    gruende: ['Gesperrt laut Verkehrsmeldung', ...(h.closure.text ? [h.closure.text] : [])],
    mitte: h.points[Math.floor(h.points.length / 2)],
  }));
  return { ...tour, warnungen: [...tour.warnungen, ...extra].sort((a, b) => a.start_km - b.start_km) };
}

async function planCore(
  name: string,
  points: LatLon[],
  profile: Profile,
  avoid: Avoid,
  onStep: ((s: PlanStep) => void) | undefined,
  signal: AbortSignal | undefined,
  snapMajor: boolean,
  extraExclude: LatLon[],
  /** kurvig gegen den direkten Weg vergleichen (nur beim ersten Planen) */
  compare: boolean,
  hint?: PlanHint,
): Promise<PlannedTour> {
  // Eigener Routing Server (Sportwagen Profil, Prüfung ohne fremde Dienste) hat Vorrang
  if (await cumoAvailable()) {
    onStep?.('route');
    let pts = points;
    // Punkte abseits der Straße (zum Beispiel Passhöhen aus der Liste) findet der Server nicht.
    // Dann den Punkt auf die nächste Straße setzen und nochmal, statt auf den langsamen Weg zu fallen.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        // Lange Routen (Luftlinie über 200 km) nicht gegen den direkten Weg vergleichen: der fährt dort Autobahn,
        // und Kurvig fährt keine Autobahn (Koray 12.11.). Der Vergleich dauerte über 700 km bis über eine Minute
        // und hielt die Planung auf (Heppenheim über Gaviapass, 12.11. abends).
        let air = 0;
        for (let k = 1; k < pts.length; k++) air += haversine(pts[k - 1], pts[k]);
        const curvy = compare && (profile === 'kurvig' || profile === 'paesse') && air <= COMPARE_MAX_M;
        // Der direkte Weg dient erst nur zum Vergleich: eine einzige Abfrage ohne Nachbessern (10.11.: sechs
        // von acht Abfragen einer einfachen Route gingen auf diesen Vergleich). Hat er gesperrte Stücke, läuft
        // die volle Planung gleich hinterher, parallel zur kurvigen Variante, damit sie fertig ist, falls er gewinnt.
        // Der Vergleich hat eine eigene Frist: ist er bis dahin nicht fertig, gilt die kurvige Route
        const directJob = curvy
          ? withBudget(signal, COMPARE_BUDGET_MS, (s) =>
              cumoPlan(name, pts, 'schnell', avoid, s, extraExclude, true, hint)
                // findet die volle Planung keinen Weg, zählt der direkte Weg nicht (wie bisher)
                .then((d) => ((d.km_je_klasse?.raus ?? 0) === 0 ? d : cumoPlan(name, pts, 'schnell', avoid, s, extraExclude, false, hint))),
            ).catch(() => null)
          : Promise.resolve(null);
        const [main, direct] = await Promise.all([cumoPlan(name, pts, profile, avoid, signal, extraExclude, false, hint), directJob]);
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
  let exclude: LatLon[] = [...extraExclude];
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
  let autobahn: number | undefined;
  let wohn: number | undefined;
  let stadt: number | undefined;
  let bebaut: number | undefined;
  const perLeg = parts.every((t) => t.legMin && t.legKm && t.legMin.length === t.wegpunkte.length - 1);
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
    if (t.autobahnKm != null) autobahn = (autobahn ?? 0) + t.autobahnKm;
    if (t.wohnKm != null) wohn = (wohn ?? 0) + t.wohnKm;
    if (t.stadtKm != null) stadt = (stadt ?? 0) + t.stadtKm;
    if (t.bebautKm != null) bebaut = (bebaut ?? 0) + t.bebautKm;
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
    ...(autobahn != null ? { autobahnKm: +autobahn.toFixed(1) } : {}),
    ...(wohn != null ? { wohnKm: +wohn.toFixed(1) } : {}),
    ...(stadt != null ? { stadtKm: +stadt.toFixed(1) } : {}),
    ...(bebaut != null ? { bebautKm: +bebaut.toFixed(1) } : {}),
    ...(perLeg
      ? {
          legMin: parts.flatMap((t) => t.legMin!),
          legKm: parts.flatMap((t) => t.legKm!),
          legDirekt: parts.flatMap((t) => t.legDirekt ?? t.legMin!.map(() => false)),
        }
      : {}),
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
  // Sperrungen schon jetzt holen, parallel zur Route (sonst wartet das Planen danach bis zu 6 s)
  prefetchClosures(points);
  if (points.length < 3 || profiles.every((p) => p === first)) {
    const t = await planChecked(name, points, first, avoid, onStep, signal);
    // in einem Stück geplant: gilt für alle Etappen
    const all = { ...t, legDirekt: points.slice(1).map(() => !!t.direkt) };
    return t.direkt ? { ...all, direkt: points.length - 1 } : all;
  }
  // Etappen mit eigenem Profil gleichzeitig planen statt nacheinander (10.11.); aufeinander folgende
  // Etappen mit demselben Profil bleiben ein Stück, dort gilt weiter kein Wenden am Zwischenziel
  const groups: { from: number; to: number; profile: Profile }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p = profiles[i] ?? first;
    const last = groups[groups.length - 1];
    if (last && last.profile === p) last.to = i + 1;
    else groups.push({ from: i, to: i + 1, profile: p });
  }
  const parts = await Promise.all(
    groups.map(async (g) => {
      const t = await planChecked(name, points.slice(g.from, g.to + 1), g.profile, avoid, onStep, signal);
      const all = { ...t, legDirekt: Array.from({ length: g.to - g.from }, () => !!t.direkt) };
      return t.direkt ? { ...all, direkt: g.to - g.from } : all;
    }),
  );
  return mergeLegs(name, points, parts);
}

/**
 * Wie planLegs, aber nur das geänderte Stück wird neu geplant; die Etappen davor und danach bleiben, wie sie
 * in prev stehen (plan-window.ts). Liefert null, wenn nichts wiederverwendbar ist oder die Nahtstelle nicht
 * passt: dann plant der Aufrufer alles neu.
 */
export async function planChanged(
  prev: PlannedTour,
  prevProfiles: Profile[],
  name: string,
  points: LatLon[],
  profiles: Profile[],
  avoid: Avoid,
  onStep?: (s: PlanStep) => void,
  signal?: AbortSignal,
): Promise<PlannedTour | null> {
  const w = windowFor(prev, prevProfiles, points, profiles);
  if (!w) return null;
  const middle = await planLegs(name, w.points, w.profiles, avoid, onStep, signal);
  const parts = [w.head, middle, w.tail].filter((t): t is PlannedTour => !!t);
  const merged = mergeLegs(name, points, parts);
  return seamsOk(merged, w, middle) ? merged : null;
}
