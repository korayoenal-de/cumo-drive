/**
 * Unsere Daten (kuratierte Strecken, Pässe, Einkehr Empfehlungen) in der App: liegen im Paket und brauchen kein Netz.
 * Im Browser gibt es sie nur nach der Anmeldung vom Server (road-data.web.ts, Koray 16.11.: Schutz vor Kopierern),
 * damit sie nicht im öffentlichen JavaScript der Webseite stehen.
 *
 * Seit 17.11. (Startprüfung, Schutz des Werks) liegen sie verschleiert und mit Fingerabdruck im Paket
 * (src/data/road-pack.ts, erzeugt mit npm run pack-data) und werden beim ersten Gebrauch einmal entpackt.
 */
import { ROAD_PACK } from '@/data/road-pack';
import { KEY, decode } from './road-pack-codec';
import type { LatLon } from './tour';

export type RoadData = { curated: unknown[]; passes: unknown[]; stops: unknown[] };

const listeners = new Set<(d: RoadData) => void>();
let data: RoadData | null = null;

function unpack(): RoadData {
  if (!data) {
    const raw = JSON.parse(decode(ROAD_PACK, KEY)) as { curated: unknown[]; passes: unknown[]; stops: { stops: unknown[] } };
    data = { curated: raw.curated, passes: raw.passes, stops: raw.stops.stops };
  }
  return data;
}

/** Daten übergeben, sobald sie da sind; in der App sofort */
export function onRoadData(cb: (d: RoadData) => void) {
  cb(unpack());
  listeners.add(cb);
}

/** In der App immer bereit */
export function roadDataReady(): boolean {
  return true;
}

export async function loadRoadData(): Promise<boolean> {
  return true;
}

/** In der App liegen alle Strecken im Paket */
export async function ensureRoadArea(_points: LatLon[], _radiusKm: number): Promise<void> {}

export function roadDataLimited(): boolean {
  return false;
}
