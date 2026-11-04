/**
 * Live Status der Pässe aus TomTom Verkehrsmeldungen (Traffic Incidents v5).
 *
 * Gedacht für den Server: Er fragt wenige Kacheln über den Alpen ab (je höchstens
 * 10.000 km²), ordnet Sperrungen den Pässen zu und verteilt das Ergebnis an alle Nutzer.
 * So hängen die Kosten nicht an der Zahl der Nutzer, und der Schlüssel bleibt geheim.
 */
import { passPoint, type Pass } from './passes';
import { haversine, type LatLon } from './tour';

export type PassStatus = {
  id: string;
  /** offen: keine Sperrung an der Passstraße gemeldet; gesperrt: Sperrung trifft den Pass */
  state: 'offen' | 'gesperrt';
  /** Ende der Sperrung, falls gemeldet (ISO Datum) */
  until: string | null;
  since: string | null;
  text: string | null;
  checkedAt: string;
};

type Incident = {
  geometry: { type: 'LineString' | 'Point'; coordinates: number[][] | number[] };
  properties: {
    iconCategory: number;
    startTime?: string;
    endTime?: string | null;
    from?: string;
    to?: string;
    events?: { description: string; iconCategory?: number }[];
  };
};

const FIELDS = '{incidents{type,geometry{type,coordinates},properties{iconCategory,events{description,iconCategory},startTime,endTime,from,to}}}';

/** Kacheln von 0,5 Grad, nur dort, wo Pässe liegen (etwa 2.000 km² je Kachel). */
export function statusTiles(passes: Pass[], size = 0.5): [number, number, number, number][] {
  const keys = new Set<string>();
  for (const p of passes) keys.add(`${Math.floor(p.lon / size)},${Math.floor(p.lat / size)}`);
  return [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return [x * size, y * size, (x + 1) * size, (y + 1) * size];
  });
}

export async function fetchIncidents(key: string, bbox: [number, number, number, number], signal?: AbortSignal): Promise<Incident[]> {
  const q = new URLSearchParams({
    key,
    bbox: bbox.map((v) => v.toFixed(4)).join(','),
    fields: FIELDS,
    language: 'de-DE',
    categoryFilter: '8',
    timeValidityFilter: 'present',
  });
  const r = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?${q}`, { signal });
  if (!r.ok) throw new Error(`TomTom ${r.status}`);
  return ((await r.json()) as { incidents?: Incident[] }).incidents ?? [];
}

function lineOf(i: Incident): LatLon[] {
  const c = i.geometry.coordinates;
  if (i.geometry.type === 'Point') return [[(c as number[])[1], (c as number[])[0]]];
  return (c as number[][]).map(([lon, lat]) => [lat, lon]);
}

/** Abstand Punkt zu Linie in Metern (über die Stützpunkte, für Sperrabschnitte reicht das). */
function distTo(p: LatLon, line: LatLon[]): number {
  let best = Infinity;
  for (const q of line) best = Math.min(best, haversine(p, q));
  return best;
}

/**
 * Ordnet Sperrungen den Pässen zu: Eine Sperrung zählt, wenn ihre Linie bis auf maxM an
 * den Passpunkt heranreicht. Kurze Baustellensperren weit unten im Tal zählen so nicht.
 */
export function matchStatus(passes: Pass[], incidents: Incident[], maxM = 400, now = new Date()): PassStatus[] {
  const closures = incidents.filter((i) => i.properties.iconCategory === 8).map((i) => ({ i, line: lineOf(i) }));
  return passes.map((p) => {
    const pt = passPoint(p);
    const hits = closures.filter((c) => distTo(pt, c.line) <= maxM);
    if (!hits.length) return { id: p.id, state: 'offen', until: null, since: null, text: null, checkedAt: now.toISOString() };
    const ends = hits.map((h) => h.i.properties.endTime).filter((e): e is string => !!e).sort();
    const starts = hits.map((h) => h.i.properties.startTime).filter((e): e is string => !!e).sort();
    const desc = hits[0].i.properties.events?.map((e) => e.description).join(', ') ?? 'Gesperrt';
    return {
      id: p.id,
      state: 'gesperrt',
      until: ends.length ? ends[ends.length - 1] : null,
      since: starts[0] ?? null,
      text: desc,
      checkedAt: now.toISOString(),
    };
  });
}

/** Alle Pässe in einem Durchlauf prüfen (für den Server). Kacheln nacheinander, freundlich zur API. */
export async function checkAllPasses(key: string, passes: Pass[], signal?: AbortSignal): Promise<PassStatus[]> {
  const incidents: Incident[] = [];
  for (const t of statusTiles(passes)) {
    incidents.push(...(await fetchIncidents(key, t, signal)));
    await new Promise((r) => setTimeout(r, 250));
  }
  return matchStatus(passes, incidents);
}
