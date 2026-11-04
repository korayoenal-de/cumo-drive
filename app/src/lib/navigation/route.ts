/**
 * Anweisungen für die Routenführung holen.
 *
 * Die Tour ist schon geplant und geprüft, sie wird nicht umgeplant. Deshalb gleicht Valhalla
 * `trace_route` die Tourlinie mit dem Straßennetz ab (Map Matching) und liefert dazu die
 * Wegbeschreibung. Nur das Anfahrtsstück vom Standort zur Tour kommt aus `/route`.
 *
 * Antwortformat (live geprüft am 4.11.2026 mit Heppenheim nach Lindenfels, 21 km):
 * `/route` und `/trace_route` antworten gleich, `{ trip: { legs, summary, status, units, language } }`.
 *   legs[i].shape      Polyline mit Genauigkeit 6, jedes Leg beginnt am letzten Punkt des vorigen
 *   legs[i].maneuvers  Liste mit unter anderem
 *     type                               Zahlencode (1 Start, 10 rechts, 15 links, 26 Kreisverkehr, 4 Ziel ...)
 *     instruction                        "Rechts auf Ludwigstraße/B 3 abbiegen. Dann weiter auf B 3."
 *     verbal_pre_transition_instruction  "Rechts auf Ludwigstraße, B 3 abbiegen. Dann weiter auf B 3."
 *     verbal_transition_alert_instruction  kurze Vorankündigung (nicht bei jedem Manöver)
 *     street_names, begin_street_names   ["B 3"]
 *     roundabout_exit_count              nur bei type 26
 *     begin_shape_index, end_shape_index Indizes in legs[i].shape
 *     length (km), time (s)
 *   summary.length (km), summary.time (s)
 * Fehler: HTTP 400 mit `{ error_code: 443, error: "Exact route match algorithm failed to find path" }`.
 *
 * Beobachtung beim Test: Wird die Linie stur alle 40 m ausgedünnt, schneidet die Ausdünnung
 * enge Kurven ab und Valhalla erfindet an Kreuzungen eine Kehrtwende. Darum bleiben Punkte an
 * deutlichen Richtungswechseln immer erhalten.
 */
import { flatten, haversine, type LatLon, type Tour } from '../tour';
import { VALHALLA_URL, costingFor, decodePolyline6 } from '../valhalla';
import type { Maneuver, ManeuverKind, NavRequest, NavRoute } from './types';

/** Mindestabstand der Punkte nach dem Ausdünnen in Metern */
const THIN_M = 40;
/** Richtungswechsel in Grad, ab dem ein Punkt trotzdem bleibt */
const THIN_TURN = 35;
/** Höchstzahl der Punkte je trace_route Anfrage */
const CHUNK = 1500;
/** Überlappung zweier Stücke in Punkten */
const OVERLAP = 40;
/** Ab diesem Abstand zum Linienanfang gibt es ein Anfahrtsstück */
const APPROACH_M = 150;
/** Ab dieser Luftlinie zur Tour fährt die Anfahrt die schnellste Route statt des Tourprofils. */
export const LONG_APPROACH_M = 30000;

type VManeuver = {
  type: number;
  instruction: string;
  verbal_pre_transition_instruction?: string;
  street_names?: string[];
  begin_street_names?: string[];
  roundabout_exit_count?: number;
  begin_shape_index: number;
  end_shape_index: number;
  length: number;
  time: number;
};
type VTrip = { trip: { legs: { shape: string; maneuvers: VManeuver[] }[]; summary: { length: number; time: number } } };

/** Zusammengesetztes Stück: Punkte und Manöver mit Indizes in genau diesen Punkten. */
type Piece = { shape: LatLon[]; maneuvers: (VManeuver & { idx: number })[]; seconds: number };

export type NavRouteDetail = {
  route: NavRoute;
  /** Index im Shape, an dem die eigentliche Tour beginnt (0 ohne Anfahrt) */
  tourStartIndex: number;
};

/* ---------- Netz ---------- */

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<VTrip> {
  let res: Response;
  try {
    res = await fetch(`${VALHALLA_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error('Keine Verbindung zum Routenplaner. Bitte die Netzverbindung prüfen.');
  }
  const data = (await res.json().catch(() => ({}))) as Partial<VTrip> & { error?: string; error_code?: number };
  if (!res.ok || !data.trip) {
    if (res.status === 429) throw new Error('Der Routenplaner ist gerade überlastet. Bitte gleich noch einmal versuchen.');
    throw new Error(`Der Routenplaner konnte keine Anweisungen berechnen (${data.error ?? `Fehler ${res.status}`}).`);
  }
  return data as VTrip;
}

/** Legs einer Antwort zu einem Stück zusammensetzen, Indizes auf das gemeinsame Shape umrechnen. */
function piece(r: VTrip): Piece {
  const shape: LatLon[] = [];
  const maneuvers: Piece['maneuvers'] = [];
  r.trip.legs.forEach((leg, li) => {
    const pts = decodePolyline6(leg.shape);
    const offset = shape.length ? shape.length - 1 : 0;
    shape.push(...(shape.length ? pts.slice(1) : pts));
    const last = li === r.trip.legs.length - 1;
    for (const m of leg.maneuvers) {
      // Ziel Manöver zwischen zwei Legs und Start Manöver späterer Legs sind keine echten Anweisungen
      if (!last && isDestination(m.type)) continue;
      if (li > 0 && isStart(m.type)) continue;
      maneuvers.push({ ...m, idx: m.begin_shape_index + offset });
    }
  });
  return { shape, maneuvers, seconds: r.trip.summary.time };
}

/* ---------- Geometrie ---------- */

function bearing(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x =
    Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function turnAngle(a: LatLon, b: LatLon, c: LatLon): number {
  const d = Math.abs(bearing(a, b) - bearing(b, c)) % 360;
  return d > 180 ? 360 - d : d;
}

/** Dünnt die Linie auf etwa THIN_M aus, behält aber Punkte an Richtungswechseln. */
export function thinLine(pts: LatLon[]): LatLon[] {
  if (pts.length <= 2) return [...pts];
  const out: LatLon[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = haversine(out[out.length - 1], pts[i]);
    if (d >= THIN_M || (d >= 10 && turnAngle(pts[i - 1], pts[i], pts[i + 1]) > THIN_TURN)) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function cumulativeKm(shape: LatLon[]): number[] {
  const out = new Array<number>(shape.length);
  let km = 0;
  for (let i = 0; i < shape.length; i++) {
    if (i > 0) km += haversine(shape[i - 1], shape[i]) / 1000;
    out[i] = km;
  }
  return out;
}

/** Index des Punkts mit kleinstem Abstand zu p, nur zwischen from und to. */
function nearestIndex(shape: LatLon[], p: LatLon, from = 0, to = shape.length - 1): number {
  let best = from;
  let bd = Infinity;
  for (let i = Math.max(0, from); i <= Math.min(to, shape.length - 1); i++) {
    const d = haversine(shape[i], p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Einstiegspunkt in die Tour. Nimmt nicht stur den nächsten Punkt, sondern den frühesten
 * Punkt, der fast so nah liegt. So wird bei Linien, die an sich selbst vorbeiführen, kein
 * Teil der Tour übersprungen. Bei Rundtouren zählt der letzte Kilometer nicht, sonst stünde
 * man am Start sofort im Ziel.
 */
function joinIndex(line: LatLon[], cum: number[], p: LatLon, roundTrip: boolean): number {
  const total = cum[cum.length - 1];
  const limit = roundTrip ? Math.max(0, total - 1) : total;
  const dist = line.map((q) => haversine(q, p));
  let dmin = Infinity;
  for (let i = 0; i < line.length && cum[i] <= limit; i++) dmin = Math.min(dmin, dist[i]);
  const tol = dmin + Math.max(300, dmin * 0.5);
  let i = 0;
  while (i < line.length - 1 && cum[i] <= limit && dist[i] > tol) i++;
  // im ersten passenden Bereich bis zum örtlichen Minimum weitergehen
  let best = i;
  for (let j = i; j < line.length && cum[j] <= limit && dist[j] <= tol; j++) if (dist[j] < dist[best]) best = j;
  return best;
}

/* ---------- Valhalla Codes ---------- */

function isStart(t: number) {
  return t >= 1 && t <= 3;
}
function isDestination(t: number) {
  return t >= 4 && t <= 6;
}

/** Valhalla Manövertypen auf unsere groben Arten abbilden. */
export function kindFor(type: number): ManeuverKind {
  switch (type) {
    case 1:
    case 2:
    case 3:
      return 'start';
    case 4:
    case 5:
    case 6:
      return 'ziel';
    case 9:
    case 23:
    case 37:
      return 'leicht_rechts';
    case 10:
      return 'rechts';
    case 11:
      return 'scharf_rechts';
    case 12:
    case 13:
      return 'wenden';
    case 14:
      return 'scharf_links';
    case 15:
      return 'links';
    case 16:
    case 24:
    case 38:
      return 'leicht_links';
    case 17:
    case 18:
    case 19:
      return 'auffahrt';
    case 20:
    case 21:
      return 'abfahrt';
    case 26:
    case 27:
      return 'kreisverkehr';
    default:
      return 'geradeaus';
  }
}

/* ---------- Anfragen ---------- */

const DIRECTIONS = { language: 'de-DE', units: 'kilometers' };

async function traceChunk(points: LatLon[], signal?: AbortSignal): Promise<Piece> {
  const body = {
    shape: points.map(([lat, lon]) => ({ lat, lon })),
    costing: 'auto',
    shape_match: 'map_snap',
    directions_options: DIRECTIONS,
  };
  return piece(await post('trace_route', body, signal));
}

/** Tourlinie abgleichen, lange Linien in Stücken mit Überlappung. */
async function traceLine(line: LatLon[], signal?: AbortSignal): Promise<Piece> {
  const pts = thinLine(line);
  if (pts.length < 2) throw new Error('Die Tour ist zu kurz für eine Routenführung.');
  const ranges: [number, number][] = [];
  for (let start = 0; ; start += CHUNK - OVERLAP) {
    const end = Math.min(start + CHUNK, pts.length);
    ranges.push([start, end]);
    if (end === pts.length) break;
  }
  // nacheinander, um den öffentlichen Server fair zu nutzen
  const pieces: Piece[] = [];
  for (const [a, b] of ranges) pieces.push(await traceChunk(pts.slice(a, b), signal));

  let acc = pieces[0];
  for (let k = 1; k < pieces.length; k++) {
    const next = pieces[k];
    // Schnitt in der Mitte der Überlappung
    const cut = pts[ranges[k][0] + OVERLAP / 2];
    const accCum = cumulativeKm(acc.shape);
    const accTotal = accCum[accCum.length - 1];
    let accFrom = acc.shape.length - 1;
    while (accFrom > 0 && accTotal - accCum[accFrom] < 4) accFrom--;
    const iAcc = nearestIndex(acc.shape, cut, accFrom);
    const nextCum = cumulativeKm(next.shape);
    let nextTo = 0;
    while (nextTo < next.shape.length - 1 && nextCum[nextTo] < 4) nextTo++;
    const iNext = nearestIndex(next.shape, cut, 0, nextTo);

    const shape = [...acc.shape.slice(0, iAcc + 1), ...next.shape.slice(iNext + 1)];
    const shift = iAcc - iNext;
    const maneuvers = [
      ...acc.maneuvers.filter((m) => m.idx < iAcc && !isDestination(m.type)),
      ...next.maneuvers.filter((m) => m.idx >= iNext && !isStart(m.type)).map((m) => ({ ...m, idx: m.idx + shift })),
    ];
    // Fahrzeit anteilig nach Länge
    const nextTotal = nextCum[nextCum.length - 1] || 1;
    const seconds =
      acc.seconds * (accCum[iAcc] / (accTotal || 1)) + next.seconds * ((nextTotal - nextCum[iNext]) / nextTotal);
    acc = { shape, maneuvers, seconds };
  }
  return acc;
}

async function approach(from: LatLon, to: LatLon, toHeading: number, req: NavRequest, signal?: AbortSignal): Promise<Piece> {
  const body = {
    locations: [
      { lat: from[0], lon: from[1], type: 'break', radius: 50 },
      // Ankunft in Fahrtrichtung der Tour, damit man nicht falsch herum einsteigt
      { lat: to[0], lon: to[1], type: 'break', heading: Math.round(toHeading), heading_tolerance: 60, minimum_reachability: 300 },
    ],
    // Weite Anreise: schnellste Route mit Autobahn, das Tourprofil gilt erst auf der Tour
    ...costingFor(haversine(from, to) > LONG_APPROACH_M ? 'schnell' : req.profile, req.avoid),
    directions_options: DIRECTIONS,
  };
  return piece(await post('route', body, signal));
}

function cleanStreet(m: VManeuver): string | undefined {
  const names = m.street_names?.length ? m.street_names : m.begin_street_names;
  return names?.length ? names.join(', ') : undefined;
}

function toManeuver(m: VManeuver & { idx: number }, cumKm: number[]): Maneuver {
  const index = Math.min(Math.max(0, m.idx), cumKm.length - 1);
  return {
    kind: kindFor(m.type),
    text: m.instruction,
    speech: m.verbal_pre_transition_instruction || m.instruction,
    ...(cleanStreet(m) ? { street: cleanStreet(m) } : {}),
    ...(m.type === 26 && m.roundabout_exit_count ? { exit: m.roundabout_exit_count } : {}),
    index,
    // km aus dem zusammengesetzten Shape, damit sie genau zur Positionsverfolgung passen
    km: cumKm[index],
  };
}

function isRoundTrip(line: LatLon[]): boolean {
  return line.length > 2 && haversine(line[0], line[line.length - 1]) < 300;
}

/**
 * Wie fetchNavRoute, liefert zusätzlich den Index, an dem die Tour nach der Anfahrt beginnt.
 * Die Navigation braucht ihn, um bei einer Abweichung den Rest der Tour neu anzufahren.
 */
export async function fetchNavRouteDetail(req: NavRequest, from?: LatLon, signal?: AbortSignal): Promise<NavRouteDetail> {
  const line = flatten(req.tour).map((x) => x.p);
  if (line.length < 2) throw new Error('Die Tour hat keine Linie.');
  const lineCum = line.map(() => 0);
  for (let i = 1; i < line.length; i++) lineCum[i] = lineCum[i - 1] + haversine(line[i - 1], line[i]) / 1000;

  // Nur zum Startpunkt navigieren (weite Anreise)
  if (req.entry === 'anfahrt' && from) {
    const h = bearing(line[0], line[Math.min(1, line.length - 1)]);
    const lead = await approach(from, line[0], h, req, signal);
    const cumKm = cumulativeKm(lead.shape);
    const maneuvers = lead.maneuvers.map((m) => {
      const out = toManeuver(m, cumKm);
      return isDestination(m.type) ? { ...out, text: 'Start der Tour erreicht.', speech: 'Sie haben den Start der Tour erreicht.' } : out;
    });
    return {
      route: { shape: lead.shape, cumKm, maneuvers, km: cumKm[cumKm.length - 1], minutes: lead.seconds / 60, source: 'valhalla' },
      tourStartIndex: lead.shape.length - 1,
    };
  }

  let tourLine = line;
  let lead: Piece | null = null;
  if (from && haversine(from, line[0]) > APPROACH_M) {
    const j = req.entry === 'start' ? 0 : joinIndex(line, lineCum, from, isRoundTrip(line));
    if (haversine(from, line[j]) > APPROACH_M) {
      const h = bearing(line[Math.max(0, Math.min(j, line.length - 2))], line[Math.min(j + 1, line.length - 1)]);
      lead = await approach(from, line[j], h, req, signal);
    }
    tourLine = line.slice(j);
    if (tourLine.length < 2) tourLine = line.slice(-2);
  }

  const tour = await traceLine(tourLine, signal);

  let shape: LatLon[];
  let raw: Piece['maneuvers'];
  let tourStartIndex = 0;
  let seconds = tour.seconds;
  if (lead) {
    const join = lead.shape.length - 1;
    tourStartIndex = join;
    shape = [...lead.shape, ...tour.shape.slice(1)];
    seconds += lead.seconds;
    const tourMan = tour.maneuvers.map((m) => ({ ...m, idx: m.idx + join }));
    const startMan = tourMan.find((m) => isStart(m.type));
    raw = [
      ...lead.maneuvers.filter((m) => !isDestination(m.type)),
      ...tourMan.filter((m) => !isStart(m.type)),
    ];
    // Übergang auf die Tour als eigenes Manöver
    raw.push({
      ...(startMan ?? tourMan[0]),
      type: -1,
      idx: join,
      instruction: 'Tour erreicht. Der Tour folgen.',
      verbal_pre_transition_instruction: 'Sie erreichen die Tour. Danach der Tour folgen.',
    });
    raw.sort((a, b) => a.idx - b.idx);
  } else {
    shape = tour.shape;
    raw = tour.maneuvers;
  }

  // Ausfahrt aus dem Kreisverkehr steckt schon in der Einfahrt Anweisung
  raw = raw.filter((m) => m.type !== 27);

  const cumKm = cumulativeKm(shape);
  const maneuvers = raw.map((m) => {
    const out = toManeuver(m, cumKm);
    return m.type === -1 ? { ...out, kind: 'zwischenziel' as const } : out;
  });
  const km = cumKm[cumKm.length - 1];
  return {
    route: { shape, cumKm, maneuvers, km, minutes: seconds / 60, source: 'valhalla' },
    tourStartIndex,
  };
}

/**
 * Anweisungen genau entlang der geplanten Tour. Mit `from` (Standort) und mehr als 150 m
 * Abstand zum Linienanfang kommt vorne ein Anfahrtsstück dazu, das am nächstgelegenen
 * Punkt der Tour einmündet; ab dort geht es auf der Tour bis zu ihrem Ende.
 */
export async function fetchNavRoute(req: NavRequest, from?: LatLon, signal?: AbortSignal): Promise<NavRoute> {
  return (await fetchNavRouteDetail(req, from, signal)).route;
}

/**
 * Neuberechnung nach einer Abweichung: Anfahrt vom Standort zurück auf den noch nicht
 * gefahrenen Teil der Route (ab doneIndex). Der Rest der Route samt Anweisungen bleibt
 * unverändert, es wird also nichts umgeplant und nur ein kurzes Stück neu angefragt.
 * Eingestiegen wird am nächstgelegenen Punkt des Rests.
 */
export async function rejoinNavRoute(
  req: NavRequest,
  current: NavRoute,
  doneIndex: number,
  from: LatLon,
  signal?: AbortSignal,
): Promise<NavRouteDetail> {
  const { shape } = current;
  const start = Math.max(0, Math.min(doneIndex, shape.length - 2));
  const j = nearestIndex(shape, from, start);
  if (j >= shape.length - 1 || current.km - current.cumKm[j] < 0.05) {
    // praktisch am Ziel: direkt dorthin
    const lead = await approach(from, shape[shape.length - 1], 0, req, signal);
    const cumKm = cumulativeKm(lead.shape);
    const maneuvers = lead.maneuvers.filter((m) => m.type !== 27).map((m) => toManeuver(m, cumKm));
    return {
      route: { shape: lead.shape, cumKm, maneuvers, km: cumKm[cumKm.length - 1], minutes: lead.seconds / 60, source: 'valhalla' },
      tourStartIndex: 0,
    };
  }
  const h = bearing(shape[j], shape[j + 1]);
  const lead = await approach(from, shape[j], h, req, signal);
  const join = lead.shape.length - 1;
  const newShape = [...lead.shape, ...shape.slice(j + 1)];
  const cumKm = cumulativeKm(newShape);
  const leadMan = lead.maneuvers
    .filter((m) => !isDestination(m.type) && m.type !== 27)
    .map((m) => toManeuver(m, cumKm));
  const back: Maneuver = {
    kind: 'zwischenziel',
    text: 'Zurück auf der Tour. Der Tour folgen.',
    speech: 'Sie sind dann zurück auf der Tour.',
    index: join,
    km: cumKm[join],
  };
  const rest = current.maneuvers
    .filter((m) => m.index > j && m.kind !== 'start')
    .map((m) => {
      const index = m.index - (j + 1) + join + 1;
      return { ...m, index, km: cumKm[Math.min(index, cumKm.length - 1)] };
    });
  const restShare = current.km > 0 ? (current.km - current.cumKm[j]) / current.km : 0;
  return {
    route: {
      shape: newShape,
      cumKm,
      maneuvers: [...leadMan, back, ...rest],
      km: cumKm[cumKm.length - 1],
      minutes: lead.seconds / 60 + current.minutes * restShare,
      source: 'valhalla',
    },
    tourStartIndex: join,
  };
}

/** Tour aus einem Stück Linie bauen (zum Beispiel für Tests). */
export function tourFromLine(name: string, line: LatLon[]): Tour {
  const t: Tour = {
    name,
    laenge_km: 0,
    wegpunkte: [line[0], line[line.length - 1]],
    linie: [{ c: 'ok', p: line }],
    warnungen: [],
    geprueft: true,
  };
  const pts = flatten(t);
  t.laenge_km = pts.length ? +pts[pts.length - 1].km.toFixed(1) : 0;
  return t;
}
