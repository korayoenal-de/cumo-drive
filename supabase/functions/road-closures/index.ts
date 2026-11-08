// Aktuelle Vollsperrungen entlang einer Route aus TomTom Verkehrsmeldungen (Koray 8.11.2026, Testfahrt:
// Apple kannte eine Sperrung bei Hockenheim, wir nicht). Die App schickt die Kacheln (0,5 Grad Raster),
// durch die ihre Route läuft; je Kachel wird TomTom höchstens alle 10 Minuten gefragt (Speicher je Instanz).
// Antwort: nur Sperrungen als Linie (lat, lon), ohne Daten des Fahrers.
type Incident = {
  properties: { id?: string; iconCategory: number; from?: string; to?: string; events?: { description: string }[]; roadNumbers?: string[] };
  geometry: { type: string; coordinates: number[][] | number[] };
};
type Closure = { id: string; line: [number, number][]; from?: string; to?: string; text?: string; road?: string };

const SIZE = 0.5;
const MAX_TILES = 30;
const TTL_MS = 10 * 60 * 1000;
const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,events{description},from,to,roadNumbers}}}';
const cache = new Map<string, { at: number; items: Closure[] }>();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function tile(key: string, x: number, y: number): Promise<Closure[]> {
  const hit = cache.get(`${x},${y}`);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const bbox = [x * SIZE, y * SIZE, (x + 1) * SIZE, (y + 1) * SIZE].map((v) => v.toFixed(4)).join(',');
  const q = new URLSearchParams({ key, bbox, fields: FIELDS, language: 'de-DE', categoryFilter: '8', timeValidityFilter: 'present' });
  const r = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?${q}`);
  if (!r.ok) throw new Error(`TomTom ${r.status}`);
  const list = ((await r.json()) as { incidents?: Incident[] }).incidents ?? [];
  const items: Closure[] = [];
  for (const i of list) {
    if (i.geometry.type !== 'LineString') continue;
    const line = (i.geometry.coordinates as number[][]).map(([lon, lat]) => [lat, lon] as [number, number]);
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
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('TOMTOM_KEY');
  if (!key) return Response.json({ error: 'TOMTOM_KEY fehlt' }, { status: 500, headers: cors });
  let tiles: [number, number][] = [];
  try {
    const body = (await req.json()) as { tiles?: unknown };
    if (Array.isArray(body.tiles)) {
      tiles = body.tiles
        .filter((t): t is [number, number] => Array.isArray(t) && t.length === 2 && t.every((v) => Number.isInteger(v) && Math.abs(v) < 400))
        .slice(0, MAX_TILES);
    }
  } catch {
    return Response.json({ error: 'Anfrage ungültig' }, { status: 400, headers: cors });
  }
  const seen = new Set<string>();
  const out: Closure[] = [];
  const failed: string[] = [];
  await Promise.all(
    tiles.map(async ([x, y]) => {
      try {
        for (const c of await tile(key, x, y)) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          out.push(c);
        }
      } catch {
        failed.push(`${x},${y}`);
      }
    }),
  );
  return Response.json({ closures: out, failed: failed.length }, { headers: cors });
});
