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
const WINDOW_BACK_KM = 0.3;
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

function searchRange(route: NavRoute, p: LatLon, from: number, to: number): Snap | null {
  const { shape, cumKm } = route;
  let best: Snap | null = null;
  for (let i = Math.max(0, from); i < Math.min(to, shape.length - 1); i++) {
    const pr = project(shape[i], shape[i + 1], p);
    if (!best || pr.dist < best.offM) {
      best = { index: i, km: cumKm[i] + (cumKm[i + 1] - cumKm[i]) * pr.t, offM: pr.dist, point: pr.point };
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
export function snapToRoute(route: NavRoute, pos: LatLon, hintIndex: number): Snap {
  const n = route.shape.length;
  if (n === 0) return { index: 0, km: 0, offM: Infinity, point: pos };
  if (n === 1) return { index: 0, km: 0, offM: haversine(route.shape[0], pos), point: route.shape[0] };

  if (hintIndex >= 0) {
    const h = Math.min(hintIndex, n - 1);
    const from = indexAtKm(route, route.cumKm[h] - WINDOW_BACK_KM);
    const to = indexAtKm(route, route.cumKm[h] + WINDOW_AHEAD_KM) + 1;
    const local = searchRange(route, pos, Math.max(0, from - 1), to);
    if (local && local.offM <= LOCAL_OK_M) return local;
    const all = searchRange(route, pos, 0, n - 1)!;
    if (local && all.offM > local.offM - GLOBAL_MARGIN_M) return local;
    // Weit nach vorne springen nur, wenn man wirklich nicht mehr in der Nähe ist. Sonst springt man
    // bei Runden (Ende liegt am Start) sofort ans Ende und die Navigation meldet Ziel erreicht.
    if (local && local.offM < JUMP_KEEP_M && all.km - local.km > WINDOW_AHEAD_KM) return local;
    return all;
  }
  return searchRange(route, pos, 0, n - 1)!;
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
