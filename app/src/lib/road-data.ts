/**
 * Unsere Daten (kuratierte Strecken, Pässe, Einkehr Empfehlungen) in der App: liegen im Paket und brauchen kein Netz.
 * Im Browser gibt es sie nur nach der Anmeldung vom Server (road-data.web.ts, Koray 16.11.: Schutz vor Kopierern),
 * damit sie nicht im öffentlichen JavaScript der Webseite stehen.
 *
 * Seit 17.11. (Startprüfung, Schutz des Werks) liegen sie verschleiert und mit Fingerabdruck im Paket
 * (src/data/road-pack.ts, erzeugt mit npm run pack-data) und werden beim ersten Gebrauch einmal entpackt.
 *
 * Seit 17.11. abends (Performance Punkt 1) nicht mehr beim Laden des JavaScript: Die Listen (HIGHLIGHT_ROADS, PASSES,
 * RECOMMENDED) rufen ensureRoadData() beim ersten Zugriff (lib/lazy-list.ts), und das Vorladen nach der Startanimation
 * tut es spätestens. So hält das Entpacken den Start nicht mehr auf.
 */
import { ROAD_PACK } from '@/data/road-pack';
import { KEY, decode } from './road-pack-codec';
import type { LatLon } from './tour';

export type RoadData = { curated: unknown[]; passes: unknown[]; stops: unknown[] };

const listeners: ((d: RoadData) => void)[] = [];
let data: RoadData | null = null;
let loading = false;

function unpack(): RoadData {
  if (!data) {
    const raw = JSON.parse(decode(ROAD_PACK, KEY)) as { curated: unknown[]; passes: unknown[]; stops: { stops: unknown[] } };
    data = { curated: raw.curated, passes: raw.passes, stops: raw.stops.stops };
  }
  return data;
}

/** Daten übergeben, sobald sie da sind: in der App beim ersten Gebrauch (ensureRoadData) */
export function onRoadData(cb: (d: RoadData) => void) {
  listeners.push(cb);
  if (data) cb(data);
}

/** Jetzt entpacken und allen übergeben, falls noch nicht geschehen; danach nur noch ein Vergleich */
export function ensureRoadData(): void {
  if (data || loading) return;
  loading = true;
  try {
    const d = unpack();
    for (const cb of listeners) cb(d);
  } finally {
    loading = false;
  }
}

/** Für Tests und Messung: wurde schon entpackt? */
export function roadDataLoaded(): boolean {
  return data !== null;
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
