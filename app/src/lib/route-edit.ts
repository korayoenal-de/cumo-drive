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

/** Pässe auf der Linie und Pässe zum Einbauen in einem Schritt. */
export function routePasses(list: Pass[], line: LatLon[]) {
  const along = passesAlong(list, line);
  return { along, near: passesNearRoute(list, probeLine(line), along) };
}
