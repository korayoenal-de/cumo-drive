// Kuratierte Strecken, Pässe und Einkehr Empfehlungen für den Web Planer (Koray 16.11.: Schutz vor Kopierern).
// Nur mit Anmeldung. Die Daten standen vorher im öffentlichen JavaScript der Webseite.
//
// Seit 17.11. (Sicherheitskonzept Maßnahme 5) kachelweise: der Planer fragt nur die Kacheln (0,5 Grad) an, in denen
// er gerade plant, und jedes Konto bekommt am Tag höchstens 60 neue Kacheln mit Daten (road_data_take). Die ganze
// Datenbank abzuziehen dauert so mehrere Tage und fällt auf. Pässe kommen weiter vollständig, sie stehen auf der Karte.
//
// Jede Antwort trägt einen unsichtbaren Fingerabdruck des Kontos: an etwa jeder fünfzigsten Strecke liegt ein
// Stützpunkt um wenige Meter versetzt, je Konto anders und immer gleich, auch in Teilstücken. Taucht die Datenbank
// woanders auf, lässt sich damit zeigen, aus welchem Konto sie stammt (mark() mit der Konto ID nachrechnen).
// Die Dateien im Ordner data/ sind Kopien aus app/src/data (npm run sync-road-data im Ordner app).
import { createClient } from 'npm:@supabase/supabase-js@2';

import curated from './data/curated-roads.json' with { type: 'json' };
import passes from './data/passes.json' with { type: 'json' };
import stops from './data/recommended-stops.json' with { type: 'json' };

type Road = { id: string; tier: string; line: [number, number][] } & Record<string, unknown>;
type Stop = { id: string; p: [number, number] } & Record<string, unknown>;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });

/** Kachel wie im Web Planer (road-data.web.ts): halbe Grad */
const tileOf = (p: [number, number]) => `${Math.floor(p[0] * 2)}_${Math.floor(p[1] * 2)}`;

const ROADS = curated as unknown as Road[];
const STOPS = (stops as unknown as { stops: Stop[] }).stops;
const roadsByTile = new Map<string, number[]>();
ROADS.forEach((r, i) => {
  for (const t of new Set(r.line.map(tileOf))) roadsByTile.set(t, [...(roadsByTile.get(t) ?? []), i]);
});
const stopsByTile = new Map<string, number[]>();
STOPS.forEach((s, i) => stopsByTile.set(tileOf(s.p), [...(stopsByTile.get(tileOf(s.p)) ?? []), i]));

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Fingerabdruck je Strecke: versetzt oder nicht, welcher Punkt, welche Richtung (3 bis 7 m) */
export async function mark(userId: string, road: Road): Promise<Road> {
  const h = await digest(`cumo-road-data:${userId}:${road.id}`);
  const n = road.line.length;
  if (h[0] >= 5 || n < 3) return road;
  const point = 1 + (((h[1] << 8) | h[2]) % (n - 2));
  const angle = (h[3] / 256) * 2 * Math.PI;
  const m = 3 + (h[4] % 5);
  const [lat, lon] = road.line[point];
  const line = road.line.slice();
  line[point] = [
    +(lat + (m * Math.cos(angle)) / 110540).toFixed(5),
    +(lon + (m * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))).toFixed(5),
  ];
  return { ...road, line };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await db.auth.getUser();
  if (!u.user) return json({ error: 'Bitte anmelden.' }, 401);

  const body = (await req.json().catch(() => ({}))) as { tiles?: unknown };
  const asked = Array.isArray(body.tiles)
    ? [...new Set(body.tiles.filter((t): t is string => typeof t === 'string' && /^-?\d{1,3}_-?\d{1,3}$/.test(t)))].slice(0, 400)
    : [];
  // nur Kacheln mit Daten zählen gegen das Kontingent
  const withData = asked.filter((t) => roadsByTile.has(t) || stopsByTile.has(t));
  let granted: string[] = [];
  if (withData.length) {
    const { data, error } = await db.rpc('road_data_take', { tiles: withData });
    if (error) return json({ error: 'Strecken gerade nicht verfügbar.' }, 503);
    granted = (data as string[] | null) ?? [];
  }
  const roadIdx = new Set<number>();
  const stopIdx = new Set<number>();
  for (const t of granted) {
    for (const i of roadsByTile.get(t) ?? []) roadIdx.add(i);
    for (const i of stopsByTile.get(t) ?? []) stopIdx.add(i);
  }
  const roads = await Promise.all([...roadIdx].map((i) => mark(u.user!.id, ROADS[i])));
  const denied = withData.filter((t) => !granted.includes(t));
  console.log(JSON.stringify({ road_data: u.user.id, asked: asked.length, granted: granted.length, denied: denied.length }));
  return json(
    {
      curated: roads,
      passes,
      stops: [...stopIdx].map((i) => STOPS[i]),
      // Kacheln ohne Daten gelten als geladen, damit der Planer nicht erneut fragt
      tiles: [...granted, ...asked.filter((t) => !withData.includes(t))],
      denied,
    },
    200,
    { 'Cache-Control': 'private, max-age=3600' },
  );
});
