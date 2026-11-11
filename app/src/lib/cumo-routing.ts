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

import { gzipSync, strToU8 } from 'fflate';
import { Platform } from 'react-native';

import type { PlannedTour } from './plan';
import { BIG_CITIES } from '@/data/big-cities';

import { HIGHLIGHT_ROADS, PREFER_ROADS } from './highlight-roads';
import { regionArea } from './regions';
import { countCurves } from './stats';
import { doubledStretch } from './doubled';
import { haversine, type CheckClass, type LatLon, type Profile, type Tour, type Warning } from './tour';
import type { Avoid } from './valhalla';

/** Fahrregionen als Fläche auf dem Server (aus, siehe model) */
const SERVER_REGIONS = false;

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

/** Wie lange das Ergebnis gilt: erreichbar 5 Minuten (ein Fehler bei einer Abfrage setzt es sofort zurück), sonst 20 s */
const OK_MS = 5 * 60 * 1000;
const DOWN_MS = 20 * 1000;
let checking: Promise<boolean> | null = null;

/**
 * Ist der eigene Server erreichbar? Die Prüfung kostete vor jeder Planung bis zu 0,7 s (Messung 10.11.);
 * jetzt wird sie beim Öffnen des Planers vorab gemacht (prewarmRouting) und 5 Minuten gemerkt.
 */
export function cumoAvailable(): Promise<boolean> {
  if (availability && Date.now() - availability.at < (availability.ok ? OK_MS : DOWN_MS)) return Promise.resolve(availability.ok);
  // mehrere Aufrufe gleichzeitig (Planen und Vorwärmen) teilen sich eine Prüfung
  checking ??= probe().finally(() => {
    checking = null;
  });
  return checking;
}

/** Beim Öffnen des Planers: Server prüfen und die Verbindung aufbauen, bevor die erste Route kommt */
export function prewarmRouting(): void {
  void cumoAvailable().catch(() => undefined);
}

async function probe(): Promise<boolean> {
  const url = routingServerUrl();
  if (!url) return false;
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
const SNAP_PREVENT = ['motorway', 'trunk', 'track', 'ferry', 'tunnel', 'ford'];
let snapOk = true;

export function allowTurnAt(p: LatLon) {
  turnAt.add(pkey(p));
}

/** Zeit und Länge je Etappe: damit bleiben unveränderte Etappen beim Ändern stehen (plan-window.ts) */
const LEG_DETAILS = ['leg_time', 'leg_distance'];
const DETAILS = ['road_class', 'surface', 'track_type', 'max_width', 'street_name', 'street_ref', 'curvature', 'urban_density'];

/** Rechteck um den Abschnitt a bis b, halfM Meter breit nach jeder Seite und über die Enden hinaus */
function corridorRect(a: LatLon, b: LatLon, halfM: number): number[][] {
  const ky = 110540;
  const kx = 111320 * Math.cos((a[0] * Math.PI) / 180);
  const dx = (b[1] - a[1]) * kx;
  const dy = (b[0] - a[0]) * ky;
  const len = Math.hypot(dx, dy) || 1;
  const ux = (dx / len) * halfM;
  const uy = (dy / len) * halfM;
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const corner = (base: LatLon, along: number, side: number) => [r5(base[1] + (along * ux - side * uy) / kx), r5(base[0] + (along * uy + side * ux) / ky)];
  const c1 = corner(a, -1, 1);
  return [c1, corner(b, 1, 1), corner(b, 1, -1), corner(a, -1, -1), c1];
}

/**
 * Kleine Quadrate (etwa 120 m) um gesperrte Stellen, für den Ausschluss per custom_model.
 * Doppelt gefahrene Stücke (penalize) als durchgehender Korridor: Punkte, die weniger als 800 m auseinander
 * liegen, werden mit einem Rechteck verbunden (Stresstest 10.11.: 60 einzelne Quadrate deckten 30 km Rückweg
 * auf derselben Straße kaum ab, die Route blieb dort).
 */
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
  const polys: number[][][][] = [];
  for (let i = 0; i < penalize.length && polys.length < 300; i++) {
    const p = penalize[i];
    const next = penalize[i + 1];
    const prev = penalize[i - 1];
    if (next && haversine(p, next) < 800) polys.push([corridorRect(p, next, 60)]);
    // einzelner Punkt ohne Nachbarn: kleines Quadrat
    else if (!prev || haversine(prev, p) >= 800) polys.push([corridorRect(p, p, 60)]);
  }
  const dup = polys.length ? [{ type: 'Feature', id: 'dup', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }] : [];
  const priority = [
    ...(ex.length ? [{ if: ex.map((f) => `in_${f.id}`).join(' || '), multiply_by: '0' }] : []),
    // Schon befahrene Straße: deutlich teurer, aber nicht verboten (manchmal gibt es nur die eine)
    ...(dup.length ? [{ if: 'in_dup', multiply_by: '0.15' }] : []),
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

/**
 * Antworten des Servers 5 Minuten merken (höchstens 60): dieselbe Abfrage kommt oft mehrfach, etwa beim
 * Zurücknehmen einer Änderung, beim Wechsel des Profils hin und zurück, beim Umplanen um eine Sperrung
 * oder wenn Rundtour Varianten dieselben Stützpunkte ergeben. Gleichzeitige gleiche Abfragen teilen sich eine.
 */
const MEMO_MS = 5 * 60 * 1000;
const MEMO_MAX = 60;
const memo = new Map<string, { at: number; path: Promise<GhPath> }>();

/** Anfragen ab 2 KB komprimiert senden (nur in der App, im Browser erlaubt der Server den Kopf nicht): der
 *  Traumstrecken Bereich macht eine kurvige Abfrage rund 100 KB groß, im Mobilnetz zählt der Upload. */
const GZIP_MIN = 2000;
/** wird false, sobald eine komprimierte Anfrage scheitert, die unkomprimiert klappt (Sicherheitsnetz) */
let gzipOk = Platform.OS !== 'web';

async function send(text: string, signal?: AbortSignal): Promise<GhPath> {
  const url = routingServerUrl();
  if (!url) throw new Error('Kein eigener Routing Server eingestellt.');
  const ask = (zip: boolean) =>
    fetch(`${url}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(zip ? { 'Content-Encoding': 'gzip' } : {}) },
      body: zip ? gzipSync(strToU8(text), { level: 4 }) : text,
      signal,
    });
  const read = async (res: Response) => {
    const data = (await res.json().catch(() => ({}))) as { message?: string; paths?: GhPath[] };
    return { ok: res.ok && !!data.paths?.length, data, status: res.status };
  };
  const zip = gzipOk && text.length >= GZIP_MIN;
  let out: Awaited<ReturnType<typeof read>> | null = null;
  try {
    out = await read(await ask(zip));
  } catch (e) {
    if (signal?.aborted) throw e;
    if (!zip) {
      // Netzfehler: beim nächsten Planen neu prüfen, ob der Server da ist
      availability = null;
      throw e;
    }
  }
  // Komprimiert gescheitert ohne klare Antwort des Routers: einmal unkomprimiert, und dabei bleiben, wenn es so klappt
  if (zip && (!out || (!out.ok && !out.data.message))) {
    try {
      const plain = await read(await ask(false));
      if (plain.ok) gzipOk = false;
      out = plain;
    } catch (e) {
      if (!signal?.aborted) availability = null;
      throw e;
    }
  }
  if (!out || !out.ok) throw new Error(`Eigener Routing Server: ${out?.data.message ?? `Fehler ${out?.status ?? 0}`}`);
  return out.data.paths![0];
}

async function post(body: Record<string, unknown>, signal?: AbortSignal): Promise<GhPath> {
  const text = JSON.stringify({ points_encoded: false, instructions: false, details: [...DETAILS, ...LEG_DETAILS], ...body });
  const now = Date.now();
  const hit = memo.get(text);
  if (hit && now - hit.at < MEMO_MS) {
    try {
      return await hit.path;
    } catch (e) {
      // die geteilte Abfrage wurde von einem anderen Aufrufer abgebrochen: selbst neu fragen
      if (signal?.aborted) throw e;
    }
  }
  const path = send(text, signal);
  memo.set(text, { at: now, path });
  if (memo.size > MEMO_MAX) for (const k of memo.keys()) {
    memo.delete(k);
    if (memo.size <= MEMO_MAX) break;
  }
  try {
    return await path;
  } catch (e) {
    if (memo.get(text)?.path === path) memo.delete(text);
    throw e;
  }
}

/**
 * Kuratierte Traumstrecken (Highlights: Rallye, Bergrennen, Kurven und Panoramastraßen) als Korridor:
 * kleine Quadrate alle 120 m entlang der Linie, zusammen ein Gebiet "fav". Alles außerhalb wird etwas
 * teurer, so zieht die Route auf diese Straßen, ohne große Umwege zu erzwingen.
 * Dazu die Strecken, die nur bei der Planung zählen (PREFER_ROADS).
 * Nur Strecken in der Nähe der Anfrage, die nächstgelegenen zuerst, höchstens FAV_MAX Quadrate,
 * damit die Anfrage klein bleibt.
 */
const FAV_MAX = 600;
/** Halbe Breite des Korridors in Metern (wie bisher die Quadrate: gut 60 m um die Linie) */
const FAV_HALF_M = 62;
/** Stützpunkte der Linie dichter als so werden zusammengefasst */
const FAV_STEP_M = 150;

type FavArea = { type: 'Feature'; id: 'fav'; properties: Record<string, never>; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } };
/** Der Bereich hängt nur von den Punkten und dem Radius ab und wird je Planung mehrfach gebraucht */
const favMemo = new Map<string, FavArea | null>();

/**
 * Seit 10.11. ein Rechteck je Abschnitt der Linie statt eines Quadrats alle 120 m: gleiche Abdeckung mit
 * einem Drittel der Flächen. Die Anfrage schrumpft von rund 100 auf 30 KB (komprimiert unter 10 KB),
 * und der Server prüft je Straße weniger Flächen.
 */
function favoriteArea(near: LatLon[], radiusKm: number): FavArea | null {
  if (!near.length) return null;
  const key = `${radiusKm.toFixed(1)}|${near.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(';')}`;
  const known = favMemo.get(key);
  if (known !== undefined) return known;
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
  let area: FavArea | null = null;
  if (roads.length) {
    const polys: number[][][][] = [];
    for (const road of roads) {
      if (polys.length >= FAV_MAX) break;
      // Linie auf Abschnitte ab 150 m ausdünnen, der letzte Punkt bleibt
      const line: LatLon[] = [road.line[0]];
      for (let i = 1; i < road.line.length; i++) {
        if (i === road.line.length - 1 || haversine(line[line.length - 1], road.line[i]) >= FAV_STEP_M) line.push(road.line[i]);
      }
      for (let i = 0; i < line.length - 1 && polys.length < FAV_MAX; i++) {
        const a = line[i];
        const b = line[i + 1];
        polys.push([corridorRect(a, b, FAV_HALF_M)]);
      }
    }
    area = { type: 'Feature', id: 'fav', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } };
  }
  if (favMemo.size > 40) favMemo.clear();
  favMemo.set(key, area);
  return area;
}

/**
 * Großstädte in Reichweite als Achteck je Stadt (Koray 10.11.: nahe Großstädten gibt es meist keine gute Route).
 * Städte, in denen ein Wegpunkt liegt, bleiben frei: wer dort startet oder hin will, muss hinein.
 */
const cityMemo = new Map<string, unknown>();
function cityArea(near: LatLon[], radiusKm: number) {
  if (!near.length) return null;
  const key = `${radiusKm.toFixed(0)}|${near.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(';')}`;
  if (cityMemo.has(key)) return cityMemo.get(key) as ReturnType<typeof build>;
  const build = () => {
    const polys: number[][][][] = [];
    for (const [, la, lo, r] of BIG_CITIES) {
      const c: LatLon = [la, lo];
      const rm = r * 1000;
      if (near.some((p) => haversine(p, c) < rm + 1500)) continue;
      if (!near.some((p) => haversine(p, c) < radiusKm * 1000 + rm)) continue;
      const ring: number[][] = [];
      for (let k = 0; k <= 8; k++) {
        const a = ((k % 8) * Math.PI) / 4;
        ring.push([+(lo + (Math.sin(a) * rm) / (111320 * Math.cos((la * Math.PI) / 180))).toFixed(5), +(la + (Math.cos(a) * rm) / 110540).toFixed(5)]);
      }
      polys.push([ring]);
    }
    return polys.length ? { type: 'Feature', id: 'stadt', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } } : null;
  };
  const area = build();
  if (cityMemo.size > 40) cityMemo.clear();
  cityMemo.set(key, area);
  return area;
}

/** km einer Linie innerhalb der Großstadt Zonen (ohne Städte, in denen ein Wegpunkt liegt) */
export function bigCityKm(line: LatLon[], waypoints: LatLon[]): number {
  const cities = BIG_CITIES.filter(([, la, lo, r]) => !waypoints.some((w) => haversine(w, [la, lo]) < r * 1000 + 1500));
  let km = 0;
  let lastIn = false;
  for (let i = 1; i < line.length; i++) {
    const p = line[i];
    if (i % 3 === 1 || lastIn) lastIn = cities.some(([, la, lo, r]) => Math.abs(la - p[0]) < r / 100 && Math.abs(lo - p[1]) < r / 60 && haversine(p, [la, lo]) < r * 1000);
    if (lastIn) km += haversine(line[i - 1], p) / 1000;
  }
  return +km.toFixed(1);
}

function model(avoid: Avoid, exclude: LatLon[], profile: Profile, penalize: LatLon[] = [], near: LatLon[] = [], radiusKm = 30) {
  const builtIn = ghProfile(profile).builtIn;
  const ex = exclusionModel(exclude, penalize) as { areas?: { features: unknown[] }; priority?: { if: string; multiply_by: string }[] };
  const fav = profile === 'kurvig' || profile === 'paesse' ? favoriteArea(near, radiusKm) : null;
  const city = profile === 'kurvig' || profile === 'paesse' ? cityArea(near, radiusKm) : null;
  // Fahrregionen (Koray 10.11.) bewusst nicht auf dem Server: Straßen außerhalb abzuwerten ließ die Suche viel mehr
  // Straßen prüfen, Routen brauchten im Test 5,7 bis 6,8 statt 3,9 s, ohne messbar mehr Fahrspaß (Stresstest 3).
  // Die Regionen wirken in der Bewertung der Rundtour (smart-roundtrip.ts). Zum Messen: SERVER_REGIONS = true.
  const region = SERVER_REGIONS && profile !== 'schnell' ? regionArea(near, radiusKm) : null;
  const priority = [
    // Bei festen Server Profilen stecken Breite und Kurven Regeln schon im Profil
    ...(builtIn ? [] : [...WIDTH_MODEL, ...profileModel(profile)]),
    ...avoidModel(avoid),
    ...(ex.priority ?? []),
    // Traumstrecken bevorzugen: alles andere etwas teurer
    ...(fav ? [{ if: '!in_fav', multiply_by: '0.7' }] : []),
    // Großstädte deutlich teurer, nicht verboten
    ...(city ? [{ if: 'in_stadt', multiply_by: '0.4' }] : []),
    ...(region ? [{ if: '!in_region', multiply_by: profile === 'entspannt' ? '0.9' : '0.85' }] : []),
  ];
  if (!priority.length) return undefined;
  const features = [...(ex.areas?.features ?? []), ...(fav ? [fav] : []), ...(city ? [city] : []), ...(region ? [region] : [])];
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

/**
 * Raster der kuratierten Strecken (etwa 1 km Zellen), um schnell zu prüfen, ob ein Stück auf einer von Menschen
 * geprüften Strecke liegt. Dort gilt die schmale Breite aus OSM nur als Hinweis, nicht als Sperre
 * (Tester 9.11.: K 31 Höningen nach Leistadt steht mit 2,8 m in der Karte, fährt sich aber gut).
 */
let curatedGrid: Map<string, LatLon[]> | null = null;
const cellOf = (p: LatLon) => `${Math.floor(p[0] * 100)},${Math.floor(p[1] * 70)}`;
function onCurated(p: LatLon): boolean {
  if (!curatedGrid) {
    curatedGrid = new Map();
    for (const r of [...HIGHLIGHT_ROADS, ...PREFER_ROADS]) {
      for (let i = 0; i < r.line.length; i++) {
        // Zwischenpunkte, damit lange Abschnitte zwischen zwei Stützpunkten nicht durchs Raster fallen
        const a = r.line[i];
        const b = r.line[Math.min(r.line.length - 1, i + 1)];
        const n = Math.max(1, Math.ceil(haversine(a, b) / 80));
        for (let k = 0; k < n; k++) {
          const q: LatLon = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
          const key = cellOf(q);
          const list = curatedGrid.get(key);
          if (list) list.push(q);
          else curatedGrid.set(key, [q]);
        }
      }
    }
  }
  const [la, lo] = [Math.floor(p[0] * 100), Math.floor(p[1] * 70)];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) for (const q of curatedGrid.get(`${la + dy},${lo + dx}`) ?? []) if (haversine(p, q) < 120) return true;
  return false;
}

/**
 * Wert eines Details an einem Punktindex, für aufsteigende Indizes: merkt sich die Stelle und sucht von dort
 * weiter. Vorher lief jede Abfrage von vorn durch die Liste, bei langen Routen mit tausenden Abschnitten
 * waren das Millionen Vergleiche je Prüfung (Messung 10.11.).
 */
function detailCursor(details: Detail[] | undefined) {
  let k = 0;
  return (i: number) => {
    if (!details) return null;
    if (k >= details.length || i < details[k][0]) k = 0;
    while (k < details.length && i >= details[k][1]) k++;
    return k < details.length && i >= details[k][0] ? details[k][2] : null;
  };
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
  const at = {
    road_class: detailCursor(path.details.road_class),
    surface: detailCursor(path.details.surface),
    track_type: detailCursor(path.details.track_type),
    max_width: detailCursor(path.details.max_width),
    street_ref: detailCursor(path.details.street_ref),
    street_name: detailCursor(path.details.street_name),
  };
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
    const rc = String(at.road_class(a) ?? '').toLowerCase();
    const sf = String(at.surface(a) ?? '').toLowerCase();
    const tt = String(at.track_type(a) ?? '').toLowerCase();
    const mw = at.max_width(a);
    const ref = String(at.street_ref(a) ?? '');
    const name = String(at.street_name(a) ?? '') || ref;
    const why: string[] = [];
    if (NON_CAR.has(rc)) why.push(rc === 'track' ? 'Wirtschafts oder Waldweg' : `als ${rc} eingetragen`);
    if (UNPAVED.has(sf)) why.push(`Belag ${sf}`);
    if (tt && tt !== 'missing' && tt !== 'grade1') why.push(`Wegklasse ${tt}`);
    // Mindestbreite: zwei Autos müssen aneinander vorbeikommen. GraphHopper führt maxwidth
    // (Engstelle, meist 2 bis 2,5 m) und die Straßenbreite width im selben Wert:
    // unter 1,9 m passt kein Sportwagen, 2,5 bis 3 m ist eine einspurige Straße, beides raus.
    // höchstens zwei Nachkommastellen (Koray 10.11.: "3,3000000000000003 m breit" aus der Karte)
    const mwText = typeof mw === 'number' ? String(Math.round(mw * 100) / 100).replace('.', ',') : '';
    // Auf kuratierten Strecken ist eine einspurige Breite (2,5 bis 3 m) nur zu prüfen, nicht gesperrt
    const narrow = typeof mw === 'number' && mw >= 2.5 && mw < 3;
    const curated = narrow && onCurated(shape[Math.floor((a + b) / 2)]);
    if (typeof mw === 'number' && (mw < 1.9 || (narrow && !curated))) why.push(`nur ${mwText} m breit`);
    let c: CheckClass = why.length ? 'raus' : 'ok';
    if (c === 'ok' && curated) why.push(`schmal, ${mwText} m laut Karte, von Fahrern empfohlen`);
    if (c === 'ok') {
      if (typeof mw === 'number' && mw < 2.5) why.push(`Engstelle ${mwText} m`);
      else if (!curated && typeof mw === 'number' && mw < 4.5) why.push(`schmal, ${mwText} m, Gegenverkehr wird eng`);
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

/** Minuten und km je Etappe aus den Details des Routers; leer, wenn sie fehlen oder nicht zur Zahl der Etappen passen */
function legDetails(p: GhPath, legs: number): { legMin?: number[]; legKm?: number[] } {
  const t = p.details.leg_time;
  const d = p.details.leg_distance;
  if (!t || !d || t.length !== legs || d.length !== legs) return {};
  return { legMin: t.map((x) => Number(x[2]) / 60000), legKm: d.map((x) => Number(x[2]) / 1000) };
}

function toTour(name: string, wegpunkte: LatLon[], p: GhPath): PlannedTour & { curves: number } {
  const chk = checkFromDetails(p);
  const shape: LatLon[] = p.points.coordinates.map(([lon, lat]) => [lat, lon]);
  return {
    name, wegpunkte, ...chk, laenge_km: +(p.distance / 1000).toFixed(1), minutes: p.time / 60000, geprueft: true, fixes: 0,
    curves: countCurves(shape),
    kurvenKm: windingKm(p, shape),
    ...classKm(p, shape),
    ...legDetails(p, wegpunkte.length - 1),
  };
}

/**
 * km auf Autobahn und Schnellstraße, in Wohnstraßen, und nach Ortsdichte des Servers (city: Großstadt,
 * residential: bebaut), zur Bewertung (Koray 10.11.: nahe Großstädten gibt es meist keine gute Route)
 */
function classKm(p: GhPath, shape: LatLon[]): { autobahnKm: number; wohnKm: number; stadtKm?: number; bebautKm?: number } {
  const span = (a: number, b: number) => {
    let km = 0;
    for (let i = a + 1; i <= b && i < shape.length; i++) km += haversine(shape[i - 1], shape[i]) / 1000;
    return km;
  };
  let city = 0;
  let built = 0;
  const ud = p.details.urban_density;
  if (ud) for (const [a, b, v] of ud) {
    if (v === 'city') city += span(a, b);
    else if (v === 'residential') built += span(a, b);
  }
  const extra = ud ? { stadtKm: +city.toFixed(1), bebautKm: +built.toFixed(1) } : {};
  let fast = 0;
  let res = 0;
  for (const [a, b, v] of p.details.road_class ?? []) {
    const rc = String(v ?? '').toLowerCase();
    const isFast = rc === 'motorway' || rc === 'trunk';
    const isRes = rc === 'residential' || rc === 'living_street' || rc === 'service';
    if (!isFast && !isRes) continue;
    let km = 0;
    for (let i = a + 1; i <= b && i < shape.length; i++) km += haversine(shape[i - 1], shape[i]) / 1000;
    if (isFast) fast += km;
    else res += km;
  }
  return { autobahnKm: +fast.toFixed(1), wohnKm: +res.toFixed(1), ...extra };
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
  /** nur eine Abfrage, ohne Nachbessern: reicht zum Vergleichen (Länge, Kurven km) */
  quick = false,
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
      // Punkte nicht auf Wirtschaftswege, Autobahnen oder Fähren einrasten: ein gezogener Punkt neben einem
      // Feldweg erzeugte sonst einen Stich (Koray 11.11.). Kennt der Server das nicht, geht es ohne weiter.
      ...(snapOk ? { snap_preventions: SNAP_PREVENT } : {}),
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
    try {
      return await post(body, signal);
    } catch (e) {
      if (signal?.aborted || !snapOk) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/snap|cannot find point|point ?not ?found/i.test(msg)) throw e;
      // unbekannter Parameter: für diese Sitzung abschalten; kein Punkt gefunden: nur diesmal ohne
      if (/snap/i.test(msg)) snapOk = false;
      const { snap_preventions: _drop, ...plain } = body as typeof body & { snap_preventions?: string[] };
      return post(plain, signal);
    }
  };
  let exclude: LatLon[] = [...extraExclude];
  let best: (PlannedTour & { curves: number }) | null = null;
  for (let round = 0; round < (quick ? 1 : 3); round++) {
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
  if (quick) return first;
  const dup = doubledStretch(first.linie.flatMap((r) => r.p));
  // Lange Routen nicht ein zweites Mal rechnen: die Anfrage mit Strafzonen dauerte bei 700 km über
  // eine Minute, und doppelte Stücke fallen dort kaum ins Gewicht
  // Zu einem Stopp abseits hin und zurück ist gewollt, dort nicht gegen doppelte Stücke neu rechnen
  if (dup.km <= DOUBLE_MAX_KM || long || points.some((q) => turnAt.has(pkey(q)))) return first;
  // Die doppelten Stücke nicht in die Nähe der Wegpunkte legen, dort muss die Route hin
  const penalize = dup.points.filter((q) => !points.some((w) => haversine(w, q) < 600));
  const roundish = haversine(points[0], points[points.length - 1]) < 3000;
  const accept = (t: PlannedTour & { curves: number }, ref: PlannedTour & { curves: number }, refDup: number) => {
    const again = doubledStretch(t.linie.flatMap((r) => r.p));
    const notWorse = (t.km_je_klasse?.raus ?? 0) <= (ref.km_je_klasse?.raus ?? 0);
    // Hin und zurück zum selben Ort (Start gleich Ziel): ein anderer Rückweg darf deutlich länger sein
    const notMuchLonger = t.laenge_km <= first.laenge_km * (roundish ? 1.45 : 1.2) + (roundish ? 10 : 5);
    return again.km < refDup - 1 && notWorse && notMuchLonger ? again.km : null;
  };
  let cur = first;
  let curDup = dup.km;
  if (penalize.length) {
    try {
      const p = await ask(exclude, penalize);
      const t = { ...toTour(name, points, p), fixes: first.fixes };
      const d = accept(t, cur, curDup);
      if (d != null) {
        cur = t;
        curDup = d;
      }
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (curDup <= DOUBLE_MAX_KM || points.length < 3 || points.length > 8) return cur;
  // Etappe für Etappe: jede meidet die Straßen der vorigen (Stresstest 10.11.: Bad Dürkheim, Annweiler,
  // Bad Dürkheim fuhr 24 km auf demselben Weg zurück; beide Richtungen gleich zu verteuern half nicht,
  // die Route wich dann gemeinsam auf die nächste Straße aus)
  try {
    const paths: GhPath[] = [];
    let used: LatLon[] = [];
    for (let k = 0; k < points.length - 1; k++) {
      const legPts = [points[k], points[k + 1]];
      const pen = used.filter((q) => !points.some((w) => haversine(w, q) < 1500));
      const m = model(avoid, exclude, profile, pen, long ? [] : legPts, Math.min(80, Math.max(20, leg * 0.6)));
      const p = await post({ points: legPts.map(([la, lo]) => [lo, la]), profile: ghProfile(profile).name, ...(m ? { custom_model: m } : {}) }, signal);
      paths.push(p);
      used = used.concat(sampleLine(p.points.coordinates.map(([lo, la]) => [la, lo] as LatLon), 300));
    }
    const t = { ...toTour(name, points, mergePaths(paths)), fixes: first.fixes };
    if (accept(t, cur, curDup) != null) return t;
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return cur;
}

/** Punkte entlang einer Linie im Abstand von etwa stepM */
function sampleLine(line: LatLon[], stepM: number): LatLon[] {
  const out: LatLon[] = [];
  let last: LatLon | null = null;
  for (const p of line) {
    if (last && haversine(last, p) < stepM) continue;
    out.push(p);
    last = p;
  }
  return out;
}

/** Einzeln gerechnete Etappen zu einem Weg zusammenfügen (Punkte, Details mit verschobenem Index, Länge, Zeit) */
function mergePaths(paths: GhPath[]): GhPath {
  const coords: [number, number][] = [];
  const details: Record<string, Detail[]> = {};
  let distance = 0;
  let time = 0;
  paths.forEach((p, i) => {
    const base = i === 0 ? 0 : coords.length - 1;
    const pts = i === 0 ? p.points.coordinates : p.points.coordinates.slice(1);
    coords.push(...pts);
    for (const [key, list] of Object.entries(p.details)) {
      const out = (details[key] ??= []);
      for (const [a, b, v] of list) out.push([a + base, b + base, v]);
    }
    distance += p.distance;
    time += p.time;
  });
  return { distance, time, points: { coordinates: coords }, details };
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
