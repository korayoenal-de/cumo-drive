/**
 * Web: kuratierte Strecken, Pässe und Einkehr Empfehlungen kommen erst nach der Anmeldung von der Edge Function
 * road-data (Koray 16.11.: Schutz vor Kopierern). Sie stehen damit nicht im öffentlichen JavaScript der Webseite.
 * Der Planer wartet auf loadRoadData(); die Module füllen ihre Listen über onRoadData.
 */
export type RoadData = { curated: unknown[]; passes: unknown[]; stops: unknown[] };

let data: RoadData | null = null;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(d: RoadData) => void>();

export function onRoadData(cb: (d: RoadData) => void) {
  listeners.add(cb);
  if (data) cb(data);
}

export function roadDataReady(): boolean {
  return !!data;
}

export function loadRoadData(): Promise<boolean> {
  if (data) return Promise.resolve(true);
  if (pending) return pending;
  pending = (async () => {
    try {
      const { supabase } = await import('./supabase');
      const { data: res, error } = await supabase.functions.invoke('road-data', { body: {} });
      const d = res as RoadData | null;
      if (error || !d || !Array.isArray(d.curated) || !Array.isArray(d.passes)) return false;
      data = { curated: d.curated, passes: d.passes, stops: Array.isArray(d.stops) ? d.stops : [] };
      for (const cb of listeners) cb(data);
      return true;
    } catch {
      return false;
    } finally {
      pending = null;
    }
  })();
  return pending;
}
