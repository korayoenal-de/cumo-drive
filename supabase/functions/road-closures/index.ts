// Aktuelle Vollsperrungen entlang einer Route aus TomTom Verkehrsmeldungen (Koray 8.11.2026, Testfahrt:
// Apple kannte eine Sperrung bei Hockenheim, wir nicht). Die App schickt die Kacheln (0,5 Grad Raster),
// durch die ihre Route läuft; je Kachel wird TomTom höchstens alle 10 Minuten gefragt (Speicher je Instanz).
// Antwort: nur Sperrungen als Linie (lat, lon), ohne Daten des Fahrers.
// Seit 10.11.: TomTom Antworten liegen 30 Minuten in der Tabelle closure_tiles (für alle Instanzen, auch nach
// einem Kaltstart), und die Antwort enthält nur Sperrungen in den angefragten Kacheln, mit gerundeten und
// ausgedünnten Linien (vorher bis zu 3 MB je Planung aufs Handy).
type Incident = {
  properties: { id?: string; iconCategory: number; from?: string; to?: string; events?: { description: string }[]; roadNumbers?: string[] };
  geometry: { type: string; coordinates: number[][] | number[] };
};
type Closure = { id: string; line: [number, number][]; from?: string; to?: string; text?: string; road?: string };

/** Die App schickt 0,5 Grad Kacheln; gefragt wird je 1 Grad Kachel (etwa 8.500 km², TomTom erlaubt 10.000),
 *  das sind ein Viertel der Abfragen. Merkzeit 2 Stunden, Monatskontingent in tomtom_usage (9.11. und 10.11.). */
const APP_SIZE = 0.5;
const SIZE = 1;
const MAX_TILES = 30;
// 2 Stunden (Koray 10.11.: TomTom Kosten, Kreditkarte hinterlegt); Vollsperrungen ändern sich selten schneller
const TTL_MS = 2 * 60 * 60 * 1000;
const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,events{description},from,to,roadNumbers}}}';
const cache = new Map<string, { at: number; items: Closure[] }>();
/** gleichzeitige Abfragen derselben Kachel teilen sich einen TomTom Aufruf */
const pending = new Map<string, Promise<Closure[]>>();

const DB_URL = Deno.env.get('SUPABASE_URL');
const DB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const dbHeaders = () => ({ apikey: DB_KEY!, Authorization: `Bearer ${DB_KEY}`, 'Content-Type': 'application/json' });

/** Frische Kacheln aus der Tabelle in den Speicher der Instanz holen (ein Aufruf für alle fehlenden) */
async function loadStored(keys: string[]): Promise<void> {
  if (!DB_URL || !DB_KEY || !keys.length) return;
  try {
    const since = new Date(Date.now() - TTL_MS).toISOString();
    const list = keys.map((k) => `"${k}"`).join(',');
    const r = await fetch(`${DB_URL}/rest/v1/closure_tiles?select=key,fetched_at,items&key=in.(${encodeURIComponent(list)})&fetched_at=gte.${encodeURIComponent(since)}`, { headers: dbHeaders() });
    if (!r.ok) return;
    for (const row of (await r.json()) as { key: string; fetched_at: string; items: Closure[] }[]) {
      cache.set(row.key, { at: Date.parse(row.fetched_at), items: Array.isArray(row.items) ? row.items : [] });
    }
  } catch {
    // ohne Tabelle läuft es wie bisher nur mit dem Speicher der Instanz
  }
}

function store(key: string, items: Closure[]): void {
  if (!DB_URL || !DB_KEY) return;
  const job = fetch(`${DB_URL}/rest/v1/closure_tiles`, {
    method: 'POST',
    headers: { ...dbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, fetched_at: new Date().toISOString(), items }),
  })
    .then((r) => r.body?.cancel())
    .catch(() => undefined);
  // Schreiben darf die Antwort überleben, sonst bricht die Laufzeit es nach dem Senden ab
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(job);
}

/** Linie auf 5 Stellen runden und Punkte dichter als etwa 12 m weglassen (Anfang und Ende bleiben) */
function slim(line: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < line.length; i++) {
    const p: [number, number] = [Math.round(line[i][0] * 1e5) / 1e5, Math.round(line[i][1] * 1e5) / 1e5];
    const last = out[out.length - 1];
    if (last && i < line.length - 1 && Math.abs(last[0] - p[0]) < 0.00011 && Math.abs(last[1] - p[1]) < 0.00016) continue;
    out.push(p);
  }
  return out;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function tile(key: string, x: number, y: number): Promise<Closure[]> {
  const k = `${x},${y}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.items);
  let job = pending.get(k);
  if (!job) {
    job = fetchTile(key, x, y).finally(() => pending.delete(k));
    pending.set(k, job);
  }
  return job;
}

/** Eine TomTom Abfrage aus dem Monatskontingent nehmen (Tabelle tomtom_usage); ohne Datenbank immer erlaubt */
async function take(): Promise<boolean> {
  if (!DB_URL || !DB_KEY) return true;
  try {
    const r = await fetch(`${DB_URL}/rest/v1/rpc/tomtom_take`, { method: 'POST', headers: dbHeaders(), body: JSON.stringify({ n: 1 }) });
    if (!r.ok) return true; // Funktion fehlt noch (Migration läuft nach): nicht blockieren
    return (await r.json()) === true;
  } catch {
    return true;
  }
}

/** Letzter bekannter Stand einer Kachel, egal wie alt (wenn das Kontingent erschöpft ist) */
async function stale(k: string): Promise<Closure[]> {
  if (!DB_URL || !DB_KEY) return [];
  try {
    const r = await fetch(`${DB_URL}/rest/v1/closure_tiles?select=items&key=eq.${encodeURIComponent(k)}`, { headers: dbHeaders() });
    const rows = r.ok ? ((await r.json()) as { items: Closure[] }[]) : [];
    return Array.isArray(rows[0]?.items) ? rows[0].items : [];
  } catch {
    return [];
  }
}

async function fetchTile(key: string, x: number, y: number): Promise<Closure[]> {
  if (!(await take())) {
    const old = await stale(`${x},${y}`);
    // kurz im Speicher halten, damit nicht jede Anfrage erneut das Kontingent prüft
    cache.set(`${x},${y}`, { at: Date.now() - TTL_MS + 10 * 60 * 1000, items: old });
    return old;
  }
  const bbox = [x * SIZE, y * SIZE, (x + 1) * SIZE, (y + 1) * SIZE].map((v) => v.toFixed(4)).join(',');
  const q = new URLSearchParams({ key, bbox, fields: FIELDS, language: 'de-DE', categoryFilter: '8', timeValidityFilter: 'present' });
  const r = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?${q}`);
  if (!r.ok) throw new Error(`TomTom ${r.status} ${(await r.text()).slice(0, 160)}`);
  const list = ((await r.json()) as { incidents?: Incident[] }).incidents ?? [];
  const items: Closure[] = [];
  for (const i of list) {
    if (i.geometry.type !== 'LineString') continue;
    const line = slim((i.geometry.coordinates as number[][]).map(([lon, lat]) => [lat, lon] as [number, number]));
    if (line.length < 2) continue;
    items.push({
      id: i.properties.id ?? `${line[0][0].toFixed(5)},${line[0][1].toFixed(5)}`,
      line,
      from: i.properties.from,
      to: i.properties.to,
      text: i.properties.events?.[0]?.description,
      road: i.properties.roadNumbers?.[0],
    });
  }
  cache.set(`${x},${y}`, { at: Date.now(), items });
  store(`${x},${y}`, items);
  return items;
}

/** Liegt die Sperrung (ihr Rahmen) in einer der angefragten 0,5 Grad Kacheln? */
function inTiles(c: Closure, wanted: Set<string>): boolean {
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (const [la, lo] of c.line) {
    if (la < la0) la0 = la;
    if (la > la1) la1 = la;
    if (lo < lo0) lo0 = lo;
    if (lo > lo1) lo1 = lo;
  }
  for (let x = Math.floor(lo0 / APP_SIZE); x <= Math.floor(lo1 / APP_SIZE); x++)
    for (let y = Math.floor(la0 / APP_SIZE); y <= Math.floor(la1 / APP_SIZE); y++) if (wanted.has(`${x},${y}`)) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('TOMTOM_KEY');
  if (!key) return Response.json({ error: 'TOMTOM_KEY fehlt' }, { status: 500, headers: cors });
  let tiles: [number, number][] = [];
  const wanted = new Set<string>();
  try {
    const body = (await req.json()) as { tiles?: unknown };
    if (Array.isArray(body.tiles)) {
      tiles = body.tiles
        .filter((t): t is [number, number] => Array.isArray(t) && t.length === 2 && t.every((v) => Number.isInteger(v) && Math.abs(v) < 400))
        .slice(0, MAX_TILES);
      // auf 1 Grad Kacheln zusammenfassen
      const big = new Map<string, [number, number]>();
      for (const [x, y] of tiles) {
        wanted.add(`${x},${y}`);
        const bx = Math.floor((x * APP_SIZE) / SIZE);
        const by = Math.floor((y * APP_SIZE) / SIZE);
        big.set(`${bx},${by}`, [bx, by]);
      }
      tiles = [...big.values()];
    }
  } catch {
    return Response.json({ error: 'Anfrage ungültig' }, { status: 400, headers: cors });
  }
  // was die Instanz nicht frisch im Speicher hat, zuerst aus der Tabelle holen, erst dann TomTom fragen
  const now = Date.now();
  await loadStored(tiles.map(([x, y]) => `${x},${y}`).filter((k) => !((cache.get(k)?.at ?? 0) > now - TTL_MS)));
  const seen = new Set<string>();
  const out: Closure[] = [];
  const failed: string[] = [];
  let why = '';
  await Promise.all(
    tiles.map(async ([x, y]) => {
      try {
        for (const c of await tile(key, x, y)) {
          if (seen.has(c.id) || !inTiles(c, wanted)) continue;
          seen.add(c.id);
          out.push(c);
        }
      } catch (e) {
        failed.push(`${x},${y}`);
        why = String((e as Error).message).replace(key, '***');
      }
    }),
  );
  return Response.json({ closures: out, failed: failed.length, ...(why ? { why } : {}) }, { headers: cors });
});
