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

/** Länge der Linie in km, so wie die Nahtprüfung sie misst */
export function lineKm(tour: Pick<Tour, 'linie'>): number {
  const pts = flat(tour);
  return pts.length ? pts[pts.length - 1].km : 0;
}

/** Wenden an der Stelle km der Tour (Meter), für die Nahtprüfung außerhalb dieser Datei */
export function turnAt(tour: Pick<Tour, 'linie'>, km: number): number {
  const pts = flat(tour);
  return pts.length < 2 ? 0 : spurAt(pts, km);
}

export type RunPlan = {
  /** das längste unveränderte Stück, irgendwo in der Tour */
  kept: PlannedTour;
  /** Punkte und Profile davor und danach, die neu geplant werden; null, wenn dort nichts liegt */
  before: { points: LatLon[]; profiles: Profile[] } | null;
  after: { points: LatLon[]; profiles: Profile[] } | null;
  /** Wenden an den Enden des Stücks in der alten Tour (Meter) */
  spurBefore: [number, number];
};

/**
 * Umsortieren (Gregor 19.11.2026): Rückt ein Punkt von vorn nach hinten, passt weder der Anfang noch das Ende
 * zur alten Tour, die Etappen in der Mitte sind aber dieselben. Sucht die längste Folge von Etappen, die in der
 * alten und der neuen Reihenfolge gleich ist, und lässt sie stehen. null: es gibt keine, oder nichts hat sich geändert.
 */
export function runFor(prev: PlannedTour, prevProf: Profile[], points: LatLon[], profiles: Profile[]): RunPlan | null {
  const oldPts = prev.wegpunkte;
  const oldLegs = oldPts.length - 1;
  const legs = points.length - 1;
  if (oldLegs < 1 || legs < 1 || !prev.linie.length) return null;
  let best = { o: 0, n: 0, len: 0 };
  for (let o = 0; o < oldLegs; o++) {
    for (let n = 0; n < legs; n++) {
      let len = 0;
      while (o + len < oldLegs && n + len < legs && same(oldPts[o + len], points[n + len]) && same(oldPts[o + len + 1], points[n + len + 1]) && prevProf[o + len] === profiles[n + len]) len++;
      if (len > best.len) best = { o, n, len };
    }
  }
  if (best.len === 0 || best.len >= legs) return null;
  const pts = flat(prev);
  const idx = waypointIndex(pts, prev);
  if (!idx) return null;
  const mins = legMinutes(prev, pts, idx);
  const { o, n, len } = best;
  return {
    kept: slice(prev, pts, idx, mins, o, o + len),
    before: n > 0 ? { points: points.slice(0, n + 1), profiles: profiles.slice(0, n) } : null,
    after: n + len < legs ? { points: points.slice(n + len), profiles: profiles.slice(n + len) } : null,
    spurBefore: [n > 0 ? endSpur(o === 0) : 0, n + len < legs ? endSpur(o + len === oldLegs, o + len) : 0],
  };

  /**
   * Wenden am Ende des Stücks in der alten Tour. Liegt das Ende am Start oder Ziel einer Runde, zählt, wie weit
   * Abfahrt und Ankunft dort schon dieselbe Straße nehmen: dreht sich die Runde weiter, ist das kein neues Wenden.
   */
  function endSpur(atTourEnd: boolean, w = o): number {
    if (!atTourEnd) return spurAt(pts, pts[idx![w]].km);
    if (!same(oldPts[0], oldPts[oldLegs])) return 0;
    const total = pts[pts.length - 1].km;
    const near = (km: number): LatLon => {
      let lo = 0;
      let hi = pts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].km < km) lo = mid;
        else hi = mid;
      }
      const f = (km - pts[lo].km) / Math.max(1e-9, pts[hi].km - pts[lo].km);
      return [pts[lo].p[0] + (pts[hi].p[0] - pts[lo].p[0]) * f, pts[lo].p[1] + (pts[hi].p[1] - pts[lo].p[1]) * f];
    };
    let spur = 0;
    for (let d = 25; d <= 4000 && d / 1000 < total / 2; d += 25) {
      if (haversine(near(d / 1000), near(total - d / 1000)) > 40) break;
      spur = d;
    }
    return spur;
  }
}

/**
 * Rundtour weiterdrehen (Gregor 19.11.2026): Wegpunkt k wird Start und Ziel, die Strecke bleibt Punkt für Punkt
 * dieselbe. Die Linie wird an der Stelle des Wegpunkts aufgeschnitten und in neuer Reihenfolge zusammengesetzt,
 * ohne Netz und ohne neue Planung. null, wenn die Tour keine geschlossene Runde ist.
 */
export function rotateLoop<T extends PlannedTour>(prev: T, k: number): T | null {
  const w = prev.wegpunkte;
  const n = w.length;
  if (n < 3 || k <= 0 || k >= n - 1 || !same(w[0], w[n - 1])) return null;
  const pts = flat(prev);
  if (pts.length < 3 || haversine(pts[0].p, pts[pts.length - 1].p) > 400) return null;
  const idx = waypointIndex(pts, prev);
  let j = idx ? idx[k] : -1;
  if (j < 0) {
    // Wegpunkte abseits der Linie (importierte Tour): an der nächsten Stelle der Linie aufschneiden
    let bd = Infinity;
    pts.forEach((q, i) => {
      const d = haversine(w[k], q.p);
      if (d < bd) {
        bd = d;
        j = i;
      }
    });
  }
  if (j <= 0 || j >= pts.length - 1) return null;
  const { linie, warnungen } = turnLine(prev, pts, j);
  const turn = <X,>(a: X[] | undefined, len: number): X[] | undefined => (a && a.length === len ? [...a.slice(k), ...a.slice(0, k)] : undefined);
  const out: T = {
    ...prev,
    wegpunkte: [...w.slice(k), ...w.slice(1, k + 1)],
    linie,
    warnungen,
    namen: prev.namen && prev.namen.length === n ? [...prev.namen.slice(k), ...prev.namen.slice(1, k + 1)] : undefined,
    etappen: turn(prev.etappen, n - 1),
    legMin: turn(prev.legMin, n - 1),
    legKm: turn(prev.legKm, n - 1),
    legDirekt: turn(prev.legDirekt, n - 1),
  };
  // Anteil bebaut an Start und Ziel gilt für den alten Start
  delete out.bebautStartKm;
  delete out.bebautEndKm;
  return out;
}

/** Linie und Warnungen einer geschlossenen Runde, neu begonnen am Linienpunkt j */
function turnLine(prev: PlannedTour, pts: Flat[], j: number): { linie: Tour['linie']; warnungen: Warning[] } {
  const total = pts[pts.length - 1].km;
  const cut = pts[j].km;
  const order = [...pts.slice(j), ...pts.slice(1, j + 1)];
  const linie: Tour['linie'] = [];
  for (let i = 1; i < order.length; i++) {
    const c = order[i].c;
    const last = linie[linie.length - 1];
    if (last && last.c === c) last.p.push(order[i].p);
    else linie.push({ c, p: [order[i - 1].p, order[i].p] });
  }
  const warnungen: Warning[] = prev.warnungen
    .map((x) => ({ ...x, start_km: +((((x.start_km - cut) % total) + total) % total).toFixed(2) }))
    .sort((a, b) => a.start_km - b.start_km);
  return { linie, warnungen };
}

/**
 * Rundtour an einem beliebigen Ort neu beginnen (Koray 19.11.2026: Gregor wollte den Start nach Norden legen).
 * Die Runde wird an der Stelle aufgeschnitten, die p am nächsten liegt. Dieser Einstieg wird Start und Ziel,
 * der alte Start bleibt als Zwischenziel, die Strecke bleibt dieselbe. offM sagt, wie weit p von der Strecke
 * entfernt ist: liegt p abseits, plant der Aufrufer die Anfahrt zum Einstieg und zurück (plan.ts, joinLoop).
 */
export function reanchorLoop<T extends PlannedTour>(prev: T, p: LatLon): { tour: T; entry: LatLon; offM: number } | null {
  const w = prev.wegpunkte;
  const n = w.length;
  if (n < 2 || !same(w[0], w[n - 1])) return null;
  const pts = flat(prev);
  if (pts.length < 3 || haversine(pts[0].p, pts[pts.length - 1].p) > 400) return null;
  let j = 0;
  let offM = Infinity;
  pts.forEach((q, i) => {
    const d = haversine(p, q.p);
    if (d < offM) {
      offM = d;
      j = i;
    }
  });
  if (j === 0 || j === pts.length - 1) return { tour: prev, entry: w[0], offM };
  let idx = waypointIndex(pts, prev);
  if (!idx) {
    // Wegpunkte abseits der Linie: der Reihe nach die nächste Stelle nehmen
    idx = [0];
    let cursor = 0;
    for (let i = 1; i < n - 1; i++) {
      let best = cursor;
      let bd = Infinity;
      for (let k = cursor; k < pts.length; k++) {
        const d = haversine(w[i], pts[k].p);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      idx.push(best);
      cursor = best;
    }
    idx.push(pts.length - 1);
  }
  // Liegt dort schon ein Zwischenziel (bis 500 m entlang der Strecke), wird es der Start: kein zweiter Punkt daneben
  // (geprüft am Vogesen Karussell: Barr aus der Ortssuche lag 40 m neben dem Zwischenziel Barr)
  const near = idx.map((x, i) => (i > 0 && i < n - 1 ? Math.abs(pts[x].km - pts[j].km) : Infinity));
  const at = near.indexOf(Math.min(...near));
  if (at > 0 && near[at] <= 0.5) {
    const r = rotateLoop(prev, at);
    return r ? { tour: r, entry: w[at], offM } : null;
  }
  // Etappe m der alten Runde enthält den Einstieg
  let m = 0;
  while (m < n - 2 && idx[m + 1] <= j) m++;
  const entry = pts[j].p;
  const { linie, warnungen } = turnLine(prev, pts, j);
  const e = prev.etappen && prev.etappen.length === n - 1 ? prev.etappen : null;
  const tour: T = {
    ...prev,
    wegpunkte: [entry, ...w.slice(m + 1, n - 1), w[0], ...w.slice(1, m + 1), entry],
    linie,
    warnungen,
    namen: undefined,
    etappen: e ? [e[m], ...e.slice(m + 1), ...e.slice(0, m), e[m]] : undefined,
    legMin: undefined,
    legKm: undefined,
    legDirekt: undefined,
  };
  delete tour.bebautStartKm;
  delete tour.bebautEndKm;
  return { tour, entry, offM };
}

/** Etappen a bis b der Tour unverändert herausnehmen (Start oder Ziel entfernt); null, wenn die Punkte nicht zuzuordnen sind */
export function keepLegs(prev: PlannedTour, a: number, b: number): PlannedTour | null {
  if (a < 0 || b > prev.wegpunkte.length - 1 || b - a < 1 || !prev.linie.length) return null;
  const pts = flat(prev);
  const idx = waypointIndex(pts, prev);
  if (!idx) return null;
  return slice(prev, pts, idx, legMinutes(prev, pts, idx), a, b);
}
