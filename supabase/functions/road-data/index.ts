// Kuratierte Strecken, Pässe und Einkehr Empfehlungen für den Web Planer (Koray 16.11.: Schutz vor Kopierern).
// Nur mit Anmeldung. Die Daten standen vorher im öffentlichen JavaScript der Webseite.
// Jede Antwort trägt einen unsichtbaren Fingerabdruck des Kontos: an wenigen Strecken liegt ein Stützpunkt
// um wenige Meter versetzt, je Konto anders und immer gleich. Taucht die Datenbank woanders auf, lässt sich
// damit zeigen, aus welchem Konto sie stammt (fingerprint() mit der Konto ID nachrechnen).
// Die Dateien im Ordner data/ sind Kopien aus app/src/data (npm run sync-road-data im Ordner app).
import { createClient } from 'npm:@supabase/supabase-js@2';

import curated from './data/curated-roads.json' with { type: 'json' };
import passes from './data/passes.json' with { type: 'json' };
import stops from './data/recommended-stops.json' with { type: 'json' };

type Road = { id: string; tier: string; line: [number, number][] } & Record<string, unknown>;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });

/** So viele Strecken bekommen je Konto einen versetzten Stützpunkt */
const MARKS = 6;

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Fingerabdruck: welche Strecken, welcher Punkt, welche Richtung (3 bis 7 m) */
export async function fingerprint(userId: string, roads: Road[]) {
  const h = await digest(`cumo-road-data:${userId}`);
  const out: { road: number; point: number; dLat: number; dLon: number }[] = [];
  for (let i = 0; i < MARKS; i++) {
    const road = ((h[i * 4] << 8) | h[i * 4 + 1]) % roads.length;
    const n = roads[road].line.length;
    if (n < 3) continue;
    const point = 1 + (h[i * 4 + 2] % (n - 2));
    const angle = (h[i * 4 + 3] / 256) * 2 * Math.PI;
    const m = 3 + (h[(i * 4 + 5) % 32] % 5);
    const lat = roads[road].line[point][0];
    out.push({ road, point, dLat: (m * Math.cos(angle)) / 110540, dLon: (m * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)) });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Nur POST' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await db.auth.getUser();
  if (!u.user) return json({ error: 'Bitte anmelden.' }, 401);

  const roads = curated as unknown as Road[];
  const marks = await fingerprint(u.user.id, roads);
  const copy = roads.slice();
  for (const k of marks) {
    const r = copy[k.road];
    const line = r.line.slice();
    const p = line[k.point];
    line[k.point] = [+(p[0] + k.dLat).toFixed(5), +(p[1] + k.dLon).toFixed(5)];
    copy[k.road] = { ...r, line };
  }
  console.log(JSON.stringify({ road_data: u.user.id }));
  return json(
    { curated: copy, passes, stops: (stops as unknown as { stops: unknown[] }).stops },
    200,
    { 'Cache-Control': 'private, max-age=3600' },
  );
});
