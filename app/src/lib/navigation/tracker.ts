/**
 * Positionsverfolgung auf einer NavRoute. Reine Funktionen ohne React und ohne Expo,
 * damit sie sich am Schreibtisch testen lassen.
 */
import { haversine, type LatLon } from '../tour';
import type { NavRoute } from './types';

export type Snap = {
  /** Index des Segmentanfangs (Segment index bis index + 1) */
  index: number;
  /** km ab Start der Route am Lotfußpunkt */
  km: number;
  /** Abstand zur Route in Metern */
  offM: number;
  /** Lotfußpunkt auf der Route */
  point: LatLon;
};

export type Progress = {
  /** Index des nächsten Manövers in route.maneuvers (route.maneuvers.length, wenn keins mehr kommt) */
  next: number;
  /** Meter bis zum nächsten Manöver */
  distToNextM: number | null;
  /** verbleibende km bis zum Ziel */
  remainingKm: number;
};

/** Suchfenster um den Hinweis Index in km vor und zurück */
const WINDOW_BACK_KM = 1;
const WINDOW_AHEAD_KM = 3;
/** Liegt der Treffer im Fenster weiter weg, wird die ganze Route durchsucht */
const LOCAL_OK_M = 80;
/** Ein globaler Treffer muss so viel näher sein, um den lokalen zu ersetzen */
const GLOBAL_MARGIN_M = 40;
/** Bis zu diesem Abstand bleibt man auf dem lokalen Abschnitt, statt weit nach vorne zu springen */
const JUMP_KEEP_M = 250;

/** Projektion von p auf das Segment a b in einer lokalen ebenen Näherung. */
function project(a: LatLon, b: LatLon, p: LatLon): { t: number; point: LatLon; dist: number } {
  const kx = Math.cos((p[0] * Math.PI) / 180);
  const ax = a[1] * kx;
  const ay = a[0];
  const bx = b[1] * kx;
  const by = b[0];
  const px = p[1] * kx;
  const py = p[0];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const point: LatLon = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, point, dist: haversine(point, p) };
}

/**
 * Fortschritt bevorzugen: Liegen zwei Stellen der Route fast gleich nah (Hin und Rückweg einer
 * Stichstraße, Kehren übereinander, Kreuzungen), gewinnt die, die zum bisherigen Fortschritt passt.
 * Zurück kostet viel (0,5 m je Meter ab 60 m), voraus 0,15 m je Meter ab 80 m (schneller fährt
 * keiner zwischen zwei GPS Punkten; kleine Schleifen um Zwischenziele). Gedeckelt bei 60 und 150 m.
 * Gefunden mit der QS Fahrt vom 6.11.: ohne das lief die Position auf Stichstraßen rückwärts.
 */
const BACK_FREE_M = 60;
const BACK_COST = 0.5;
const AHEAD_FREE_M = 80;
const AHEAD_COST = 0.15;
/** Deckel: passt der bisherige Abschnitt gar nicht mehr, findet die Position zurück oder springt vor */
const BACK_CAP_M = 60;
const AHEAD_CAP_M = 150;
/** Fahrtrichtung vom GPS: Abschnitte, die mehr als 50 Grad anders laufen, kosten 0,6 m je Grad */
const HEADING_FREE_DEG = 50;
const HEADING_COST = 0.6;

function segBearing(a: LatLon, b: LatLon): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
}

type Scored = Snap & { score: number };

/**
 * Weiter voraus, als man seit der letzten Position gefahren sein kann, kostet zusätzlich 0,6 m je Meter
 * (Serpentinen: die nächste Kehre liegt oft nur 50 m Luftlinie entfernt, aber 400 m weiter auf der Straße).
 */
const IMPLAUSIBLE_COST = 0.6;
const IMPLAUSIBLE_CAP_M = 250;

function searchRange(route: NavRoute, p: LatLon, from: number, to: number, refKm?: number, heading?: number | null, maxAheadM?: number): Scored | null {
  const { shape, cumKm } = route;
  let best: Scored | null = null;
  let bestScore = Infinity;
  for (let i = Math.max(0, from); i < Math.min(to, shape.length - 1); i++) {
    const pr = project(shape[i], shape[i + 1], p);
    const km = cumKm[i] + (cumKm[i + 1] - cumKm[i]) * pr.t;
    let score = pr.dist;
    if (refKm != null) {
      const d = (km - refKm) * 1000;
      score += d < 0 ? Math.min(BACK_CAP_M, BACK_COST * Math.max(0, -d - BACK_FREE_M)) : Math.min(AHEAD_CAP_M, AHEAD_COST * Math.max(0, d - AHEAD_FREE_M));
      if (maxAheadM != null && d > maxAheadM) score += Math.min(IMPLAUSIBLE_CAP_M, IMPLAUSIBLE_COST * (d - maxAheadM));
    }
    if (heading != null && pr.dist < bestScore) {
      const diff = Math.abs(((segBearing(shape[i], shape[i + 1]) - heading + 540) % 360) - 180);
      score += HEADING_COST * Math.max(0, diff - HEADING_FREE_DEG);
    }
    if (score < bestScore) {
      bestScore = score;
      best = { index: i, km, offM: pr.dist, point: pr.point, score };
    }
  }
  return best;
}

/** Erster Index mit cumKm >= km (binäre Suche). */
export function indexAtKm(route: NavRoute, km: number): number {
  const c = route.cumKm;
  let lo = 0;
  let hi = c.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid] < km) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Position auf die Route legen. Gesucht wird zuerst in einem Fenster um hintIndex (etwas
 * zurück, ein Stück voraus), damit bei Rundtouren und sich kreuzenden Abschnitten der
 * richtige Durchgang gewählt wird. Nur wenn dort nichts Nahes liegt, wird die ganze Route
 * durchsucht. Ohne Hinweis (hintIndex kleiner 0) wird immer die ganze Route durchsucht.
 */
/**
 * maxAheadM: so weit kann man seit der letzten Position höchstens gekommen sein (Tempo mal Zeit plus Reserve).
 * Ohne Angabe gilt nur die allgemeine Vorliebe für den bisherigen Fortschritt.
 */
export function snapToRoute(route: NavRoute, pos: LatLon, hintIndex: number, heading?: number | null, maxAheadM?: number): Snap {
  const n = route.shape.length;
  if (n === 0) return { index: 0, km: 0, offM: Infinity, point: pos };
  if (n === 1) return { index: 0, km: 0, offM: haversine(route.shape[0], pos), point: route.shape[0] };

  if (hintIndex >= 0) {
    const h = Math.min(hintIndex, n - 1);
    const from = indexAtKm(route, route.cumKm[h] - WINDOW_BACK_KM);
    const to = indexAtKm(route, route.cumKm[h] + WINDOW_AHEAD_KM) + 1;
    const local = searchRange(route, pos, Math.max(0, from - 1), to, route.cumKm[h], heading, maxAheadM);
    // Bewertet wird mit Abstand plus Kosten für Richtung und Rücksprung, nicht nur mit dem Abstand:
    // sonst gewinnt auf Hin und Rückweg derselben Straße der falsche Durchgang.
    if (local && local.score <= LOCAL_OK_M) return strip(local);
    const all = searchRange(route, pos, 0, n - 1, undefined, heading)!;
    if (local && all.score > local.score - GLOBAL_MARGIN_M) return strip(local);
    // Weit nach vorne oder zurück springen nur, wenn man wirklich nicht mehr in der Nähe ist. Sonst
    // springt man bei Runden (Ende liegt am Start) ans Ende und meldet Ziel erreicht, oder kurz vor dem
    // Ziel zurück an den Start und kommt nie an (QS 6.11.: GPS Ausreißer am Ende der Sellaronda).
    if (local && local.offM < JUMP_KEEP_M && Math.abs(all.km - local.km) > 1) return strip(local);
    return strip(all);
  }
  return strip(searchRange(route, pos, 0, n - 1, undefined, heading)!);
}

function strip(s: Scored): Snap {
  return { index: s.index, km: s.km, offM: s.offM, point: s.point };
}

/** Nächstes Manöver und Abstände für eine Position km auf der Route. */
export function progress(route: NavRoute, km: number): Progress {
  const remainingKm = Math.max(0, route.km - km);
  // Manöver gilt als erledigt, sobald man 15 m daran vorbei ist
  const passed = 0.015;
  let next = route.maneuvers.length;
  for (let i = 0; i < route.maneuvers.length; i++) {
    const m = route.maneuvers[i];
    // das Start Manöver liegt bei km 0, es wird beim Start einmal angesagt und nicht angezeigt
    if (m.kind === 'start' && i === 0 && route.maneuvers.length > 1) continue;
    if (m.km >= km - passed) {
      next = i;
      break;
    }
  }
  const distToNextM = next < route.maneuvers.length ? Math.max(0, (route.maneuvers[next].km - km) * 1000) : null;
  return { next, distToNextM, remainingKm };
}

/** Punkt bei km auf der Route und Fahrtrichtung dort (für die Simulation). */
export function pointAtKm(route: NavRoute, km: number): { point: LatLon; heading: number; index: number } {
  const { shape, cumKm } = route;
  const k = Math.max(0, Math.min(km, route.km));
  let i = Math.max(0, indexAtKm(route, k) - 1);
  if (i >= shape.length - 1) i = Math.max(0, shape.length - 2);
  const a = shape[i];
  const b = shape[Math.min(i + 1, shape.length - 1)];
  const seg = cumKm[i + 1] - cumKm[i];
  const t = seg > 0 ? (k - cumKm[i]) / seg : 0;
  const point: LatLon = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { point, heading: bearingDeg(a, b), index: i };
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x =
    Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
