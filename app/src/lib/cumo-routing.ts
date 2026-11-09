/**
 * Eigener Routing Server (GraphHopper 11 auf Contabo, Konfiguration und Skripte in routing/server).
 *
 * Mit Sportwagen Profil: Kurven bevorzugt, Feldwege, Schotter, Pfade und Engstellen unter
 * 2,5 m praktisch ausgeschlossen, Autobahn abgewertet. Der Etappen Check läuft hier ohne
 * fremden Dienst direkt auf den Straßendaten, die der Server mitliefert.
 *
 * Adresse: EXPO_PUBLIC_ROUTING_URL, sonst der eigene Server (CUMO_ROUTING_URL); im Browser auf
 * localhost oder im lokalen Netz ein Server auf dem Rechner (Port 8989), zum Entwickeln.
 */

import type { PlannedTour } from './plan';
import { HIGHLIGHT_ROADS, PREFER_ROADS } from './highlight-roads';
import { countCurves } from './stats';
import { doubledStretch } from './doubled';
import { haversine, type CheckClass, type LatLon, type Profile, type Tour, type Warning } from './tour';
import type { Avoid } from './valhalla';

/** Eigener Routing Server (Contabo, GraphHopper mit Sportwagen Profil). Später unter routing.rallycumo.de. */
export const CUMO_ROUTING_URL = 'https://13-140-213-164.sslip.io';

export function routingServerUrl(): string | null {
  const env = process.env.EXPO_PUBLIC_ROUTING_URL;
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined' && typeof window.location?.hostname === 'string' && window.location.hostname) {
    // Entwicklung im lokalen Netz: Server auf dem Mac, sonst der eigene Server im Netz
    const h = window.location.hostname;
    const local = h === 'localhost' || h === '127.0.0.1' || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
    return local ? `http://${h}:8989` : CUMO_ROUTING_URL;
  }
  return CUMO_ROUTING_URL;
}

let availability: { at: number; ok: boolean } | null = null;
/** Profile, die der Server kennt (aus /info); kurvig und sehr_kurvig gibt es seit dem Neuaufbau mit festen Profilen */
let serverProfiles = new Set<string>();

/** Ist der eigene Server erreichbar? Ergebnis wird 30 Sekunden gemerkt. */
export async function cumoAvailable(): Promise<boolean> {
  const url = routingServerUrl();
  if (!url) return false;
  if (availability && Date.now() - availability.at < 30000) return availability.ok;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  let ok = false;
  try {
    const res = await fetch(`${url}/info`, { signal: ctrl.signal });
    ok = res.ok;
    if (ok) {
      const info = (await res.json().catch(() => null)) as { profiles?: { name: string }[] } | null;
      serverProfiles = new Set((info?.profiles ?? []).map((p) => p.name));
    }
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

/** Ab so vielen doppelt gefahrenen Kilometern wird neu gerechnet. */
const DOUBLE_MAX_KM = 2;
/** Wird false, sobald der Server pass_through ablehnt. */
let passThroughOk = true;

/**
 * Punkte, an denen Wenden erlaubt ist: Stopps abseits der Route (Café, Tankstelle in einer Seitenstraße).
 * Dort fährt man hin und auf demselben Weg zurück; mit pass_through suchte der Server sonst eine
 * Schleife durch das Wohngebiet (6.11., Rundtour Bensheim mit zwei Stopps).
 */
const turnAt = new Set<string>();
const pkey = (p: LatLon) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
export function allowTurnAt(p: LatLon) {
  turnAt.add(pkey(p));
}

const DETAILS = ['road_class', 'surface', 'track_type', 'max_width', 'street_name', 'street_ref', 'curvature'];

/** Kleine Quadrate (etwa 120 m) um gesperrte Stellen, für den Ausschluss per custom_model. */
function exclusionModel(points: LatLon[], penalize: LatLon[] = []) {
  if (!points.length && !penalize.length) return {};
  const d = 0.0006;
  const box = ([la, lo]: LatLon, id: string) => ({
    type: 'Feature',
    id,
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[lo - d, la - d], [lo + d, la - d], [lo + d, la + d], [lo - d, la + d], [lo - d, la - d]]],
    },
  });
  const ex = points.slice(0, 40).map((p, i) => box(p, `ex${i}`));
  // Schon befahrene Straße: deutlich teurer, aber nicht verboten (manchmal gibt es nur die eine)
  const dup = penalize.slice(0, 60).map((p, i) => box(p, `dup${i}`));
  const priority = [
    ...(ex.length ? [{ if: ex.map((f) => `in_${f.id}`).join(' || '), multiply_by: '0' }] : []),
    ...(dup.length ? [{ if: dup.map((f) => `in_${f.id}`).join(' || '), multiply_by: '0.25' }] : []),
  ];
  return { areas: { type: 'FeatureCollection', features: [...ex, ...dup] }, priority };
}

/**
 * Feinabstimmung je Profil zur Anfrage dazu (ohne den Graphen neu zu bauen).
 * Kurvig und Pässe: an Rundtouren ab Heppenheim getestet, 37 bis 53 Kurven pro 100 km
 * statt 24 bis 32 mit dem Grundprofil, weiter ohne unbefestigte Kilometer.
 */
/**
 * Mindestbreite pro Anfrage, damit der laufende Server ohne neuen Import greift:
 * unter 1,9 m passt kein Sportwagen, 2,5 bis 3 m ist einspurig, bis 4,5 m wird es eng.
 */
const WIDTH_MODEL = [
  { if: 'max_width < 1.9', multiply_by: '0' },
  { else_if: 'max_width >= 2.5 && max_width < 3', multiply_by: '0.1' },
  { else_if: 'max_width >= 3 && max_width < 4.5', multiply_by: '0.6' },
];

function profileModel(profile: Profile): { if?: string; else_if?: string; multiply_by: string }[] {
  if (profile === 'paesse') {
    // Sehr kurvig: große Straßen deutlich teurer, gerade Stücke stark abgewertet
    return [
      { if: 'road_class == PRIMARY', multiply_by: '0.2' },
      { if: 'road_class == SECONDARY', multiply_by: '0.55' },
      { if: 'road_class == RESIDENTIAL', multiply_by: '0.4' },
      { if: 'curvature > 0.95', multiply_by: '0.15' },
      { else_if: 'curvature > 0.85', multiply_by: '0.4' },
      { else_if: 'curvature > 0.75', multiply_by: '0.8' },
    ];
  }
  if (profile === 'kurvig') {
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

/**
 * Profil auf dem Server. Kurvig und Sehr kurvig sind dort fest eingebaut, samt Breite und Kurven Regeln,
 * mit vorberechneten Landmarken; das ist um ein Vielfaches schneller als dieselben Regeln pro Anfrage.
 * Kennt der Server sie (noch) nicht, gehen die Regeln wie bisher mit der Anfrage an sportwagen.
 */
function ghProfile(profile: Profile): { name: string; builtIn: boolean } {
  if (profile === 'schnell') return { name: 'auto', builtIn: false };
  if (profile === 'kurvig' && serverProfiles.has('kurvig')) return { name: 'kurvig', builtIn: true };
  if (profile === 'paesse' && serverProfiles.has('sehr_kurvig')) return { name: 'sehr_kurvig', builtIn: true };
  return { name: 'sportwagen', builtIn: false };
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

/**
 * Kuratierte Traumstrecken (Highlights: Rallye, Bergrennen, Kurven und Panoramastraßen) als Korridor:
 * kleine Quadrate alle 120 m entlang der Linie, zusammen ein Gebiet "fav". Alles außerhalb wird etwas
 * teurer, so zieht die Route auf diese Straßen, ohne große Umwege zu erzwingen.
 * Dazu die Strecken, die nur bei der Planung zählen (PREFER_ROADS).
 * Nur Strecken in der Nähe der Anfrage, die nächstgelegenen zuerst, höchstens FAV_MAX Quadrate,
 * damit die Anfrage klein bleibt.
 */
const FAV_MAX = 1500;

function favoriteArea(near: LatLon[], radiusKm: number) {
  if (!near.length) return null;
  const reach = radiusKm * 1000;
  // Grob vorsortieren (etwa radiusKm um die Punkte), dann den kleinsten Abstand bestimmen
  const dLat = radiusKm / 111 + 0.01;
  const inBox = (q: LatLon) => near.some((p) => Math.abs(p[0] - q[0]) < dLat && Math.abs(p[1] - q[1]) < dLat / Math.max(0.2, Math.cos((p[0] * Math.PI) / 180)));
  const roads = [...HIGHLIGHT_ROADS, ...PREFER_ROADS]
    .map((r) => {
      let dist = Infinity;
      for (const q of r.line) {
        if (!inBox(q)) continue;
        for (const p of near) dist = Math.min(dist, haversine(p, q));
      }
      return { r, dist };
    })
    .filter((x) => x.dist < reach)
    .sort((a, b) => a.dist - b.dist)
    .map((x) => x.r);
  if (!roads.length) return null;
  const d = 0.0006;
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const polys: number[][][][] = [];
  for (const road of roads) {
    if (polys.length >= FAV_MAX) break;
    for (let i = 0; i < road.line.length - 1 && polys.length < FAV_MAX; i++) {
      const a = road.line[i];
      const b = road.line[i + 1];
      const n = Math.max(1, Math.round(haversine(a, b) / 120));
      for (let k = 0; k < n && polys.length < FAV_MAX; k++) {
        const la = a[0] + ((b[0] - a[0]) * k) / n;
        const lo = a[1] + ((b[1] - a[1]) * k) / n;
        polys.push([[[r5(lo - d), r5(la - d)], [r5(lo + d), r5(la - d)], [r5(lo + d), r5(la + d)], [r5(lo - d), r5(la + d)], [r5(lo - d), r5(la - d)]]]);
      }
    }
  }
  return { type: 'Feature', id: 'fav', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } };
}

function model(avoid: Avoid, exclude: LatLon[], profile: Profile, penalize: LatLon[] = [], near: LatLon[] = [], radiusKm = 30) {
  const builtIn = ghProfile(profile).builtIn;
  const ex = exclusionModel(exclude, penalize) as { areas?: { features: unknown[] }; priority?: { if: string; multiply_by: string }[] };
  const fav = profile === 'kurvig' || profile === 'paesse' ? favoriteArea(near, radiusKm) : null;
  const priority = [
    // Bei festen Server Profilen stecken Breite und Kurven Regeln schon im Profil
    ...(builtIn ? [] : [...WIDTH_MODEL, ...profileModel(profile)]),
    ...avoidModel(avoid),
    ...(ex.priority ?? []),
    // Traumstrecken bevorzugen: alles andere etwas teurer
    ...(fav ? [{ if: '!in_fav', multiply_by: '0.7' }] : []),
  ];
  if (!priority.length) return undefined;
  const features = [...(ex.areas?.features ?? []), ...(fav ? [fav] : [])];
  return {
    ...(features.length ? { areas: { type: 'FeatureCollection', features } } : {}),
    priority,
    ...(!builtIn && (profile === 'kurvig' || profile === 'paesse') ? { distance_influence: 5 } : {}),
  };
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
  // Gesamtlänge und Lage je Stück, für Start und Ziel (Parkplatz, Hofeinfahrt)
  let totalKm = 0;
  for (let i = 1; i < shape.length; i++) totalKm += haversine(shape[i - 1], shape[i]) / 1000;
  let atKm = 0;
  for (let k = 0; k < idx.length - 1; k++) {
    const a = idx[k];
    const b = idx[k + 1];
    if (b <= a) continue;
    let km = 0;
    for (let i = a + 1; i <= b; i++) km += haversine(shape[i - 1], shape[i]) / 1000;
    const fromKm = atKm;
    atKm += km;
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
    // Mindestbreite: zwei Autos müssen aneinander vorbeikommen. GraphHopper führt maxwidth
    // (Engstelle, meist 2 bis 2,5 m) und die Straßenbreite width im selben Wert:
    // unter 1,9 m passt kein Sportwagen, 2,5 bis 3 m ist eine einspurige Straße, beides raus.
    const mwText = typeof mw === 'number' ? String(mw).replace('.', ',') : '';
    if (typeof mw === 'number' && (mw < 1.9 || (mw >= 2.5 && mw < 3))) why.push(`nur ${mwText} m breit`);
    let c: CheckClass = why.length ? 'raus' : 'ok';
    if (c === 'ok') {
      if (typeof mw === 'number' && mw < 2.5) why.push(`Engstelle ${mwText} m`);
      else if (typeof mw === 'number' && mw < 4.5) why.push(`schmal, ${mwText} m, Gegenverkehr wird eng`);
      // Pflaster nur bei echtem Kopfstein ab 300 m und nicht in den ersten und letzten 500 m: Pflastersteine
      // (paving_stones) fahren sich wie Asphalt, am Start oder Ziel liegt oft nur ein Parkplatz (Koray 9.11.)
      const nearEnds = fromKm < 0.5 || atKm > totalKm - 0.5;
      if ((sf === 'cobblestone' || sf === 'sett' || sf === 'unhewn_cobblestone') && km >= 0.3 && !nearEnds) why.push('Kopfsteinpflaster');
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
    kurvenKm: windingKm(p, shape),
  };
}

/**
 * km auf wirklich kurvigen Kanten (curvature unter 0.9). Abbiegen an Kreuzungen zählt hier nicht,
 * jede Kante für sich ist dort gerade (Testfahrt 7.11.: Zickzack durch die Stadt galt sonst als kurvig).
 */
function windingKm(p: GhPath, shape: LatLon[]): number | undefined {
  const det = p.details.curvature;
  if (!det) return undefined;
  let km = 0;
  for (const [a, b, v] of det) {
    if (typeof v !== 'number' || v >= 0.9) continue;
    for (let i = a + 1; i <= b && i < shape.length; i++) km += haversine(shape[i - 1], shape[i]) / 1000;
  }
  return +km.toFixed(2);
}

/**
 * Route durch Punkte, geprüft; gesperrte Stellen werden bis zu zweimal ausgeschlossen.
 * An Zwischenzielen kein Wenden (pass_through). Fährt die Route danach noch mehr als
 * DOUBLE_MAX_KM auf derselben Straße zurück, wird sie einmal mit verteuerten Stücken neu gerechnet.
 */
export async function cumoPlan(
  name: string,
  points: LatLon[],
  profile: Profile,
  avoid: Avoid,
  signal?: AbortSignal,
  /** von vornherein ausschließen (zum Beispiel aktuelle Sperrungen aus Verkehrsmeldungen) */
  extraExclude: LatLon[] = [],
): Promise<PlannedTour & { curves: number }> {
  let leg = 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]) / 1000;
    leg = Math.max(leg, d);
    sum += d;
  }
  const long = sum > 200;
  const ask = async (exclude: LatLon[], penalize: LatLon[]) => {
    // Traumstrecken im Umkreis der Wegpunkte, bei langen Etappen entsprechend weiter
    // Lange Routen (Summe der Luftlinien über 200 km) ohne Traumstrecken Bereich: den prüft der
    // Server für jede besuchte Straße, bei 700 km dauerte das 35 statt 16 Sekunden (Messung 6.11.).
    // Schneller wird es erst mit einem eigenen Profil Kurvig auf dem Server (Landmarken vorberechnet).
    const m = model(avoid, exclude, profile, penalize, long ? [] : points, Math.min(80, Math.max(20, leg * 0.6)));
    const body = {
      points: points.map(([la, lo]) => [lo, la]),
      profile: ghProfile(profile).name,
      ...(m ? { custom_model: m } : {}),
    };
    if (points.length > 2 && passThroughOk && !points.some((q) => turnAt.has(pkey(q)))) {
      try {
        return await post({ ...body, pass_through: true }, signal);
      } catch (e) {
        if (signal?.aborted) throw e;
        // Server kennt pass_through nicht oder findet so keinen Weg: ohne weiter
        passThroughOk = false;
      }
    }
    return post(body, signal);
  };
  let exclude: LatLon[] = [...extraExclude];
  let best: (PlannedTour & { curves: number }) | null = null;
  for (let round = 0; round < 3; round++) {
    const p = await ask(exclude, []);
    const t = { ...toTour(name, points, p), fixes: round };
    if (!best || (t.km_je_klasse?.raus ?? 0) < (best.km_je_klasse?.raus ?? Infinity)) best = t;
    if ((t.km_je_klasse?.raus ?? 0) === 0) break;
    const more: LatLon[] = [];
    for (const run of t.linie) if (run.c === 'raus') for (let k = 0; k < run.p.length; k += 8) more.push(run.p[k]);
    if (!more.length) break;
    exclude = [...exclude, ...more].slice(0, 40);
  }
  const first = best!;
  const dup = doubledStretch(first.linie.flatMap((r) => r.p));
  // Lange Routen nicht ein zweites Mal rechnen: die Anfrage mit Strafzonen dauerte bei 700 km über
  // eine Minute, und doppelte Stücke fallen dort kaum ins Gewicht
  // Zu einem Stopp abseits hin und zurück ist gewollt, dort nicht gegen doppelte Stücke neu rechnen
  if (dup.km <= DOUBLE_MAX_KM || long || points.some((q) => turnAt.has(pkey(q)))) return first;
  // Die doppelten Stücke nicht in die Nähe der Wegpunkte legen, dort muss die Route hin
  const penalize = dup.points.filter((q) => !points.some((w) => haversine(w, q) < 600));
  if (!penalize.length) return first;
  try {
    const p = await ask(exclude, penalize);
    const t = { ...toTour(name, points, p), fixes: first.fixes };
    const again = doubledStretch(t.linie.flatMap((r) => r.p));
    const notWorse = (t.km_je_klasse?.raus ?? 0) <= (first.km_je_klasse?.raus ?? 0);
    const notMuchLonger = t.laenge_km <= first.laenge_km * 1.2 + 5;
    if (again.km < dup.km - 1 && notWorse && notMuchLonger) return t;
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return first;
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
  /** Ohne feste Richtung: Varianten in verschiedene Richtungen, die kurvigste gewinnt (statt alle in eine Richtung) */
  spread = false,
): Promise<(PlannedTour & { curves: number })[]> {
  // Varianten gleichzeitig anfragen (der Server hat 12 Kerne), statt nacheinander
  // Traumstrecken im Radius der Runde bevorzugen
  const rtModel = model(avoid, [], profile, [], [start], Math.max(15, km / 2.5));
  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      try {
        const p = await post(
          {
            points: [[start[1], start[0]]],
            profile: ghProfile(profile).name,
            algorithm: 'round_trip',
            // GraphHopper Rundtouren werden auf kurvigen Profilen etwa 30 % länger als angefragt
            'round_trip.distance': Math.round(km * 1000 * (profile === 'kurvig' || profile === 'paesse' ? 0.75 : 0.9)),
            'round_trip.seed': seed + i,
            heading: [spread ? (heading + (i * 360) / count) % 360 : heading],
            ...(rtModel ? { custom_model: rtModel } : {}),
          },
          signal,
        );
        return toTour(name, [start, start], p);
      } catch (e) {
        if (signal?.aborted) throw e;
        return null;
      }
    }),
  );
  const out = results.filter((x): x is PlannedTour & { curves: number } => x != null);
  return out;
}
