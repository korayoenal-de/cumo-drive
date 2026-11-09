/**
 * Radar beim Erstellen einer Rundtour (Ladescreen Konzept C, Koray 8.11.): ein Ring breitet sich vom Start aus,
 * kuratierte Strecken im Umkreis leuchten auf, sobald er sie erreicht. Hier nur die Daten, gezeichnet wird in der Karte.
 */
import { HIGHLIGHT_ROADS, PREFER_ROADS } from './highlight-roads';
import { haversine, type LatLon } from './tour';

/** Dauer eines Rings in ms; danach läuft er leiser in Schleife, bis die Tour fertig ist */
export const RADAR_MS = 2200;
export const RADAR_REPEAT_MS = 2800;
/** Ring beim Auflösen, schneller als beim Suchen */
export const RADAR_FAST_MS = 1300;

export type RadarRoad = { id: string; line: LatLon[]; distM: number };

/** Radar in der Karte: suchen (Ring) oder auflösen (Ring findet die Stücke der fertigen Route, dann zeichnet sich die Linie) */
export type Radar = { center: LatLon; radiusM: number; roads: RadarRoad[]; count: number; phase: 'suchen' | 'aufloesen'; line?: LatLon[]; spots?: RadarSpot[] };

/** Bevorzugte Strecke als Punkt, den der Ring beim Suchen findet (Koray 9.11.) */
export type RadarSpot = { id: string; p: LatLon; distM: number };

/**
 * Strecken mit Präferenz (tier prefer, keine Highlights) im Umkreis als Punkte: die Mitte der Strecke,
 * nach Abstand sortiert. Der Ring "findet" sie nach und nach, während die Rundtour entsteht.
 */
export function radarSpots(center: LatLon, radiusM: number, max = 40): RadarSpot[] {
  const dLat = radiusM / 111320;
  const dLon = dLat / Math.max(0.2, Math.cos((center[0] * Math.PI) / 180));
  const out: RadarSpot[] = [];
  for (const r of PREFER_ROADS) {
    const p = r.line[Math.floor(r.line.length / 2)];
    if (Math.abs(p[0] - center[0]) > dLat || Math.abs(p[1] - center[1]) > dLon) continue;
    const d = haversine(center, p);
    if (d <= radiusM) out.push({ id: r.id, p, distM: d });
  }
  return out.sort((a, b) => a.distM - b.distM).slice(0, max);
}

/** Wie weit eine Runde dieser Länge vom Start weg führt, ungefähr */
export const radarRadiusM = (km: number) => Math.max(8000, Math.min(60000, km * 1000 * 0.32));

/** Kuratierte Strecken, deren nächster Punkt im Umkreis liegt, nach Abstand sortiert */
export function radarRoads(center: LatLon, radiusM: number, max = 40): RadarRoad[] {
  const out: RadarRoad[] = [];
  // grober Vorfilter über das Rechteck, damit nicht jede Strecke Punkt für Punkt gemessen wird
  const dLat = radiusM / 111320;
  const dLon = dLat / Math.max(0.2, Math.cos((center[0] * Math.PI) / 180));
  for (const r of [...HIGHLIGHT_ROADS, ...PREFER_ROADS]) {
    if (r.line.length < 2) continue;
    let best = Infinity;
    for (const p of r.line) {
      if (Math.abs(p[0] - center[0]) > dLat || Math.abs(p[1] - center[1]) > dLon) continue;
      const d = haversine(center, p);
      if (d < best) best = d;
    }
    if (best <= radiusM) out.push({ id: r.id, line: r.line, distM: best });
  }
  return out.sort((a, b) => a.distM - b.distM).slice(0, max);
}

/** Dauer der Auflösung, wenn die Route da ist: Ring findet ihre kurvigen Stücke, dann zeichnet sich die Linie */
export const REVEAL_MS = 2300;

/**
 * Kurvige Stücke der fertigen Route für die Ladeanimation (Koray 8.11.: was das Radar "findet", soll zur
 * Strecke passen). Stücke von 480 m mit mindestens 60 Grad Richtungswechsel, aneinanderhängende zusammengefasst.
 */
export function curvyPieces(line: LatLon[], center: LatLon, max = 30): RadarRoad[] {
  if (line.length < 3) return [];
  // auf etwa 60 m Schritte bringen
  const pts: LatLon[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const d = haversine(line[i - 1], line[i]);
    carry += d;
    if (carry >= 60) {
      pts.push(line[i]);
      carry = 0;
    }
  }
  const head = (a: LatLon, b: LatLon) => (Math.atan2((b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), b[0] - a[0]) * 180) / Math.PI;
  const W = 8;
  const curvy: boolean[] = [];
  for (let s = 0; s + W + 1 < pts.length; s += W) {
    let acc = 0;
    for (let i = s + 2; i <= s + W + 1; i++) {
      let d = head(pts[i - 1], pts[i]) - head(pts[i - 2], pts[i - 1]);
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      if (Math.abs(d) >= 3) acc += Math.abs(d);
    }
    curvy.push(acc >= 60);
  }
  const out: RadarRoad[] = [];
  let startW = -1;
  for (let w = 0; w <= curvy.length; w++) {
    if (w < curvy.length && curvy[w]) {
      if (startW < 0) startW = w;
      continue;
    }
    if (startW >= 0) {
      const seg = pts.slice(startW * W, Math.min(pts.length, w * W + 2));
      if (seg.length > 2) out.push({ id: `kurve-${startW}`, line: seg, distM: Math.min(...seg.map((p) => haversine(center, p))) });
      startW = -1;
    }
  }
  // die längsten zuerst, damit bei vielen Stücken die markanten bleiben
  return out.sort((a, b) => b.line.length - a.line.length).slice(0, max);
}
