/**
 * Unsere Daten (kuratierte Strecken, Pässe, Einkehr Empfehlungen) in der App: liegen im Paket und brauchen kein Netz.
 * Im Browser gibt es sie nur nach der Anmeldung vom Server (road-data.web.ts, Koray 16.11.: Schutz vor Kopierern),
 * damit sie nicht im öffentlichen JavaScript der Webseite stehen.
 */
import curated from '@/data/curated-roads.json';
import passes from '@/data/passes.json';
import stops from '@/data/recommended-stops.json';
import type { LatLon } from './tour';

export type RoadData = { curated: unknown[]; passes: unknown[]; stops: unknown[] };

const listeners = new Set<(d: RoadData) => void>();

/** Daten übergeben, sobald sie da sind; in der App sofort */
export function onRoadData(cb: (d: RoadData) => void) {
  cb({ curated: curated as unknown[], passes: passes as unknown[], stops: (stops as unknown as { stops: unknown[] }).stops });
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
