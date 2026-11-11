/**
 * Nur neu planen, was sich geändert hat (Prüfung 11.11.): Wird ein Punkt verschoben, eingefügt oder entfernt,
 * bleiben die Etappen davor und danach genau so stehen, wie sie waren. Neu gerechnet wird nur das Stück
 * zwischen dem letzten unveränderten Punkt davor und dem ersten danach. Bei 650 km mit acht Punkten sind das
 * zwei Etappen statt der ganzen Tour.
 *
 * Reine Funktionen ohne Netz; geplant wird über die übergebene Funktion.
 */
import type { PlannedTour } from './plan';
import { haversine, type CheckClass, type LatLon, type Profile, type Tour, type Warning } from './tour';

type Flat = { p: LatLon; km: number; c: CheckClass };

/** Alle Punkte der Linie mit km ab Start; c ist die Klasse des Stücks, das an diesem Punkt endet */
function flat(tour: Pick<Tour, 'linie'>): Flat[] {
  const out: Flat[] = [];
  let km = 0;
  for (const run of tour.linie) {
    for (const p of run.p) {
      const last = out[out.length - 1];
      if (last) {
        if (last.p[0] === p[0] && last.p[1] === p[1]) continue;
        km += haversine(last.p, p) / 1000;
      }
      out.push({ p, km, c: run.c });
    }
  }
  return out;
}

/** Stelle jedes Wegpunkts auf der Linie (Index), der Reihe nach; null, wenn ein Punkt nicht auf der Linie liegt */
function waypointIndex(pts: Flat[], tour: PlannedTour): number[] | null {
  const n = tour.wegpunkte.length;
  if (pts.length < 2 || n < 2) return null;
  const total = pts[pts.length - 1].km;
  // Etappenlängen des Routers als Anhalt, damit Schleifen und doppelt gefahrene Stücke nicht verrutschen
  const hint = tour.legKm && tour.legKm.length === n - 1 ? tour.legKm : null;
  const hintSum = hint ? hint.reduce((a, b) => a + b, 0) : 0;
  const idx: number[] = [0];
  let cursor = 0;
  let acc = 0;
  for (let i = 1; i < n - 1; i++) {
    const w = tour.wegpunkte[i];
    let best = -1;
    let bd = Infinity;
    if (hint && hintSum > 0) {
      acc += hint[i - 1];
      const target = (acc / hintSum) * total;
      const tol = Math.max(0.6, target * 0.03);
      for (let j = cursor; j < pts.length; j++) {
        if (pts[j].km < target - tol) continue;
        if (pts[j].km > target + tol) break;
        const d = haversine(w, pts[j].p);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
    }
    if (best < 0) {
      bd = Infinity;
      for (let j = cursor; j < pts.length; j++) {
        const d = haversine(w, pts[j].p);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
    }
    // Punkt abseits der Linie (importierte Tour mit freien Wegpunkten): hier lässt sich nichts sauber teilen
    if (best < 0 || bd > 400) return null;
    idx.push(best);
    cursor = best;
  }
  idx.push(pts.length - 1);
  return idx;
}

/** Minuten je Etappe: vom Router, sonst nach Länge verteilt */
function legMinutes(tour: PlannedTour, pts: Flat[], idx: number[]): number[] {
  const legs = idx.length - 1;
  if (tour.legMin && tour.legMin.length === legs) return tour.legMin;
  const total = pts[pts.length - 1].km || 1;
  return Array.from({ length: legs }, (_, i) => (tour.minutes * (pts[idx[i + 1]].km - pts[idx[i]].km)) / total);
}

/** Etappen a bis b (Wegpunkt a bis Wegpunkt b) als eigene Tour herausschneiden */
function slice(tour: PlannedTour, pts: Flat[], idx: number[], mins: number[], a: number, b: number): PlannedTour {
  const i0 = idx[a];
  const i1 = idx[b];
  const km0 = pts[i0].km;
  const km1 = pts[i1].km;
  const linie: Tour['linie'] = [];
  const klassen: Record<CheckClass, number> = { ok: 0, pruefen: 0, raus: 0 };
  for (let k = i0 + 1; k <= i1; k++) {
    const c = pts[k].c;
    klassen[c] += pts[k].km - pts[k - 1].km;
    const last = linie[linie.length - 1];
    if (last && last.c === c) last.p.push(pts[k].p);
    else linie.push({ c, p: [pts[k - 1].p, pts[k].p] });
  }
  if (!linie.length) linie.push({ c: 'ok', p: [pts[i0].p] });
  const warnungen: Warning[] = tour.warnungen
    .filter((w) => w.start_km >= km0 - 0.05 && w.start_km < km1 - 0.05)
    .map((w) => ({ ...w, start_km: +Math.max(0, w.start_km - km0).toFixed(2) }));
  const legKm = Array.from({ length: b - a }, (_, i) => +(pts[idx[a + i + 1]].km - pts[idx[a + i]].km).toFixed(3));
  return {
    name: tour.name,
    wegpunkte: tour.wegpunkte.slice(a, b + 1),
    linie,
    warnungen,
    ...(tour.km_je_klasse ? { km_je_klasse: { ok: +klassen.ok.toFixed(1), pruefen: +klassen.pruefen.toFixed(1), raus: +klassen.raus.toFixed(1) } } : {}),
    laenge_km: +(km1 - km0).toFixed(1),
    minutes: mins.slice(a, b).reduce((x, y) => x + y, 0),
    fixes: 0,
    geprueft: tour.geprueft,
    legMin: mins.slice(a, b),
    legKm,
    legDirekt: tour.legDirekt && tour.legDirekt.length === idx.length - 1 ? tour.legDirekt.slice(a, b) : Array.from({ length: b - a }, () => false),
    ...(tour.legDirekt && tour.legDirekt.length === idx.length - 1 ? { direkt: tour.legDirekt.slice(a, b).filter(Boolean).length || undefined } : {}),
  };
}

const same = (a: LatLon, b: LatLon) => a[0] === b[0] && a[1] === b[1];

/** Wie viele Etappen vorn und hinten unverändert sind */
export function unchangedLegs(oldPts: LatLon[], oldProf: Profile[], pts: LatLon[], prof: Profile[]): { head: number; tail: number } {
  const oldLegs = oldPts.length - 1;
  const legs = pts.length - 1;
  let head = 0;
  while (head < Math.min(oldLegs, legs) && same(oldPts[head], pts[head]) && same(oldPts[head + 1], pts[head + 1]) && oldProf[head] === prof[head]) head++;
  let tail = 0;
  while (
    tail < Math.min(oldLegs, legs) - head &&
    same(oldPts[oldLegs - tail], pts[legs - tail]) &&
    same(oldPts[oldLegs - tail - 1], pts[legs - tail - 1]) &&
    oldProf[oldLegs - tail - 1] === prof[legs - tail - 1]
  )
    tail++;
  return { head, tail };
}

/** Länge des Stücks, das an der Stelle km hin und auf demselben Weg zurück gefahren wird (Meter) */
function spurAt(pts: Flat[], km: number): number {
  const total = pts[pts.length - 1].km;
  const at = (d: number): LatLon => {
    if (d <= 0) return pts[0].p;
    if (d >= total) return pts[pts.length - 1].p;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].km < d) lo = mid;
      else hi = mid;
    }
    const t = (d - pts[lo].km) / Math.max(1e-9, pts[hi].km - pts[lo].km);
    return [pts[lo].p[0] + (pts[hi].p[0] - pts[lo].p[0]) * t, pts[lo].p[1] + (pts[hi].p[1] - pts[lo].p[1]) * t];
  };
  let spur = 0;
  for (let d = 25; d <= 4000; d += 25) {
    if (km - d / 1000 < 0 || km + d / 1000 > total) break;
    if (haversine(at(km - d / 1000), at(km + d / 1000)) > 40) break;
    spur = d;
  }
  return spur;
}

export type WindowPlan = {
  /** unveränderte Stücke davor und danach, null wenn es keines gibt */
  head: PlannedTour | null;
  tail: PlannedTour | null;
  /** Punkte und Profile des Stücks, das neu geplant wird */
  points: LatLon[];
  profiles: Profile[];
  /** Wenden an den Nahtstellen in der alten Tour (Meter), zum Vergleich nach dem Zusammenfügen */
  spurBefore: [number, number];
};

/**
 * Zerlegt die bisherige Tour für die neuen Punkte. null: nichts wiederverwendbar (oder nichts geändert),
 * dann wird wie bisher alles geplant.
 */
export function windowFor(prev: PlannedTour, prevProf: Profile[], points: LatLon[], profiles: Profile[]): WindowPlan | null {
  const oldPts = prev.wegpunkte;
  if (oldPts.length < 2 || points.length < 2 || !prev.linie.length) return null;
  const { head, tail } = unchangedLegs(oldPts, prevProf, points, profiles);
  const legs = points.length - 1;
  const oldLegs = oldPts.length - 1;
  if (head + tail === 0 || head + tail >= legs) return null;
  const pts = flat(prev);
  const idx = waypointIndex(pts, prev);
  if (!idx) return null;
  const mins = legMinutes(prev, pts, idx);
  return {
    head: head > 0 ? slice(prev, pts, idx, mins, 0, head) : null,
    tail: tail > 0 ? slice(prev, pts, idx, mins, oldLegs - tail, oldLegs) : null,
    points: points.slice(head, legs - tail + 1),
    profiles: profiles.slice(head, legs - tail),
    spurBefore: [head > 0 ? spurAt(pts, pts[idx[head]].km) : 0, tail > 0 ? spurAt(pts, pts[idx[oldLegs - tail]].km) : 0],
  };
}

/**
 * Nahtstellen prüfen: Fährt die zusammengefügte Tour an einem unveränderten Punkt jetzt hin und auf demselben
 * Weg zurück (das neue Stück kennt die Fahrtrichtung davor nicht), taugt das Ergebnis nicht.
 */
export function seamsOk(merged: PlannedTour, w: WindowPlan, middle: PlannedTour): boolean {
  const pts = flat(merged);
  const km1 = w.head ? flat(w.head).slice(-1)[0].km : null;
  const km2 = km1 != null || w.tail ? (km1 ?? 0) + flat(middle).slice(-1)[0].km : null;
  if (w.head && km1 != null && spurAt(pts, km1) > w.spurBefore[0] + 150) return false;
  if (w.tail && km2 != null && spurAt(pts, km2) > w.spurBefore[1] + 150) return false;
  return true;
}
