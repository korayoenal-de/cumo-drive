/**
 * Wegpunkte einer Tour bearbeiten, gemeinsam für Web Planer und Handy Planer:
 * Via Punkt mit kleinstem Umweg einfügen, Punkte verschieben, Pässe in der Nähe der Route finden.
 */
import { passesAlong, passPoint, TIER_WEIGHT, type Pass } from './passes';
import { haversine, type LatLon } from './tour';

/**
 * Neuen Zwischenpunkt dort einfügen, wo er den kleinsten Umweg macht (nie vor dem Start, nie hinter dem Ziel).
 * Bei weniger als zwei Punkten wird er einfach angehängt.
 */
export function insertVia(pts: LatLon[], p: LatLon): LatLon[] {
  if (pts.length < 2) return [...pts, p];
  let best = 1;
  let bestCost = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const cost = haversine(pts[i - 1], p) + haversine(p, pts[i]) - haversine(pts[i - 1], pts[i]);
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return [...pts.slice(0, best), p, ...pts.slice(best)];
}

/** Punkt an Stelle i um eins nach oben (-1) oder unten (+1) verschieben. */
export function movePoint(pts: LatLon[], i: number, dir: -1 | 1): LatLon[] {
  const j = i + dir;
  if (i < 0 || i >= pts.length || j < 0 || j >= pts.length) return pts;
  const out = [...pts];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Stützpunkte der Linie für Abstandsrechnungen (höchstens etwa max). */
export function probeLine(line: LatLon[], max = 400): LatLon[] {
  const step = Math.max(1, Math.ceil(line.length / max));
  return line.filter((_, i) => i % step === 0 || i === line.length - 1);
}

/** Kleinster Abstand in Metern von p zu den Stützpunkten. */
export function distToProbe(probe: LatLon[], p: LatLon): number {
  return probe.reduce((d, q) => Math.min(d, haversine(p, q)), Infinity);
}

const RANK: Record<string, number> = { ikone: 0, bekannt: 1, mittel: 2 };

/**
 * Bekannte Pässe in der Nähe der Route, die sie noch nicht fährt: zum Einbauen.
 * Sortiert nach Bekanntheit (Ikone, bekannt, Geheimtipp), dann nach Abstand.
 */
export function passesNearRoute(
  list: Pass[],
  probe: LatLon[],
  onRoute: { pass: Pass }[],
  maxKm = 25,
  limit = 6,
): { pass: Pass; dKm: number }[] {
  if (probe.length < 2) return [];
  const on = new Set(onRoute.map((x) => x.pass.id));
  return list
    .filter((p) => !on.has(p.id))
    .map((pass) => ({ pass, dKm: distToProbe(probe, passPoint(pass)) / 1000 }))
    .filter((x) => x.dKm <= maxKm)
    .sort((a, b) => (RANK[a.pass.tier] ?? 3) - (RANK[b.pass.tier] ?? 3) || a.dKm - b.dKm)
    .slice(0, limit);
}

/** Gerade Linie von a nach b als Stützpunkte (für Etappen ohne geplante Route). */
export function straightLine(a: LatLon, b: LatLon, n = 24): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/**
 * Pässe für eine Etappe vorschlagen: im Korridor um die Linie der Etappe, ohne Pässe, die schon
 * auf der Route oder als Punkt gesetzt sind. Sortiert nach Bekanntheit (TIER_WEIGHT), dann Abstand.
 */
export function passesNearLeg(
  list: Pass[],
  legLine: LatLon[],
  skip: Set<string>,
  points: LatLon[],
  maxKm = 20,
  limit = 8,
): { pass: Pass; dKm: number }[] {
  if (legLine.length < 2) return [];
  const probe = probeLine(legLine, 120);
  // grobe Vorauswahl über den Rahmen der Etappe plus Korridor
  const pad = maxKm / 111;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [la, lo] of probe) {
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLon = Math.min(minLon, lo);
    maxLon = Math.max(maxLon, lo);
  }
  const padLon = pad / Math.max(0.2, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return list
    .filter((p) => !skip.has(p.id))
    .filter((p) => p.lat >= minLat - pad && p.lat <= maxLat + pad && p.lon >= minLon - padLon && p.lon <= maxLon + padLon)
    .filter((p) => !points.some((w) => haversine(w, passPoint(p)) < 1000))
    .map((pass) => ({ pass, dKm: distToProbe(probe, passPoint(pass)) / 1000 }))
    .filter((x) => x.dKm <= maxKm)
    .sort((a, b) => TIER_WEIGHT[b.pass.tier] - TIER_WEIGHT[a.pass.tier] || a.dKm - b.dKm)
    .slice(0, limit);
}

export type LegSuggestion = { pass: Pass; dKm: number; detourKm: number; at: number };

/** Wie weit ein Pass höchstens vom Weg wegführen darf: Anteil der Etappe plus fester Rest in km. */
const DETOUR_SHARE = 0.3;
const DETOUR_FLOOR_KM = 6;
/** Der Pass muss wirklich zwischen den beiden Punkten liegen, nicht kurz davor oder dahinter. */
const PROGRESS_MIN = 0.1;
const PROGRESS_MAX = 0.9;

/**
 * Pässe, die auf dem Weg liegen, für jede Etappe einer Punktliste.
 *
 * Ein Pass zählt für eine Etappe nur, wenn A über den Pass nach B höchstens etwa 30 Prozent länger
 * ist als A nach B (Luftlinie, Umweg Ellipse) und er zwischen 10 und 90 Prozent des Weges liegt.
 * Jeder Pass erscheint nur bei der Etappe, wo er den kleinsten Umweg macht, damit Einbauen nie
 * Zickzack erzeugt. Innerhalb einer Etappe in Fahrtrichtung sortiert.
 *
 * slots: Start, Zwischenziele, Ziel; null für noch leere Felder.
 * legLines: Linie je Etappe für die Lage (geplant oder Luftlinie).
 */
export function passesOnLegs(
  list: Pass[],
  slots: (LatLon | null)[],
  legLines: LatLon[][],
  skip: Set<string>,
  limit = 6,
): LegSuggestion[][] {
  const points = slots.filter((p): p is LatLon => !!p);
  const best = new Map<string, { leg: number; s: LegSuggestion }>();
  for (let i = 0; i < slots.length - 1; i++) {
    const a = slots[i];
    const b = slots[i + 1];
    const line = legLines[i];
    if (!a || !b || !line || line.length < 2) continue;
    const direct = haversine(a, b) / 1000;
    if (direct < 1) continue;
    const allowed = direct * DETOUR_SHARE + DETOUR_FLOOR_KM;
    const probe = probeLine(line, 160);
    const cum = cumulative(probe);
    const total = cum[cum.length - 1] || 1;
    for (const pass of list) {
      if (skip.has(pass.id)) continue;
      const p = passPoint(pass);
      const detourKm = (haversine(a, p) + haversine(p, b)) / 1000 - direct;
      if (detourKm > allowed) continue;
      if (points.some((w) => haversine(w, p) < 1000)) continue;
      const { idx, d } = nearest(probe, p);
      const at = cum[idx] / total;
      if (at < PROGRESS_MIN || at > PROGRESS_MAX) continue;
      const s: LegSuggestion = { pass, dKm: d / 1000, detourKm, at };
      const prev = best.get(pass.id);
      if (!prev || detourKm < prev.s.detourKm) best.set(pass.id, { leg: i, s });
    }
  }
  const out: LegSuggestion[][] = slots.slice(0, -1).map(() => []);
  for (const { leg, s } of best.values()) out[leg].push(s);
  return out.map((xs) =>
    xs
      // erst die bekanntesten mit wenig Umweg auswählen, dann in Fahrtrichtung zeigen
      .sort((x, y) => TIER_WEIGHT[y.pass.tier] - TIER_WEIGHT[x.pass.tier] || x.detourKm - y.detourKm)
      .slice(0, limit)
      .sort((x, y) => x.at - y.at),
  );
}

function cumulative(line: LatLon[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) out.push(out[i - 1] + haversine(line[i - 1], line[i]));
  return out;
}

function nearest(line: LatLon[], p: LatLon): { idx: number; d: number } {
  let idx = 0;
  let d = Infinity;
  for (let i = 0; i < line.length; i++) {
    const x = haversine(line[i], p);
    if (x < d) {
      d = x;
      idx = i;
    }
  }
  return { idx, d };
}

/** Pässe auf der Linie und Pässe zum Einbauen in einem Schritt. */
export function routePasses(list: Pass[], line: LatLon[]) {
  const along = passesAlong(list, line);
  return { along, near: passesNearRoute(list, probeLine(line), along) };
}
