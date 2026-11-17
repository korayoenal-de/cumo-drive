/**
 * Web: kuratierte Strecken, Pässe und Einkehr Empfehlungen kommen erst nach der Anmeldung von der Edge Function
 * road-data (Koray 16.11.: Schutz vor Kopierern). Sie stehen damit nicht im öffentlichen JavaScript der Webseite.
 *
 * Seit 17.11. kachelweise (Sicherheitskonzept Maßnahme 5): loadRoadData() holt die Pässe, ensureRoadArea() vor dem
 * Planen die Strecken und Stopps rund um die Punkte, in halben Grad Kacheln. Jedes Konto bekommt am Tag höchstens
 * 60 neue Kacheln mit Daten, das reicht für viele Planungen und macht Abgreifen langsam. Die Module füllen ihre
 * Listen über onRoadData; jeder Aufruf bekommt den ganzen bisher geladenen Stand. Nur im Speicher, nie im Browser
 * gespeichert.
 */
import type { LatLon } from './tour';

export type RoadData = { curated: unknown[]; passes: unknown[]; stops: unknown[] };
type Res = RoadData & { tiles?: string[]; denied?: string[] };

let data: RoadData | null = null;
let pending: Promise<boolean> | null = null;
const listeners = new Set<(d: RoadData) => void>();
const roads = new Map<string, unknown>();
const stops = new Map<string, unknown>();
/** schon geladene oder verweigerte Kacheln */
const tilesDone = new Set<string>();
let limited = false;

export function onRoadData(cb: (d: RoadData) => void) {
  listeners.add(cb);
  if (data) cb(data);
}

export function roadDataReady(): boolean {
  return !!data;
}

/** true, wenn heute schon Kacheln verweigert wurden (Tageskontingent erreicht) */
export function roadDataLimited(): boolean {
  return limited;
}

async function ask(tiles: string[]): Promise<Res | null> {
  const { supabase } = await import('./supabase');
  const { data: res, error } = await supabase.functions.invoke('road-data', { body: { tiles } });
  const d = res as Res | null;
  if (error || !d || !Array.isArray(d.curated) || !Array.isArray(d.passes)) return null;
  return d;
}

function merge(d: Res, asked: string[]) {
  for (const r of d.curated as { id: string }[]) roads.set(r.id, r);
  for (const s of (Array.isArray(d.stops) ? d.stops : []) as { id: string }[]) stops.set(s.id, s);
  // ältere Edge Function ohne Kacheln lieferte alles auf einmal: dann gilt das Gefragte als geladen
  for (const t of d.tiles ?? asked) tilesDone.add(t);
  for (const t of d.denied ?? []) tilesDone.add(t);
  if (d.denied?.length) limited = true;
  data = { curated: [...roads.values()], passes: d.passes.length ? d.passes : (data?.passes ?? []), stops: [...stops.values()] };
  for (const cb of listeners) cb(data);
}

/** Start des Planers: Pässe (und die Strecken an den Punkten, falls schon bekannt) */
export function loadRoadData(): Promise<boolean> {
  if (data) return Promise.resolve(true);
  if (pending) return pending;
  pending = (async () => {
    try {
      const d = await ask([]);
      if (!d) return false;
      merge(d, []);
      return true;
    } catch {
      return false;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Kachel einer Koordinate, gleiche Rechnung wie in der Edge Function */
export const tileOf = (p: LatLon) => `${Math.floor(p[0] * 2)}_${Math.floor(p[1] * 2)}`;

/** Kacheln im Umkreis entlang der Punkte (Linie über alle Punkte, alle 10 km ein Kreis) */
export function tilesAround(points: LatLon[], radiusKm: number): string[] {
  const out = new Set<string>();
  const add = (p: LatLon) => {
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((p[0] * Math.PI) / 180)));
    for (let a = Math.floor((p[0] - dLat) * 2); a <= Math.floor((p[0] + dLat) * 2); a++)
      for (let b = Math.floor((p[1] - dLon) * 2); b <= Math.floor((p[1] + dLon) * 2); b++) out.add(`${a}_${b}`);
  };
  points.forEach((p, i) => {
    add(p);
    const q = points[i + 1];
    if (!q) return;
    const km = Math.hypot((q[0] - p[0]) * 111, (q[1] - p[1]) * 111 * Math.cos((p[0] * Math.PI) / 180));
    const n = Math.floor(km / 10);
    for (let k = 1; k <= n; k++) add([p[0] + ((q[0] - p[0]) * k) / (n + 1), p[1] + ((q[1] - p[1]) * k) / (n + 1)]);
  });
  return [...out];
}

let areaChain: Promise<unknown> = Promise.resolve();

/** Vor dem Planen: Strecken und Stopps rund um die Punkte nachladen. Ohne Netz plant der Planer trotzdem. */
export function ensureRoadArea(points: LatLon[], radiusKm: number): Promise<void> {
  const run = async () => {
    const missing = tilesAround(points, radiusKm).filter((t) => !tilesDone.has(t));
    if (!missing.length) return;
    try {
      // höchstens 400 je Anfrage, wie in der Edge Function
      for (let i = 0; i < missing.length; i += 400) {
        const part = missing.slice(i, i + 400);
        const d = await ask(part);
        if (d) merge(d, part);
      }
    } catch {
      // ohne Netz: planen mit dem, was schon da ist
    }
  };
  // nacheinander, damit zwei Planungen dieselben Kacheln nicht doppelt holen
  const p = areaChain.then(run, run);
  areaChain = p;
  return p;
}
