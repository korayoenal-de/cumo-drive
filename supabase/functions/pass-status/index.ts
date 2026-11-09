// Passstatus aus TomTom Sperrmeldungen, für alle Nutzer zwischengespeichert in public.pass_status.
// Läuft per Zeitplan (pg_cron, alle 4 Stunden) und fragt TomTom höchstens einmal am Tag ab (9.11.: das
// freie Kontingent von 2.500 Abfragen im Monat war mit 124 Kacheln alle 4 Stunden nach drei Tagen weg).
// Logik gleich wie app/src/lib/pass-status.ts; passes.json kommt per `npm run sync:functions`.
import { createClient } from 'npm:@supabase/supabase-js@2';
import passes from './passes.json' with { type: 'json' };

type Pass = { id: string; name: string; names: string[]; lat: number; lon: number };
type LatLon = [number, number];
type Incident = {
  geometry: { type: string; coordinates: number[][] | number[] };
  properties: { iconCategory: number; startTime?: string; endTime?: string | null; from?: string; to?: string; length?: number; events?: { description: string }[] };
};

const FIELDS = '{incidents{type,geometry{type,coordinates},properties{iconCategory,events{description},startTime,endTime,from,to,length}}}';
const MIN_AGE_MIN = 20 * 60;

/** 1 Grad Kacheln (etwa 8.500 km², TomTom erlaubt 10.000): 50 Abfragen je Lauf statt 124 */
function tiles(list: Pass[], size = 1): [number, number, number, number][] {
  const keys = new Set(list.map((p) => `${Math.floor(p.lon / size)},${Math.floor(p.lat / size)}`));
  return [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return [x * size, y * size, (x + 1) * size, (y + 1) * size];
  });
}

async function incidents(key: string, bbox: number[]): Promise<Incident[]> {
  const q = new URLSearchParams({ key, bbox: bbox.map((v) => v.toFixed(4)).join(','), fields: FIELDS, language: 'de-DE', categoryFilter: '8', timeValidityFilter: 'present' });
  const r = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?${q}`);
  if (!r.ok) throw new Error(`TomTom ${r.status}`);
  return ((await r.json()) as { incidents?: Incident[] }).incidents ?? [];
}

function lineOf(i: Incident): LatLon[] {
  const c = i.geometry.coordinates;
  if (i.geometry.type === 'Point') return [[(c as number[])[1], (c as number[])[0]]];
  return (c as number[][]).map(([lon, lat]) => [lat, lon]);
}

function distTo(p: LatLon, line: LatLon[]): number {
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);
  const ky = 110540;
  if (line.length === 1) return Math.hypot((line[0][1] - p[1]) * kx, (line[0][0] - p[0]) * ky);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][1] - p[1]) * kx, ay = (line[i - 1][0] - p[0]) * ky;
    const bx = (line[i][1] - p[1]) * kx, by = (line[i][0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

function namesPass(i: Incident, p: Pass): boolean {
  const ends = [i.properties.from, i.properties.to].filter(Boolean).map((x) => norm(x!));
  return [p.name, ...p.names].map(norm).filter((n) => n.length >= 5).some((n) => ends.some((e) => e.includes(n)));
}

function match(list: Pass[], inc: Incident[], now: string) {
  const closures = inc.filter((i) => i.properties.iconCategory === 8).map((i) => ({ i, line: lineOf(i) }));
  return list.map((p) => {
    const pt: LatLon = [p.lat, p.lon];
    const hits = closures.filter((c) => {
      if ((c.i.properties.length ?? 0) < 500) return false;
      const d = distTo(pt, c.line);
      return d <= 600 || (d <= 8000 && namesPass(c.i, p));
    });
    if (!hits.length) return { pass_id: p.id, state: 'offen', until: null, since: null, info: null, checked_at: now };
    const ends = hits.map((h) => h.i.properties.endTime).filter((e): e is string => !!e).sort();
    const starts = hits.map((h) => h.i.properties.startTime).filter((e): e is string => !!e).sort();
    return {
      pass_id: p.id,
      state: 'gesperrt',
      until: ends.at(-1) ?? null,
      since: starts[0] ?? null,
      info: hits[0].i.properties.events?.map((e) => e.description).join(', ') ?? 'Gesperrt',
      checked_at: now,
    };
  });
}

Deno.serve(async (req) => {
  const key = Deno.env.get('TOMTOM_KEY');
  if (!key) return Response.json({ error: 'TOMTOM_KEY fehlt (Edge Function Secrets)' }, { status: 500 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const force = new URL(req.url).searchParams.has('force');
  const { data: last } = await db.from('pass_status').select('checked_at').order('checked_at', { ascending: false }).limit(1).maybeSingle();
  if (!force && last && Date.now() - new Date(last.checked_at).getTime() < MIN_AGE_MIN * 60000) {
    return Response.json({ skipped: true, checked_at: last.checked_at });
  }

  const list = passes as Pass[];
  const all: Incident[] = [];
  for (const t of tiles(list)) {
    all.push(...(await incidents(key, t)));
    await new Promise((r) => setTimeout(r, 200));
  }
  const rows = match(list, all, new Date().toISOString());
  const { error } = await db.from('pass_status').upsert(rows, { onConflict: 'pass_id' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ updated: rows.length, closed: rows.filter((r) => r.state === 'gesperrt').length });
});
