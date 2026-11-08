/**
 * Stopps entlang einer Route aus OpenStreetMap: Super Plus Tankstellen, Aussichtspunkte mit
 * Parkplatz, Restaurants, Cafés und Hotels. Liefert sie nach Streckenkilometer sortiert, damit man sie als
 * Via Punkt einplanen kann.
 *
 * Quelle zuerst die POI Kacheln vom eigenen Routing Server (statische Dateien unter /poi/v1, gebaut von
 * routing/server/cloud/poi-tiles.sh nach jedem Kartenimport). Nur wenn dort keine meta.json erreichbar ist
 * (oder Kacheln nicht laden), fragt die App wie bisher die öffentliche Overpass API.
 */
import { CUMO_ROUTING_URL, routingServerUrl } from './cumo-routing';
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
};

export const STOP_KINDS: { id: StopKind; label: string; hint: string }[] = [
  { id: 'tank', label: 'Super Plus', hint: 'Tankstellen mit 98 Oktan oder Marken mit Super Plus' },
  { id: 'aussicht', label: 'Aussicht', hint: 'Aussichtspunkte mit Parkplatz in der Nähe' },
  { id: 'mittag', label: 'Mittag', hint: 'Restaurants direkt an der Strecke' },
  { id: 'kaffee', label: 'Kaffee', hint: 'Cafés direkt an der Strecke' },
  { id: 'hotel', label: 'Hotel', hint: 'Hotels, Gasthöfe und Pensionen nahe der Strecke' },
];

/** Suchradius um die Route je Art, in Metern (gleich für Kacheln und Overpass). */
// Hotels dürfen etwas abseits liegen, für die Nacht fährt man gern ein Stück
const RADIUS: Record<StopKind, number> = { tank: 1200, aussicht: 1500, mittag: 400, kaffee: 400, hotel: 2500 };

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

/** Marken, die fast überall Super Plus (98) führen, falls fuel:octane_98 nicht eingetragen ist.
 * Gleiche Liste in routing/server/cloud/poi_tiles.py. */
const PREMIUM_BRANDS = 'Shell|Aral|Esso|OMV|TotalEnergies|Total|BP|Agip|Eni|Q8|Tamoil|Avia|Jet|Migrol|Coop|Socar|Eni Station';

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
    hits.push({ id: c.id, kind, name, detail: describe(kind, c.t), p: c.p, km: c.km, offM: c.d });
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

let poiBaseCache: { base: string | null; at: number; pending?: Promise<string | null> } | null = null;
/** Arten, für die der Server Kacheln hat (aus meta.json). Ältere Kacheln kennen noch keine Hotels. */
let poiKinds: Set<string> | null = null;

/** Server mit POI Kacheln (meta.json erreichbar), erfolgreich für die ganze Sitzung, Fehlschlag 60 s gemerkt. */
async function poiBase(): Promise<string | null> {
  if (poiBaseCache?.pending) return poiBaseCache.pending;
  if (poiBaseCache && (poiBaseCache.base || Date.now() - poiBaseCache.at < 60000)) return poiBaseCache.base;
  const pending = (async () => {
    // in der Entwicklung zeigt routingServerUrl auf den Mac (ohne Kacheln), dann der eigene Server
    const cands = [...new Set([routingServerUrl(), CUMO_ROUTING_URL].filter((u): u is string => !!u))];
    for (const u of cands) {
      try {
        const r = await fetchWithTimeout(`${u}/poi/v1/meta.json`, 4000);
        if (!r.ok) continue;
        const j = (await r.json()) as { version?: number; counts?: Record<string, unknown> } | null;
        if (j && !Array.isArray(j) && j.version === 1) {
          poiKinds = new Set(Object.keys(j.counts ?? {}));
          return u;
        }
      } catch {
        // nächster Kandidat
      }
    }
    return null;
  })();
  poiBaseCache = { base: null, at: Date.now(), pending };
  const base = await pending;
  poiBaseCache = { base, at: Date.now() };
  return base;
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

// ---------- Overpass als Ersatz ----------

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

function query(kind: StopKind, pts: LatLon[], scale = 1): string {
  const path = pts.map(([a, b]) => `${f5(a)},${f5(b)}`).join(',');
  const near = (r: number) => `(around:${r},${path})`;
  const r = Math.round(RADIUS[kind] * scale);
  switch (kind) {
    case 'tank':
      return `[out:json][timeout:10];(
nwr[amenity=fuel]["fuel:octane_98"="yes"]${near(r)};
nwr[amenity=fuel]["fuel:octane_100"="yes"]${near(r)};
nwr[amenity=fuel][brand~"^(${PREMIUM_BRANDS})$",i]${near(r)};
);out center tags 80;`;
    case 'aussicht':
      return `[out:json][timeout:10];
nwr[tourism=viewpoint]${near(r)}->.v;
nwr[amenity=parking](around.v:300)->.p;
nwr.v(around.p:300);
out center tags 60;`;
    case 'mittag':
      return `[out:json][timeout:10];nwr[amenity=restaurant][name]${near(r)};out center tags 60;`;
    case 'kaffee':
      return `[out:json][timeout:10];nwr[amenity=cafe][name]${near(r)};out center tags 60;`;
    case 'hotel':
      return `[out:json][timeout:10];nwr[tourism~"^(hotel|guest_house|motel|chalet)$"][name]${near(r)};out center tags 60;`;
  }
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** Beide Overpass Server gleichzeitig fragen, die erste gültige Antwort gewinnt, nach 8 s ist Schluss. */
function overpass(q: string, signal?: AbortSignal, timeoutMs = 8000): Promise<OsmEl[]> {
  return new Promise<OsmEl[]>((resolve, reject) => {
    const ctrls = ENDPOINTS.map(() => new AbortController());
    let pending = ENDPOINTS.length;
    let done = false;
    let timedOut = false;
    let last: unknown = null;
    const stopAll = () => ctrls.forEach((c) => c.abort());
    const onAbort = () => stopAll();
    const timer = setTimeout(() => {
      timedOut = true;
      stopAll();
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort);
    const settle = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      stopAll();
      fn();
    };
    ENDPOINTS.forEach((url, i) => {
      fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(q)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrls[i].signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`Overpass ${r.status}`);
          const j = (await r.json()) as { elements?: OsmEl[] };
          return j.elements ?? [];
        })
        .then(
          (els) => settle(() => resolve(els)),
          (e: unknown) => {
            last = e;
            if (--pending > 0) return;
            settle(() => {
              if (signal?.aborted) reject(e instanceof Error ? e : new Error('Abgebrochen'));
              else if (timedOut) reject(new Error('Stopps konnten nicht geladen werden, Overpass antwortet gerade nicht.'));
              else reject(last instanceof Error ? last : new Error('Stopps konnten nicht geladen werden.'));
            });
          },
        );
    });
  });
}

/** Linie in Stücke von etwa maxKm teilen (mit einem gemeinsamen Punkt an jeder Naht). */
function chunks(line: LatLon[], maxKm: number): LatLon[][] {
  const out: LatLon[][] = [];
  let cur: LatLon[] = [line[0]];
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    km += haversine(line[i - 1], line[i]) / 1000;
    cur.push(line[i]);
    if (km >= maxKm && i < line.length - 1) {
      out.push(cur);
      cur = [line[i]];
      km = 0;
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

async function fromOverpass(kind: StopKind, line: LatLon[], signal?: AbortSignal, scale = 1): Promise<Cand[]> {
  // Lange Routen in Stücken fragen: eine Abfrage über 500 km mit breitem Korridor (Hotels) lief in den
  // Zeitablauf und lieferte nichts (Heppenheim bis Gardasee, 8.11.). Je Stück eigene Höchstzahl, zwei parallel.
  const parts = chunks(line, 80);
  const lists = await pool(parts, 2, (part) => overpass(query(kind, probe(part), scale), signal, 15000).catch((e: unknown) => {
    if (signal?.aborted || parts.length === 1) throw e;
    return [] as OsmEl[];
  }), signal);
  const seenEl = new Set<string>();
  const els = lists.flat().filter((e) => {
    const k = `${e.type}/${e.id}`;
    if (seenEl.has(k)) return false;
    seenEl.add(k);
    return true;
  });
  if (!els.length && lists.every((l) => !l.length) && parts.length > 1) {
    // alle Stücke leer: könnte ein Ausfall sein, einmal ganz fragen, damit ein Fehler sichtbar wird
    els.push(...(await overpass(query(kind, probe(line), scale), signal, 15000)));
  }
  const c = corridor(line);
  const out: Cand[] = [];
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const p: LatLon = [lat, lon];
    const h = nearest(c, p);
    out.push({ id: `${e.type}/${e.id}`, p, t: e.tags ?? {}, d: h.d, km: h.km });
  }
  return out;
}

/**
 * Stopps einer Art entlang der Route, nach Kilometer sortiert, höchstens limit Stück.
 * scale weitet den Korridor um die Route (Korridor erweitern in der Ortssuche: 3).
 */
export async function stopsAlong(kind: StopKind, line: LatLon[], signal?: AbortSignal, limit = 12, scale = 1): Promise<StopHit[]> {
  if (line.length < 2) return [];
  const base = await poiBase();
  if (signal?.aborted) throw new Error('Abgebrochen');
  // Fehlt die Art in den Kacheln (Hotels bis zum nächsten Import), wäre jede Kachel leer: dann Overpass
  if (base && (!poiKinds || poiKinds.has(kind))) {
    try {
      return finish(kind, await fromTiles(base, kind, line, signal, scale), limit);
    } catch (e) {
      if (signal?.aborted) throw e;
      // Kacheln gestört: wie früher über Overpass
    }
  }
  return finish(kind, await fromOverpass(kind, line, signal, scale), limit);
}
