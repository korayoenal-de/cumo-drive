/**
 * Radar beim Erstellen einer Rundtour (Ladescreen Konzept C, Koray 8.11.): ein Ring breitet sich vom Start aus,
 * kuratierte Strecken im Umkreis leuchten auf, sobald er sie erreicht. Hier nur die Daten, gezeichnet wird in der Karte.
 */
import { HIGHLIGHT_ROADS, PREFER_ROADS } from './highlight-roads';
import { haversine, type LatLon } from './tour';

/** Dauer eines Rings in ms; danach läuft er leiser in Schleife, bis die Tour fertig ist */
export const RADAR_MS = 2200;
export const RADAR_REPEAT_MS = 2800;

export type RadarRoad = { id: string; line: LatLon[]; distM: number };

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
