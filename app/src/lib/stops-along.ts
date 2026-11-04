/**
 * Stopps entlang einer Route aus OpenStreetMap (Overpass): Super Plus Tankstellen, Aussichtspunkte mit
 * Parkplatz, Restaurants und Cafés. Liefert sie nach Streckenkilometer sortiert, damit man sie als
 * Via Punkt einplanen kann.
 */
import { haversine, type LatLon } from './tour';
import type { Stop } from './intent';

export type StopKind = Extract<Stop, 'tank' | 'aussicht' | 'mittag' | 'kaffee'>;

export type StopHit = {
  id: string;
  kind: StopKind;
  name: string;
  detail: string;
  p: LatLon;
  /** Kilometer entlang der Route, an dem der Stopp liegt */
  km: number;
  /** Abstand zur Route in Metern */
  offM: number;
};

export const STOP_KINDS: { id: StopKind; label: string; hint: string }[] = [
  { id: 'tank', label: 'Super Plus', hint: 'Tankstellen mit 98 Oktan oder Marken mit Super Plus' },
  { id: 'aussicht', label: 'Aussicht', hint: 'Aussichtspunkte mit Parkplatz in der Nähe' },
  { id: 'mittag', label: 'Mittag', hint: 'Restaurants direkt an der Strecke' },
  { id: 'kaffee', label: 'Kaffee', hint: 'Cafés direkt an der Strecke' },
];

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/** Marken, die fast überall Super Plus (98) führen, falls fuel:octane_98 nicht eingetragen ist. */
const PREMIUM_BRANDS = 'Shell|Aral|Esso|OMV|TotalEnergies|Total|BP|Agip|Eni|Q8|Tamoil|Avia|Jet|Migrol|Coop|Socar|Eni Station';

/** Route auf höchstens etwa 180 Stützpunkte ausdünnen (Overpass around mit Linie). */
function probe(line: LatLon[], stepM = 1500): LatLon[] {
  const out: LatLon[] = [];
  let acc = 0;
  for (let i = 0; i < line.length; i++) {
    if (i === 0) {
      out.push(line[0]);
      continue;
    }
    acc += haversine(line[i - 1], line[i]);
    if (acc >= stepM) {
      out.push(line[i]);
      acc = 0;
    }
  }
  if (out[out.length - 1] !== line[line.length - 1]) out.push(line[line.length - 1]);
  if (out.length <= 180) return out;
  const k = Math.ceil(out.length / 180);
  return out.filter((_, i) => i % k === 0 || i === out.length - 1);
}

const f5 = (v: number) => v.toFixed(5);

function query(kind: StopKind, pts: LatLon[]): string {
  const path = pts.map(([a, b]) => `${f5(a)},${f5(b)}`).join(',');
  const near = (r: number) => `(around:${r},${path})`;
  switch (kind) {
    case 'tank':
      return `[out:json][timeout:25];(
nwr[amenity=fuel]["fuel:octane_98"="yes"]${near(1200)};
nwr[amenity=fuel]["fuel:octane_100"="yes"]${near(1200)};
nwr[amenity=fuel][brand~"^(${PREMIUM_BRANDS})$",i]${near(1200)};
);out center tags 80;`;
    case 'aussicht':
      return `[out:json][timeout:25];
nwr[tourism=viewpoint]${near(1500)}->.v;
nwr[amenity=parking](around.v:300)->.p;
nwr.v(around.p:300);
out center tags 60;`;
    case 'mittag':
      return `[out:json][timeout:25];nwr[amenity=restaurant][name]${near(400)};out center tags 60;`;
    case 'kaffee':
      return `[out:json][timeout:25];nwr[amenity=cafe][name]${near(400)};out center tags 60;`;
  }
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

async function overpass(q: string, signal?: AbortSignal): Promise<OsmEl[]> {
  let last: unknown = null;
  // Overpass ist oft ausgelastet (502, 504, 429): mit Pause erneut versuchen, dann den zweiten Server
  for (const [i, url] of [...ENDPOINTS, ...ENDPOINTS].entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, 1500 * i));
    try {
      const r = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal });
      if (!r.ok) throw new Error(`Overpass ${r.status}`);
      const j = (await r.json()) as { elements?: OsmEl[] };
      return j.elements ?? [];
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('Stopps konnten nicht geladen werden.');
}

function describe(kind: StopKind, t: Record<string, string>): string {
  if (kind === 'tank') {
    const parts = [t.brand ?? t.operator];
    if (t['fuel:octane_100'] === 'yes') parts.push('100 Oktan');
    else if (t['fuel:octane_98'] === 'yes') parts.push('Super Plus 98');
    else parts.push('Super Plus wahrscheinlich');
    if (t.opening_hours === '24/7') parts.push('rund um die Uhr');
    return parts.filter(Boolean).join(', ');
  }
  if (kind === 'aussicht') return [t.ele ? `${t.ele} m` : null, 'Parkplatz in der Nähe'].filter(Boolean).join(', ');
  return [t.cuisine?.split(';')[0]?.replace(/_/g, ' '), t.opening_hours === '24/7' ? 'immer offen' : null].filter(Boolean).join(', ');
}

const defaultName: Record<StopKind, string> = { tank: 'Tankstelle', aussicht: 'Aussichtspunkt', mittag: 'Restaurant', kaffee: 'Café' };

/** Stopps einer Art entlang der Route, nach Kilometer sortiert, höchstens limit Stück. */
export async function stopsAlong(kind: StopKind, line: LatLon[], signal?: AbortSignal, limit = 12): Promise<StopHit[]> {
  if (line.length < 2) return [];
  const pts = probe(line);
  const els = await overpass(query(kind, pts), signal);
  // Kilometer je Stützpunkt der Originallinie, für die Lage entlang der Route
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]) / 1000);
  const step = Math.max(1, Math.floor(line.length / 1500));
  const seen = new Set<string>();
  const hits: StopHit[] = [];
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const p: LatLon = [lat, lon];
    let best = Infinity;
    let km = 0;
    for (let i = 0; i < line.length; i += step) {
      const d = haversine(p, line[i]);
      if (d < best) {
        best = d;
        km = cum[i];
      }
    }
    const t = e.tags ?? {};
    const name = t.name ?? t.brand ?? defaultName[kind];
    // Ketten an derselben Stelle nicht doppelt
    const key = `${name}|${Math.round(km)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ id: `${e.type}/${e.id}`, kind, name, detail: describe(kind, t), p, km, offM: best });
  }
  hits.sort((a, b) => a.km - b.km);
  if (hits.length <= limit) return hits;
  // gleichmäßig über die Strecke verteilt auswählen
  const k = hits.length / limit;
  return Array.from({ length: limit }, (_, i) => hits[Math.floor(i * k)]);
}
