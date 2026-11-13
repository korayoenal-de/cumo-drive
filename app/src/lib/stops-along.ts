/**
 * Stopps entlang einer Route aus OpenStreetMap: Super Plus Tankstellen, Aussichtspunkte mit
 * Parkplatz, Restaurants, Cafés und Hotels. Liefert sie nach Streckenkilometer sortiert, damit man sie als
 * Via Punkt einplanen kann.
 *
 * Quelle sind nur die POI Kacheln auf unseren eigenen Routing Servern (statische Dateien unter /poi/v1, gebaut
 * von routing/server/cloud/poi-tiles.sh nach jedem Kartenimport). Die öffentliche Overpass API fragt die App
 * seit 13.11. nicht mehr (kein Vertrag, oft überlastet, und jede Anfrage verriet die geplante Strecke).
 * Fehlt eine Art auf einem Server (Hotels bis zu seinem nächsten Import), springt der andere ein.
 */
import { RECOMMENDED, recommendedNear } from './recommended';
import { CUMO_ROUTING_SERVERS, routingServerUrl } from './cumo-routing';
import { photonFetch } from './photon';
import { haversine, type LatLon } from './tour';
import type { Stop } from './intent';

export type StopKind = Extract<Stop, 'tank' | 'aussicht' | 'mittag' | 'kaffee' | 'hotel'>;

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
  /** aus unseren Empfehlungen (Mittag und Kaffee) */
  recommended?: boolean;
  /** Hinweis zum Parken (Empfehlungen) */
  parking?: string;
};

export const STOP_KINDS: { id: StopKind; label: string; hint: string }[] = [
  { id: 'tank', label: 'Super Plus', hint: 'Tankstellen mit 98 Oktan oder Marken mit Super Plus' },
  { id: 'aussicht', label: 'Aussicht', hint: 'Aussichtspunkte mit Parkplatz in der Nähe' },
  { id: 'mittag', label: 'Essen', hint: 'Unsere Empfehlungen: Restaurants mit Parkplatz, gut für Sportwagen. Einen Kaffee gibt es dort auch.' },
  { id: 'hotel', label: 'Hotel', hint: 'Hotels, Gasthöfe und Pensionen nahe der Strecke' },
];

/** Suchradius um die Route je Art, in Metern. */
// Hotels dürfen etwas abseits liegen, für die Nacht fährt man gern ein Stück
const RADIUS: Record<StopKind, number> = { tank: 1200, aussicht: 1500, mittag: 400, kaffee: 400, hotel: 2500 };

const M_PER_DEG = 111195;
const toRad = (d: number) => (d * Math.PI) / 180;

function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ---------- Strecke als Korridor ----------

type Corridor = { pts: LatLon[]; cum: number[] };

/** Route auf höchstens etwa 1500 Stützpunkte ausdünnen, Kilometer je Punkt von der Originallinie. */
function corridor(line: LatLon[]): Corridor {
  const step = Math.max(1, Math.floor(line.length / 1500));
  const pts: LatLon[] = [];
  const cum: number[] = [];
  let km = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) km += haversine(line[i - 1], line[i]) / 1000;
    if (i % step === 0 || i === line.length - 1) {
      pts.push(line[i]);
      cum.push(km);
    }
  }
  return { pts, cum };
}

/** Abstand von p zum Segment i des Korridors (Meter) und der Kilometer des nächsten Punkts darauf. */
function segHit(c: Corridor, i: number, p: LatLon): { d: number; km: number } {
  const a = c.pts[i];
  const b = c.pts[i + 1] ?? a;
  const kx = Math.cos(toRad(p[0])) * M_PER_DEG;
  const ax = (a[1] - p[1]) * kx;
  const ay = (a[0] - p[0]) * M_PER_DEG;
  const dx = (b[1] - a[1]) * kx;
  const dy = (b[0] - a[0]) * M_PER_DEG;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
  const cumB = c.cum[i + 1] ?? c.cum[i];
  return { d: Math.hypot(ax + t * dx, ay + t * dy), km: c.cum[i] + t * (cumB - c.cum[i]) };
}

function nearest(c: Corridor, p: LatLon, segs?: number[]): { d: number; km: number } {
  let best = { d: Infinity, km: 0 };
  const n = Math.max(1, c.pts.length - 1);
  const check = (i: number) => {
    const h = segHit(c, i, p);
    if (h.d < best.d) best = h;
  };
  if (segs) segs.forEach(check);
  else for (let i = 0; i < n; i++) check(i);
  return best;
}

type Cand = { id: string; p: LatLon; t: Record<string, string>; d: number; km: number };

function describe(kind: StopKind, t: Record<string, string>, name?: string): string {
  if (kind === 'tank') {
    // Kurz (Koray 8.11.): Marke nur, wenn sie nicht schon im Namen steht; Sorte als Oktanzahl
    const brand = t.brand ?? t.operator;
    const parts = [brand && !(name ?? '').toLowerCase().includes(brand.toLowerCase()) ? brand : null];
    if (t['fuel:octane_102'] === 'yes') parts.push('102 Oktan');
    else if (t['fuel:octane_100'] === 'yes') parts.push('100 Oktan');
    else if (t['fuel:octane_98'] === 'yes') parts.push('98 Oktan');
    else parts.push('98 vermutlich');
    if (t.opening_hours === '24/7') parts.push('24 h');
    return parts.filter(Boolean).join(' · ');
  }
  if (kind === 'aussicht') return [t.ele ? `${t.ele} m` : null, 'Parkplatz in der Nähe'].filter(Boolean).join(', ');
  if (kind === 'hotel') {
    const type = { hotel: 'Hotel', guest_house: 'Pension', motel: 'Motel', chalet: 'Chalet' }[t.tourism ?? ''] ?? 'Unterkunft';
    const stars = Number.parseInt(t.stars ?? '', 10);
    return [type, stars > 0 && stars <= 5 ? `${stars} Sterne` : null].filter(Boolean).join(', ');
  }
  return [t.cuisine?.split(';')[0]?.replace(/_/g, ' '), t.opening_hours === '24/7' ? 'immer offen' : null].filter(Boolean).join(', ');
}

const defaultName: Record<StopKind, string> = { tank: 'Tankstelle', aussicht: 'Aussichtspunkt', mittag: 'Restaurant', kaffee: 'Café', hotel: 'Hotel' };

/** Kandidaten zu StopHits: Ketten an derselben Stelle nur einmal, nach Kilometer sortiert, gleichmäßig ausgewählt. */
function finish(kind: StopKind, cands: Cand[], limit: number): StopHit[] {
  // die nächstgelegene Filiale gewinnt, wenn eine Kette mehrfach am selben Kilometer liegt
  cands.sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  const hits: StopHit[] = [];
  for (const c of cands) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const name = c.t.name ?? c.t.brand ?? defaultName[kind];
    const key = `${name}|${Math.round(c.km)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ id: c.id, kind, name, detail: describe(kind, c.t, name), p: c.p, km: c.km, offM: c.d });
  }
  hits.sort((a, b) => a.km - b.km);
  if (hits.length <= limit) return hits;
  const k = hits.length / limit;
  return Array.from({ length: limit }, (_, i) => hits[Math.floor(i * k)]);
}

// ---------- POI Kacheln vom eigenen Server ----------

/** Eintrag einer Kachel, siehe routing/server/cloud/poi_tiles.py */
type PoiRow = {
  i: string;
  n?: string;
  la: number;
  lo: number;
  /** 1: Super Plus nur über die Marke vermutet */
  p?: number;
  /** s: Sterne, t: tourism Art (nur Hotels) */
  d?: { b?: string; op?: string; o?: number; h?: string; c?: string; e?: string; s?: string; t?: string };
};

const OSM_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };

function rowTags(r: PoiRow): Record<string, string> {
  const d = r.d ?? {};
  const t: Record<string, string> = {};
  if (r.n) t.name = r.n;
  if (d.b) t.brand = d.b;
  if (d.op) t.operator = d.op;
  if (d.o === 100) t['fuel:octane_100'] = 'yes';
  else if (d.o === 98) t['fuel:octane_98'] = 'yes';
  if (d.h) t.opening_hours = d.h;
  if (d.c) t.cuisine = d.c;
  if (d.e) t.ele = d.e;
  if (d.s) t.stars = d.s;
  if (d.t) t.tourism = d.t;
  return t;
}

type PoiServer = { base: string; kinds: Set<string> };
let poiCache: { list: PoiServer[]; at: number; pending?: Promise<PoiServer[]> } | null = null;

/**
 * Server mit POI Kacheln (meta.json erreichbar) und ihren Arten. Gefunden für die ganze Sitzung gemerkt,
 * kein Server 60 s lang.
 */
async function poiServers(): Promise<PoiServer[]> {
  if (poiCache?.pending) return poiCache.pending;
  if (poiCache && (poiCache.list.length || Date.now() - poiCache.at < 60000)) return poiCache.list;
  const pending = (async () => {
    // in der Entwicklung zeigt routingServerUrl auf den Mac (ohne Kacheln), dann die eigenen Server
    const cands = [...new Set([routingServerUrl(), ...CUMO_ROUTING_SERVERS].filter((u): u is string => !!u))];
    const found = await Promise.all(
      cands.map(async (u): Promise<PoiServer | null> => {
        try {
          const r = await fetchWithTimeout(`${u}/poi/v1/meta.json`, 4000);
          if (!r.ok) return null;
          const j = (await r.json()) as { version?: number; counts?: Record<string, unknown> } | null;
          return j && !Array.isArray(j) && j.version === 1 ? { base: u, kinds: new Set(Object.keys(j.counts ?? {})) } : null;
        } catch {
          return null;
        }
      }),
    );
    return found.filter((x): x is PoiServer => !!x);
  })();
  poiCache = { list: [], at: Date.now(), pending };
  const list = await pending;
  poiCache = { list, at: Date.now() };
  return list;
}

const tileCache = new Map<string, Promise<PoiRow[]>>();

/** Eine Kachel laden, für die Sitzung gemerkt; 404 heißt leer. Nicht an den Abbruch eines Aufrufs gebunden,
 * weil sich mehrere Aufrufe dieselbe Kachel teilen. */
function tile(base: string, kind: StopKind, x: number, y: number): Promise<PoiRow[]> {
  const key = `${base}|${kind}/${x}_${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = (async () => {
      const r = await fetchWithTimeout(`${base}/poi/v1/${kind}/${x}_${y}.json`, 8000);
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`POI Kachel ${r.status}`);
      const j = (await r.json()) as unknown;
      return Array.isArray(j) ? (j as PoiRow[]) : [];
    })();
    tileCache.set(key, p);
    p.catch(() => tileCache.delete(key));
  }
  return p;
}

/** Höchstens n Aufgaben gleichzeitig. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new Error('Abgebrochen');
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function fromTiles(base: string, kind: StopKind, line: LatLon[], signal?: AbortSignal, scale = 1): Promise<Cand[]> {
  const r = RADIUS[kind] * scale;
  const c = corridor(line);
  // Kacheln (0,1 Grad), die ein Segment samt Radius berührt, mit den Segmenten je Kachel
  const segsByTile = new Map<string, number[]>();
  const n = Math.max(1, c.pts.length - 1);
  for (let i = 0; i < n; i++) {
    const a = c.pts[i];
    const b = c.pts[i + 1] ?? a;
    const dLat = r / M_PER_DEG;
    const dLon = r / (M_PER_DEG * Math.max(0.2, Math.cos(toRad(Math.max(Math.abs(a[0]), Math.abs(b[0]))))));
    const x0 = Math.floor((Math.min(a[1], b[1]) - dLon) * 10);
    const x1 = Math.floor((Math.max(a[1], b[1]) + dLon) * 10);
    const y0 = Math.floor((Math.min(a[0], b[0]) - dLat) * 10);
    const y1 = Math.floor((Math.max(a[0], b[0]) + dLat) * 10);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = `${x}_${y}`;
        const arr = segsByTile.get(k);
        if (arr) arr.push(i);
        else segsByTile.set(k, [i]);
      }
    }
  }
  const keys = [...segsByTile.keys()];
  const rows = await pool(
    keys,
    8,
    (k) => {
      const [x, y] = k.split('_').map(Number);
      return tile(base, kind, x, y);
    },
    signal,
  );
  if (signal?.aborted) throw new Error('Abgebrochen');
  const out: Cand[] = [];
  keys.forEach((k, ti) => {
    const segs = segsByTile.get(k) ?? [];
    for (const row of rows[ti]) {
      const p: LatLon = [row.la, row.lo];
      const h = nearest(c, p, segs);
      if (h.d > r) continue;
      const id = `${OSM_TYPE[row.i[0]] ?? 'node'}/${row.i.slice(1)}`;
      out.push({ id, p, t: rowTags(row), d: h.d, km: h.km });
    }
  });
  return out;
}

/**
 * Stopps einer Art entlang der Route, nach Kilometer sortiert, höchstens limit Stück.
 * scale weitet den Korridor um die Route (Korridor erweitern in der Ortssuche: 3).
 */
/**
 * Mittag und Kaffee zeigen nur unsere Empfehlungen (Koray 11.11.), dafür in einem breiteren Korridor:
 * ein empfohlenes Lokal lohnt ein paar Minuten Umweg. Die freie Suche findet weiterhin jedes Lokal.
 */
const REC_RADIUS = 3000;
function recommendedAlong(kind: 'mittag' | 'kaffee', line: LatLon[], limit: number, scale: number): StopHit[] {
  const c = corridor(line);
  const maxM = REC_RADIUS * scale;
  // grober Rahmen um die Strecke, damit nicht jeder Eintrag gegen jedes Segment gerechnet wird
  const lat = c.pts.map((p) => p[0]);
  const lon = c.pts.map((p) => p[1]);
  const pad = maxM / 70000;
  const box = [Math.min(...lat) - pad, Math.max(...lat) + pad, Math.min(...lon) - pad, Math.max(...lon) + pad];
  const hits: StopHit[] = [];
  for (const r of RECOMMENDED) {
    if (r.p[0] < box[0] || r.p[0] > box[1] || r.p[1] < box[2] || r.p[1] > box[3]) continue;
    const n = nearest(c, r.p);
    if (n.d > maxM) continue;
    hits.push({ id: r.id, kind, name: r.name, detail: r.food, p: r.p, km: n.km, offM: n.d, recommended: true, parking: r.parking });
  }
  return hits.sort((a, b) => a.km - b.km).slice(0, Math.max(limit, 40));
}

export async function stopsAlong(kind: StopKind, line: LatLon[], signal?: AbortSignal, limit = 12, scale = 1): Promise<StopHit[]> {
  if (line.length < 2) return [];
  if (kind === 'mittag' || kind === 'kaffee') return recommendedAlong(kind, line, limit, scale);
  const servers = (await poiServers()).filter((s) => s.kinds.has(kind));
  if (signal?.aborted) throw new Error('Abgebrochen');
  // der Reihe nach: hat der erste die Art nicht oder sind seine Kacheln gestört, fragt die App den nächsten
  for (const s of servers) {
    try {
      return finish(kind, await fromTiles(s.base, kind, line, signal, scale), limit);
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  throw new Error(`${STOP_KINDS.find((k) => k.id === kind)?.label ?? 'Stopps'} lassen sich gerade nicht laden. Versuch es gleich noch einmal.`);
}

/**
 * Hotels, Cafés und Restaurants rund um einen Ort (Ziel oder Zwischenziel antippen, Koray 8.11.).
 * Über Photon statt Overpass: kleine, schnelle Abfrage, die abends nicht an überlasteten Overpass
 * Servern hängt (Testfahrt 8.11.: "Die Hotels lassen sich gerade nicht laden").
 */
const NEAR_QUERY: Record<'hotel' | 'kaffee' | 'mittag', { q: string[]; tags: string[]; radiusM: number }> = {
  hotel: { q: ['hotel', 'gasthof', 'pension'], tags: ['tourism:hotel', 'tourism:guest_house', 'tourism:motel', 'tourism:chalet'], radiusM: 5000 },
  kaffee: { q: ['cafe', 'konditorei'], tags: ['amenity:cafe'], radiusM: 1500 },
  mittag: { q: ['restaurant', 'gasthaus', 'trattoria'], tags: ['amenity:restaurant'], radiusM: 1500 },
};
const NEAR_TYPE: Record<string, string> = { hotel: 'Hotel', guest_house: 'Pension', motel: 'Motel', chalet: 'Chalet', cafe: 'Café', restaurant: 'Restaurant' };

/** type: Hotel, Pension, Café … (leer, wenn unbekannt) */
export type NearPlace = {
  id: string;
  name: string;
  detail: string;
  type: string;
  p: LatLon;
  distM: number;
  /** Nur gesetzt, wenn bekannt (Partnerhotel, Club Tipp, OSM); unbekannt heißt nie Nein */
  parking?: 'bewacht' | 'parkplatz';
  stars?: number;
  charge?: boolean;
  food?: boolean;
  garage?: boolean;
};

export async function placesNear(kind: 'hotel' | 'kaffee' | 'mittag', at: LatLon, signal?: AbortSignal): Promise<NearPlace[]> {
  // Pause am Ziel oder Zwischenziel: nur Empfehlungen, im Umkreis von 15 km (Koray 11.11.)
  if (kind !== 'hotel')
    return recommendedNear(kind, at, 15000).map((r) => ({ id: r.id, name: r.name, detail: r.food, type: 'Restaurant', p: r.p, distM: r.distM, parking: 'parkplatz' as const, food: true }));
  const cfg = NEAR_QUERY[kind];
  const lists = await Promise.all(
    cfg.q.map(async (q) => {
      const url = new URL('https://x/api/');
      url.searchParams.set('q', q);
      url.searchParams.set('lat', String(at[0]));
      url.searchParams.set('lon', String(at[1]));
      url.searchParams.set('limit', '30');
      url.searchParams.set('location_bias_scale', '0.1');
      url.searchParams.set('zoom', '14');
      url.searchParams.set('lang', 'de');
      for (const t of cfg.tags) url.searchParams.append('osm_tag', t);
      const r = await photonFetch(`${url.pathname}${url.search}`, signal);
      const j = (await r.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number | undefined> }[] };
      return j.features ?? [];
    }),
  );
  const seen = new Set<string>();
  const out: NearPlace[] = [];
  for (const f of lists.flat()) {
    const pr = f.properties;
    const name = String(pr.name ?? '').trim();
    if (!name) continue;
    const p: LatLon = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    const distM = haversine(at, p);
    if (distM > cfg.radiusM) continue;
    const id = `${pr.osm_type ?? ''}${pr.osm_id ?? name}`;
    if (seen.has(id) || out.some((o) => o.name === name && haversine(o.p, p) < 150)) continue;
    seen.add(id);
    const type = NEAR_TYPE[String(pr.osm_value ?? '')] ?? '';
    const where = [pr.street, pr.city ?? pr.district].filter(Boolean).join(', ');
    out.push({ id, name, detail: [type, where].filter(Boolean).join(', '), type, p, distM });
  }
  return out.sort((a, b) => a.distM - b.distM).slice(0, 25);
}
