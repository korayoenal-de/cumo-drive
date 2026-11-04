/**
 * Eigener Routing Server (GraphHopper auf Korays Mac, Ordner routing/server).
 *
 * Mit Sportwagen Profil: Kurven bevorzugt, Feldwege, Schotter, Pfade und Engstellen unter
 * 2,5 m praktisch ausgeschlossen, Autobahn abgewertet. Der Etappen Check läuft hier ohne
 * fremden Dienst direkt auf den Straßendaten, die der Server mitliefert.
 *
 * Adresse: EXPO_PUBLIC_ROUTING_URL, sonst automatisch derselbe Rechner wie der Expo Server
 * (Port 8989). Auf dem iPhone ist das die WLAN Adresse des Macs.
 */
import Constants from 'expo-constants';

import type { PlannedTour } from './plan';
import { countCurves } from './stats';
import { haversine, type CheckClass, type LatLon, type Profile, type Tour, type Warning } from './tour';
import type { Avoid } from './valhalla';

export function routingServerUrl(): string | null {
  const env = process.env.EXPO_PUBLIC_ROUTING_URL;
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && typeof window.location?.hostname === 'string' && window.location.hostname) {
    // Nur im lokalen Netz suchen (localhost oder private Adresse). Auf drive.rallycumo.de
    // gibt es keinen eigenen Server, dort planen die öffentlichen Dienste.
    const h = window.location.hostname;
    const local = h === 'localhost' || h === '127.0.0.1' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
    return local ? `http://${h}:8989` : null;
  }
  const hostUri = Constants.expoConfig?.hostUri; // zum Beispiel 192.168.178.20:8081
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:8989` : null;
}

let availability: { at: number; ok: boolean } | null = null;

/** Ist der eigene Server erreichbar? Ergebnis wird 30 Sekunden gemerkt. */
export async function cumoAvailable(): Promise<boolean> {
  const url = routingServerUrl();
  if (!url) return false;
  if (availability && Date.now() - availability.at < 30000) return availability.ok;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  let ok = false;
  try {
    const res = await fetch(`${url}/info`, { signal: ctrl.signal });
    ok = res.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(t);
  }
  availability = { at: Date.now(), ok };
  return ok;
}

type Detail = [number, number, string | number | boolean | null];
type GhPath = {
  distance: number;
  time: number;
  points: { coordinates: [number, number][] };
  details: Record<string, Detail[]>;
};

const DETAILS = ['road_class', 'surface', 'track_type', 'max_width', 'street_name', 'street_ref', 'curvature'];

/** Kleine Quadrate (etwa 120 m) um gesperrte Stellen, für den Ausschluss per custom_model. */
function exclusionModel(points: LatLon[]) {
  if (!points.length) return {};
  const d = 0.0006;
  const features = points.slice(0, 40).map(([la, lo], i) => ({
    type: 'Feature',
    id: `ex${i}`,
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[lo - d, la - d], [lo + d, la - d], [lo + d, la + d], [lo - d, la + d], [lo - d, la - d]]],
    },
  }));
  return {
    areas: { type: 'FeatureCollection', features },
    priority: [{ if: features.map((f) => `in_${f.id}`).join(' || '), multiply_by: '0' }],
  };
}

/**
 * Feinabstimmung je Profil zur Anfrage dazu (ohne den Graphen neu zu bauen).
 * Kurvig und Pässe: an Rundtouren ab Heppenheim getestet, 37 bis 53 Kurven pro 100 km
 * statt 24 bis 32 mit dem Grundprofil, weiter ohne unbefestigte Kilometer.
 */
function profileModel(profile: Profile): { if?: string; else_if?: string; multiply_by: string }[] {
  if (profile === 'kurvig' || profile === 'paesse') {
    return [
      { if: 'road_class == PRIMARY', multiply_by: '0.35' },
      { if: 'road_class == SECONDARY', multiply_by: '0.7' },
      { if: 'road_class == RESIDENTIAL', multiply_by: '0.5' },
      { if: 'curvature > 0.95', multiply_by: '0.3' },
      { else_if: 'curvature > 0.85', multiply_by: '0.6' },
    ];
  }
  if (profile === 'entspannt') return [{ if: 'road_class == RESIDENTIAL', multiply_by: '0.6' }];
  return [];
}

function avoidModel(avoid: Avoid) {
  const priority: { if: string; multiply_by: string }[] = [];
  if (avoid.tolls) priority.push({ if: 'toll != NO', multiply_by: '0.05' });
  if (avoid.ferries) priority.push({ if: 'road_environment == FERRY', multiply_by: '0' });
  return priority;
}

async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<GhPath> {
  const url = routingServerUrl();
  if (!url) throw new Error('Kein eigener Routing Server eingestellt.');
  const res = await fetch(`${url}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points_encoded: false, instructions: false, details: DETAILS, ...body }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; paths?: GhPath[] };
  if (!res.ok || !data.paths?.length) throw new Error(`Eigener Routing Server: ${data.message ?? `Fehler ${res.status}`}`);
  return data.paths[0];
}

function model(avoid: Avoid, exclude: LatLon[], profile: Profile) {
  const ex = exclusionModel(exclude) as { areas?: unknown; priority?: { if: string; multiply_by: string }[] };
  const priority = [...profileModel(profile), ...avoidModel(avoid), ...(ex.priority ?? [])];
  if (!priority.length) return undefined;
  return { ...(ex.areas ? { areas: ex.areas } : {}), priority, ...(profile === 'kurvig' || profile === 'paesse' ? { distance_influence: 5 } : {}) };
}

/* ---------- Etappen Check auf den Server Details ---------- */

const NON_CAR = new Set(['track', 'path', 'footway', 'cycleway', 'bridleway', 'steps', 'pedestrian']);
const UNPAVED = new Set(['unpaved', 'compacted', 'fine_gravel', 'gravel', 'ground', 'dirt', 'grass', 'sand']);
const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);

type Seg = { a: number; b: number; km: number; c: CheckClass; why: string[]; minor: boolean; name: string };

/** Wert eines Details an einem Punktindex. */
function valueAt(details: Detail[] | undefined, i: number) {
  if (!details) return null;
  for (const [a, b, v] of details) if (i >= a && i < b) return v;
  return null;
}

export function checkFromDetails(path: GhPath): Pick<Tour, 'linie' | 'warnungen' | 'km_je_klasse'> {
  const shape: LatLon[] = path.points.coordinates.map(([lon, lat]) => [lat, lon]);
  // Grenzen aller Details sammeln, dazwischen ist jedes Merkmal konstant
  const cuts = new Set<number>([0, shape.length - 1]);
  for (const key of DETAILS) for (const [a, b] of path.details[key] ?? []) {
    cuts.add(a);
    cuts.add(b);
  }
  const idx = [...cuts].sort((x, y) => x - y);
  const segs: Seg[] = [];
  for (let k = 0; k < idx.length - 1; k++) {
    const a = idx[k];
    const b = idx[k + 1];
    if (b <= a) continue;
    let km = 0;
    for (let i = a + 1; i <= b; i++) km += haversine(shape[i - 1], shape[i]) / 1000;
    const rc = String(valueAt(path.details.road_class, a) ?? '').toLowerCase();
    const sf = String(valueAt(path.details.surface, a) ?? '').toLowerCase();
    const tt = String(valueAt(path.details.track_type, a) ?? '').toLowerCase();
    const mw = valueAt(path.details.max_width, a);
    const ref = String(valueAt(path.details.street_ref, a) ?? '');
    const name = String(valueAt(path.details.street_name, a) ?? '') || ref;
    const why: string[] = [];
    if (NON_CAR.has(rc)) why.push(rc === 'track' ? 'Wirtschafts oder Waldweg' : `als ${rc} eingetragen`);
    if (UNPAVED.has(sf)) why.push(`Belag ${sf}`);
    if (tt && tt !== 'missing' && tt !== 'grade1') why.push(`Wegklasse ${tt}`);
    let c: CheckClass = why.length ? 'raus' : 'ok';
    if (c === 'ok') {
      if (typeof mw === 'number' && mw < 2.5) why.push(`Höchstbreite ${String(mw).replace('.', ',')} m`);
      if (sf === 'cobblestone' || sf === 'paving_stones') why.push('Pflaster');
      if (why.length) c = 'pruefen';
    }
    segs.push({ a, b, km, c, why, minor: !MAJOR.has(rc) && !ref, name });
  }
  // Abschnittsregel: Nebenstraßen ohne Nummer mit mindestens zwei Sperrsignalen komplett sperren
  let i = 0;
  while (i < segs.length) {
    if (!segs[i].minor) {
      i++;
      continue;
    }
    let j = i;
    let hits = 0;
    let km = 0;
    while (j < segs.length && segs[j].minor) {
      if (segs[j].c === 'raus' || segs[j].why.some((w) => w.startsWith('Höchstbreite'))) hits++;
      km += segs[j].km;
      j++;
    }
    if (hits >= 2) {
      const reason = `Teil eines ${km.toFixed(1).replace('.', ',')} km langen Nebenstraßen Abschnitts mit ${hits} Sperrsignalen`;
      for (let k = i; k < j; k++) if (segs[k].c !== 'raus') segs[k] = { ...segs[k], c: 'raus', why: [reason, ...segs[k].why] };
    }
    i = j;
  }
  const linie: Tour['linie'] = [];
  const warnungen: Warning[] = [];
  const kmBy: Record<CheckClass, number> = { ok: 0, pruefen: 0, raus: 0 };
  let km = 0;
  let open: Warning | null = null;
  for (const s of segs) {
    kmBy[s.c] += s.km;
    const pts = shape.slice(s.a, s.b + 1);
    const last = linie[linie.length - 1];
    if (last && last.c === s.c) last.p.push(...pts.slice(1));
    else linie.push({ c: s.c, p: pts });
    if (s.c !== 'ok') {
      if (open && open.klasse === s.c && Math.abs(open.start_km + open.laenge_km - km) < 0.3) {
        open.laenge_km = +(km + s.km - open.start_km).toFixed(2);
        for (const w of s.why) if (!open.gruende.includes(w)) open.gruende.push(w);
      } else {
        open = { klasse: s.c, start_km: +km.toFixed(1), laenge_km: +s.km.toFixed(2), name: s.name, ort: '', gruende: [...s.why], mitte: pts[Math.floor(pts.length / 2)] };
        warnungen.push(open);
      }
    }
    km += s.km;
  }
  return {
    linie,
    warnungen: warnungen.filter((w) => w.klasse === 'raus' || w.laenge_km >= 0.3),
    km_je_klasse: { ok: +kmBy.ok.toFixed(1), pruefen: +kmBy.pruefen.toFixed(1), raus: +kmBy.raus.toFixed(1) },
  };
}

function toTour(name: string, wegpunkte: LatLon[], p: GhPath): PlannedTour & { curves: number } {
  const chk = checkFromDetails(p);
  const shape: LatLon[] = p.points.coordinates.map(([lon, lat]) => [lat, lon]);
  return {
    name, wegpunkte, ...chk, laenge_km: +(p.distance / 1000).toFixed(1), minutes: p.time / 60000, geprueft: true, fixes: 0,
    curves: countCurves(shape),
  };
}

/** Route durch Punkte, geprüft; gesperrte Stellen werden bis zu zweimal ausgeschlossen. */
export async function cumoPlan(
  name: string,
  points: LatLon[],
  profile: Profile,
  avoid: Avoid,
  signal?: AbortSignal,
): Promise<PlannedTour & { curves: number }> {
  let exclude: LatLon[] = [];
  let best: (PlannedTour & { curves: number }) | null = null;
  for (let round = 0; round < 3; round++) {
    const p = await post(
      {
        points: points.map(([la, lo]) => [lo, la]),
        profile: profile === 'schnell' ? 'auto' : 'sportwagen',
        ...(model(avoid, exclude, profile) ? { custom_model: model(avoid, exclude, profile) } : {}),
      },
      signal,
    );
    const t = { ...toTour(name, points, p), fixes: round };
    if (!best || (t.km_je_klasse?.raus ?? 0) < (best.km_je_klasse?.raus ?? Infinity)) best = t;
    if ((t.km_je_klasse?.raus ?? 0) === 0) break;
    const more: LatLon[] = [];
    for (const run of t.linie) if (run.c === 'raus') for (let k = 0; k < run.p.length; k += 8) more.push(run.p[k]);
    if (!more.length) break;
    exclude = [...exclude, ...more].slice(0, 40);
  }
  return best!;
}

/** Rundtour Varianten vom eigenen Server (lokal, ohne Kontingent). */
export async function cumoRoundTrips(
  name: string,
  start: LatLon,
  km: number,
  heading: number,
  profile: Profile,
  avoid: Avoid,
  count = 5,
  seed = 1,
  signal?: AbortSignal,
): Promise<(PlannedTour & { curves: number })[]> {
  const out: (PlannedTour & { curves: number })[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const p = await post(
        {
          points: [[start[1], start[0]]],
          profile: profile === 'schnell' ? 'auto' : 'sportwagen',
          algorithm: 'round_trip',
          // GraphHopper Rundtouren werden auf kurvigen Profilen etwa 30 % länger als angefragt
          'round_trip.distance': Math.round(km * 1000 * (profile === 'kurvig' || profile === 'paesse' ? 0.75 : 0.9)),
          'round_trip.seed': seed + i,
          heading: [heading],
          ...(model(avoid, [], profile) ? { custom_model: model(avoid, [], profile) } : {}),
        },
        signal,
      );
      out.push(toTour(name, [start, start], p));
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return out;
}
