/**
 * Aktuelle Vollsperrungen aus TomTom Verkehrsmeldungen (Koray 8.11.2026; Testfahrt: Apple kannte eine
 * Sperrung, wir schickten den Fahrer hinein). Die Edge Function road-closures fragt TomTom je 0,5 Grad
 * Kachel höchstens alle 10 Minuten. Hier: welche Kacheln eine Route berührt und wo sie gesperrte
 * Stücke trifft. Fällt der Dienst aus, plant und navigiert die App wie bisher.
 */
import { haversine, type LatLon } from './tour';

export type Closure = { id: string; line: LatLon[]; from?: string; to?: string; text?: string; road?: string };
export type ClosureHit = { closure: Closure; points: LatLon[]; firstIndex: number };

const SIZE = 0.5;
const MAX_TILES = 30;

function tilesOf(line: LatLon[]): [number, number][] {
  const keys = new Set<string>();
  let last: LatLon | null = null;
  for (const p of line) {
    if (last && haversine(last, p) < 1500) continue;
    keys.add(`${Math.floor(p[1] / SIZE)},${Math.floor(p[0] / SIZE)}`);
    last = p;
  }
  if (line.length) {
    const p = line[line.length - 1];
    keys.add(`${Math.floor(p[1] / SIZE)},${Math.floor(p[0] / SIZE)}`);
  }
  return [...keys].slice(0, MAX_TILES).map((k) => k.split(',').map(Number) as [number, number]);
}

/** Kacheln schon geholter Sperrungen, 30 Minuten wie auf dem Server: so wartet das Planen nicht zweimal */
const cache = new Map<string, { at: number; closures: Closure[] }>();
const FRESH = 30 * 60 * 1000;
const inflight = new Map<string, Promise<void>>();

async function fetchTiles(tiles: [number, number][], ms: number): Promise<void> {
  if (!tiles.length) return;
  const { supabase } = await import('./supabase');
  const call = supabase.functions.invoke('road-closures', { body: { tiles } });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  const r = await Promise.race([call, timeout]);
  if (!r || r.error) return;
  const data = r.data as { closures?: Closure[] } | null;
  const list = Array.isArray(data?.closures) ? data!.closures : [];
  for (const t of tiles) cache.set(t.join(','), { at: Date.now(), closures: list });
}

async function closuresFor(tiles: [number, number][], ms: number, signal?: AbortSignal): Promise<Closure[]> {
  const now = Date.now();
  const missing = tiles.filter((t) => {
    const c = cache.get(t.join(','));
    return !c || now - c.at > FRESH;
  });
  // Kacheln, die gerade schon geholt werden (Vorabruf beim Planen), abwarten statt neu fragen
  const waits = missing.map((t) => inflight.get(t.join(','))).filter((x): x is Promise<void> => !!x);
  const fresh = missing.filter((t) => !inflight.has(t.join(',')));
  if (fresh.length) {
    const job = fetchTiles(fresh, ms).catch(() => undefined);
    for (const t of fresh) inflight.set(t.join(','), job);
    void job.finally(() => fresh.forEach((t) => inflight.delete(t.join(','))));
    waits.push(job);
  }
  if (waits.length) {
    const abort = new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
    await Promise.race([Promise.all(waits), abort]);
  }
  const seen = new Set<string>();
  const out: Closure[] = [];
  for (const t of tiles) for (const c of cache.get(t.join(','))?.closures ?? []) if (!seen.has(c.id)) {
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** Sperrungen in den Kacheln der Route; leer, wenn der Dienst nicht antwortet */
export async function closuresNear(line: LatLon[], signal?: AbortSignal): Promise<Closure[]> {
  if (line.length < 2) return [];
  try {
    return await closuresFor(tilesOf(line), 6000, signal);
  } catch {
    return [];
  }
}

/**
 * Sperrungen entlang der Luftlinie schon beim Start des Planens holen, parallel zur Routenberechnung
 * (Koray 9.11.: das Laden dauerte zu lange). Danach findet closuresNear sie im Speicher.
 * Seit 10.11. nur noch die Kacheln, die die Route wahrscheinlich berührt: die Luftlinie mit einem Rand
 * (15 % der Etappe, 6 bis 20 km) statt immer alle acht Nachbarkacheln. Das waren bis zu neunmal so viele
 * Kacheln, entsprechend mehr TomTom Abfragen und eine Antwort von 1,7 MB für eine Route durch die Pfalz.
 */
export function prefetchClosures(points: LatLon[]): void {
  if (points.length < 2) return;
  const keys = new Set<string>();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const leg = haversine(a, b);
    const n = Math.max(1, Math.ceil(leg / 10000));
    const marginKm = Math.min(20, Math.max(6, (leg / 1000) * 0.15));
    const dLat = marginKm / 111;
    for (let k = 0; k <= n; k++) {
      const lat = a[0] + ((b[0] - a[0]) * k) / n;
      const lon = a[1] + ((b[1] - a[1]) * k) / n;
      const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      for (const [la, lo] of [[lat, lon], [lat + dLat, lon + dLon], [lat + dLat, lon - dLon], [lat - dLat, lon + dLon], [lat - dLat, lon - dLon]])
        keys.add(`${Math.floor(lo / SIZE)},${Math.floor(la / SIZE)}`);
    }
  }
  const tiles = [...keys].slice(0, MAX_TILES).map((k) => k.split(',').map(Number) as [number, number]);
  void closuresFor(tiles, 8000).catch(() => undefined);
}

function distToLine(p: LatLon, line: LatLon[]): number {
  const kx = 111320 * Math.cos((p[0] * Math.PI) / 180);
  const ky = 110540;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][1] - p[1]) * kx;
    const ay = (line[i - 1][0] - p[0]) * ky;
    const bx = (line[i][1] - p[1]) * kx;
    const by = (line[i][0] - p[0]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

function lengthM(line: LatLon[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += haversine(line[i - 1], line[i]);
  return m;
}

/**
 * Wo die Route über eine Sperrung führt: Punkte der Route höchstens 20 m neben der gesperrten Linie,
 * mindestens zwei hintereinander (bei sehr kurzen Sperrungen unter 150 m reicht einer).
 * Kreuzt die Route eine gesperrte Straße nur, liegen höchstens ein, zwei Punkte daneben.
 */
export function closuresOnRoute(route: LatLon[], closures: Closure[]): ClosureHit[] {
  const out: ClosureHit[] = [];
  for (const c of closures) {
    let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
    for (const [la, lo] of c.line) {
      lat0 = Math.min(lat0, la);
      lat1 = Math.max(lat1, la);
      lon0 = Math.min(lon0, lo);
      lon1 = Math.max(lon1, lo);
    }
    const pad = 0.0005;
    const short = lengthM(c.line) < 150;
    let run: LatLon[] = [];
    let first = -1;
    let along = 0;
    const flush = () => {
      if (run.length && (along >= 60 || (short && run.length >= 1))) out.push({ closure: c, points: run, firstIndex: first });
      run = [];
      along = 0;
    };
    for (let i = 0; i < route.length; i++) {
      const p = route[i];
      const inBox = p[0] >= lat0 - pad && p[0] <= lat1 + pad && p[1] >= lon0 - pad && p[1] <= lon1 + pad;
      if (inBox && distToLine(p, c.line) <= 20) {
        if (!run.length) first = i;
        else along += haversine(run[run.length - 1], p);
        run.push(p);
      } else if (run.length) {
        flush();
        if (out.length && out[out.length - 1].closure === c) break;
      }
    }
    flush();
  }
  return out.sort((a, b) => a.firstIndex - b.firstIndex);
}

/** Punkte zum Ausschließen beim Neuplanen, nicht direkt an den Wegpunkten */
export function closureExclude(hits: ClosureHit[], waypoints: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  for (const h of hits) {
    const mid = h.points[Math.floor(h.points.length / 2)];
    if (waypoints.some((w) => haversine(w, mid) < 300)) continue;
    out.push(mid);
  }
  return out.slice(0, 20);
}

/** Kurzer Text für Hinweise: "Gesperrt: B 39 zwischen X und Y" */
export function closureLabel(c: Closure): string {
  const where = c.from && c.to ? ` zwischen ${c.from} und ${c.to}` : c.from ? ` bei ${c.from}` : '';
  return `Gesperrt${c.road ? `: ${c.road}` : ''}${where}`;
}
