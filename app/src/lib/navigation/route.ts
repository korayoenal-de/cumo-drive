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
import { checkLine } from '../check';
import { closureExclude, closuresNear, closuresOnRoute } from '../road-closures';
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
type VTrip = {
  trip: {
    legs: { shape: string; maneuvers: VManeuver[] }[];
    summary: { length: number; time: number };
    /** bei trace_route: Anfang, Ende und Unterbrechungen, mit Index in der eingereichten Linie */
    locations?: { type?: string; original_index?: number }[];
  };
};

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

export function cumulativeKm(shape: LatLon[]): number[] {
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
/**
 * Einstieg in die Tour (Entscheidung Koray, 6.11.): schnell auf die Tour, aber möglichst nah am Anfang,
 * nie kurz vor dem Ende. Kosten je Punkt: Luftlinie dorthin plus 0,4 km für jeden übersprungenen
 * Tourkilometer. Bei Rundtouren zählt der letzte Kilometer nicht, dort liegt wieder der Start.
 */
const SKIP_WEIGHT = 0.4;

function joinIndex(line: LatLon[], cum: number[], p: LatLon, roundTrip: boolean): number {
  const total = cum[cum.length - 1];
  const limit = roundTrip ? Math.max(0, total - 1) : total;
  let best = 0;
  let bestCost = Infinity;
  for (let i = 0; i < line.length && cum[i] <= limit; i++) {
    const cost = haversine(line[i], p) / 1000 + SKIP_WEIGHT * cum[i];
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
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
      return 'ziel';
    case 5:
      return 'ziel_rechts';
    case 6:
      return 'ziel_links';
    case 9:
      return 'leicht_rechts';
    case 10:
      return 'rechts';
    case 11:
      return 'scharf_rechts';
    case 12:
      return 'wenden_rechts';
    case 13:
      return 'wenden';
    case 14:
      return 'scharf_links';
    case 15:
      return 'links';
    case 16:
      return 'leicht_links';
    case 17:
      return 'auffahrt';
    case 18:
      return 'auffahrt_rechts';
    case 19:
      return 'auffahrt_links';
    case 20:
      return 'abfahrt_rechts';
    case 21:
      return 'abfahrt_links';
    case 23:
      return 'rechts_halten';
    case 24:
      return 'links_halten';
    case 25:
    case 38:
      return 'einfaedeln_links';
    case 37:
      return 'einfaedeln_rechts';
    case 26:
      return 'kreisverkehr';
    case 27:
      return 'kreisverkehr_verlassen';
    case 28:
      return 'faehre_an_bord';
    case 29:
      return 'faehre_verlassen';
    default:
      return 'geradeaus';
  }
}

/* ---------- Anfragen ---------- */

const DIRECTIONS = { language: 'de-DE', units: 'kilometers' };

/** Zwei Stücke, die am selben Punkt enden und beginnen, zu einem verbinden */
function joinPieces(a: Piece, b: Piece): Piece {
  const shift = a.shape.length - 1;
  return {
    shape: [...a.shape, ...b.shape.slice(1)],
    maneuvers: [...a.maneuvers.filter((m) => !isDestination(m.type)), ...b.maneuvers.filter((m) => !isStart(m.type)).map((m) => ({ ...m, idx: m.idx + shift }))],
    seconds: a.seconds + b.seconds,
  };
}

/**
 * Ein Stück der Linie abgleichen. Valhalla hört an einer Stelle, die es nicht zuordnen kann (etwa eine
 * Wende auf einer Nebenfahrbahn), mit einem "via" auf und liefert nur den Teil davor. Dann geht es ab
 * dieser Stelle weiter, bis die ganze Linie abgedeckt ist (Rundtour ab Bensheim, 6.11.: nur 1,2 von 54 km).
 */
async function traceChunk(points: LatLon[], req: NavRequest, signal?: AbortSignal): Promise<Piece> {
  let from = 0;
  let acc: Piece | null = null;
  for (let guard = 0; guard < 25 && from < points.length - 1; guard++) {
    const part = points.slice(from);
    const shape = part.map(([lat, lon]) => ({ lat, lon }));
    // mit den Kosten der Planung (kein Schotter, Wirtschaftswege teuer): sonst legt der Abgleich die Tour
    // zwischen zwei Punkten gern über einen parallelen Feldweg (Testfahrt 8.11.). Führt die Tour selbst
    // über ein gesperrtes Stück, findet der Abgleich so keinen Weg: dann wie bisher ohne Kosten.
    const r = await post('trace_route', { shape, ...costingFor('schnell', req.avoid), shape_match: 'map_snap', directions_options: DIRECTIONS }, signal).catch((e: unknown) => {
      if (signal?.aborted) throw e;
      return post('trace_route', { shape, costing: 'auto', shape_match: 'map_snap', directions_options: DIRECTIONS }, signal);
    });
    const p = piece(r);
    acc = acc ? joinPieces(acc, p) : p;
    const locs = r.trip.locations ?? [];
    const last = locs.length ? (locs[locs.length - 1].original_index ?? part.length - 1) : part.length - 1;
    if (last >= part.length - 1) break;
    from += last + 1;
  }
  return acc!;
}

/** Tourlinie abgleichen, lange Linien in Stücken mit Überlappung. */
async function traceLine(line: LatLon[], req: NavRequest, signal?: AbortSignal): Promise<Piece> {
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
  for (const [a, b] of ranges) pieces.push(await traceChunk(pts.slice(a, b), req, signal));

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

async function approachOnce(
  from: LatLon,
  to: LatLon,
  toHeading: number | null,
  req: NavRequest,
  signal: AbortSignal | undefined,
  fromHeading: number | null | undefined,
  fast: boolean,
  exclude: LatLon[],
): Promise<Piece> {
  const body = {
    ...(exclude.length ? { exclude_locations: exclude.map(([lat, lon]) => ({ lat, lon })) } : {}),
    locations: [
      // mit Fahrtrichtung: weiterfahren statt wenden, wenn es vorne einen Weg zurück gibt
      { lat: from[0], lon: from[1], type: 'break', radius: 50, ...(fromHeading != null ? { heading: Math.round(fromHeading), heading_tolerance: 45 } : {}) },
      // Ankunft in Fahrtrichtung der Tour, damit man nicht falsch herum einsteigt
      { lat: to[0], lon: to[1], type: 'break', ...(toHeading != null ? { heading: Math.round(toHeading), heading_tolerance: 60 } : {}), minimum_reachability: 300 },
    ],
    // Weg auf die Tour (Zum Start, Einsteigen) und weite Anreise: schnellste Route, das Tourprofil gilt erst auf der Tour
    ...costingFor(fast || haversine(from, to) > LONG_APPROACH_M ? 'schnell' : req.profile, req.avoid),
    directions_options: DIRECTIONS,
  };
  return piece(await post('route', body, signal));
}

/**
 * Anfahrt und Weg zurück auf die Tour, geprüft wie bei der Planung: führt das Stück über Wirtschafts
 * oder Feldwege, Schotter oder Fußwege, wird es ohne diese Stellen neu gerechnet (Testfahrt 8.11.:
 * mehrmals ein paar hundert Meter Feldweg). Höchstens zwei Runden, sonst das beste Ergebnis.
 */
async function approach(from: LatLon, to: LatLon, toHeading: number | null, req: NavRequest, signal?: AbortSignal, fromHeading?: number | null, fast = false): Promise<Piece> {
  let exclude: LatLon[] = [];
  let best: { p: Piece; raus: number } | null = null;
  for (let round = 0; round < 3; round++) {
    let p: Piece;
    try {
      p = await approachOnce(from, to, toHeading, req, signal, fromHeading, fast, exclude);
    } catch (e) {
      if (best && !signal?.aborted) break;
      throw e;
    }
    if (p.shape.length < 2) return p;
    let raus = 0;
    let more: LatLon[] = [];
    try {
      const [c, closures] = await Promise.all([checkLine(p.shape, undefined, signal), closuresNear(p.shape, signal)]);
      raus = c.km_je_klasse?.raus ?? 0;
      if (raus > 0) more = blockedPoints(c.linie, [from, to]);
      // aktuelle Sperrungen aus Verkehrsmeldungen zählen wie gesperrte Stücke
      const hits = closuresOnRoute(p.shape, closures);
      if (hits.length) {
        raus += hits.length;
        more = [...more, ...closureExclude(hits, [from, to])];
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      // Prüfung nicht erreichbar: Route trotzdem nehmen
      return best && best.raus === 0 ? best.p : p;
    }
    if (!best || raus < best.raus) best = { p, raus };
    if (raus === 0 || !more.length) break;
    exclude = [...exclude, ...more];
  }
  return best!.p;
}

/** Punkte auf gesperrten Stücken, nicht direkt an Start und Ziel (dort muss man hin) */
function blockedPoints(linie: Tour['linie'], keepAway: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  for (const run of linie) {
    if (run.c !== 'raus') continue;
    let last: LatLon | null = null;
    for (const p of run.p) {
      if (last && haversine(last, p) < 150) continue;
      if (keepAway.some((w) => haversine(w, p) < 120)) continue;
      out.push(p);
      last = p;
    }
  }
  return out.slice(0, 20);
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
    const lead = await approach(from, line[0], h, req, signal, undefined, true);
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
      lead = await approach(from, line[j], h, req, signal, undefined, true);
    }
    tourLine = line.slice(j);
    if (tourLine.length < 2) tourLine = line.slice(-2);
  }

  const tour = await traceLine(tourLine, req, signal);

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
/** Fahrzeit in Sekunden vom Standort zu mehreren Punkten (Valhalla Matrix), null wo kein Weg. */
async function timesTo(from: LatLon, fromHeading: number | null | undefined, targets: LatLon[], req: NavRequest, signal?: AbortSignal): Promise<(number | null)[]> {
  const res = await fetch(`${VALHALLA_URL}/sources_to_targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [{ lat: from[0], lon: from[1], ...(fromHeading != null ? { heading: Math.round(fromHeading), heading_tolerance: 45 } : {}) }],
      targets: targets.map(([lat, lon]) => ({ lat, lon })),
      ...costingFor(req.profile, req.avoid),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Matrix ${res.status}`);
  const data = (await res.json()) as { sources_to_targets: { time: number | null }[][] };
  return data.sources_to_targets[0].map((c) => c.time ?? null);
}

/**
 * Bester Einstieg zurück in die Tour: nicht stur der nächste Punkt (der oft hinter einem liegt
 * und Wenden bedeutet), sondern der Punkt in den nächsten 2 km, an dem man am schnellsten wieder
 * auf der Tour ist, ohne viel von ihr auszulassen.
 */
async function bestRejoin(current: NavRoute, j0: number, from: LatLon, heading: number | null | undefined, req: NavRequest, signal?: AbortSignal): Promise<number> {
  const { shape, cumKm } = current;
  const base = cumKm[j0];
  const cands: number[] = [];
  for (const d of [0, 0.15, 0.3, 0.5, 0.8, 1.2, 2]) {
    let k = j0;
    while (k < shape.length - 2 && cumKm[k] - base < d) k++;
    if (!cands.includes(k)) cands.push(k);
  }
  // Dazu Stellen der Tour weiter hinten, die in Fahrtrichtung nah liegen: führt die eigene Straße
  // gleich wieder auf die Tour, soll man nicht wenden müssen (Testfahrt 8.11.)
  const ahead: { k: number; m: number }[] = [];
  for (let k = j0 + 1; k < shape.length - 1; k++) {
    if (cumKm[k] - base <= 2) continue;
    const m = haversine(from, shape[k]);
    if (m > 3000) continue;
    if (heading != null) {
      let diff = Math.abs(bearing(from, shape[k]) - heading) % 360;
      if (diff > 180) diff = 360 - diff;
      if (diff > 75) continue;
    }
    ahead.push({ k, m });
  }
  ahead.sort((a, b) => a.m - b.m);
  for (const a of ahead) {
    if (cands.length >= 13) break;
    if (cands.some((k) => Math.abs(cumKm[k] - cumKm[a.k]) < 0.4)) continue;
    cands.push(a.k);
  }
  try {
    const times = await timesTo(from, heading, cands.map((k) => shape[k]), req, signal);
    const secPerKm = current.km > 0 ? (current.minutes * 60) / current.km : 60;
    let best = j0;
    let bestCost = Infinity;
    cands.forEach((k, i) => {
      const t = times[i];
      if (t == null) return;
      // Möglichst früh zurück auf die Tour: ausgelassene Tour Kilometer kosten, aber nicht so viel,
      // dass man wenden muss, wenn die eigene Straße bald wieder auf die Tour führt (Testfahrt 8.11.:
      // dreifach war zu streng, die App bestand auf dem Zurückführen)
      // Koray 8.11. nach der Testfahrt: das verpasste Stück muss man nicht nachfahren. Es zählt fast nur
      // der schnellste Weg zurück auf die Tour, ein kleiner Abzug je ausgelassenem km verhindert nur,
      // dass große Teile der Tour abgekürzt werden.
      const cost = t + (cumKm[k] - base) * secPerKm * 0.25;
      if (cost < bestCost - 5) {
        bestCost = cost;
        best = k;
      }
    });
    return best;
  } catch (e) {
    if (signal?.aborted) throw e;
    return j0;
  }
}

/** Ab hier geht es nach einer Abweichung direkt zum Ziel statt zurück auf die Tour */
const NEAR_END_TOUR_KM = 3;
const NEAR_END_AIR_KM = 1.5;
const NEAR_END_MAX_KM = 10;

export async function rejoinNavRoute(
  req: NavRequest,
  current: NavRoute,
  doneIndex: number,
  from: LatLon,
  signal?: AbortSignal,
  heading?: number | null,
  /** schnellster Weg bis zum Wiedereinstieg (Zwischenziel überspringen, Koray 8.11.) */
  fast = false,
): Promise<NavRouteDetail> {
  const { shape } = current;
  const start = Math.max(0, Math.min(doneIndex, shape.length - 2));
  const j0 = nearestIndex(shape, from, start);
  const end = shape[shape.length - 1];
  // Kurz vor dem Ziel lohnt kein Umweg zurück auf die Tour: direkt zum Ziel (Wunsch Koray, 7.11.2026)
  // Luftlinie nur zusammen mit wenig Rest Tour, sonst würde eine Rundtour gleich am Anfang abgekürzt
  const remainKm = current.km - current.cumKm[j0];
  const nearEnd = remainKm <= NEAR_END_TOUR_KM || (haversine(from, end) / 1000 <= NEAR_END_AIR_KM && remainKm <= NEAR_END_MAX_KM);
  const j = nearEnd ? shape.length - 1 : j0 < shape.length - 1 && current.km - current.cumKm[j0] >= 0.05 ? await bestRejoin(current, j0, from, heading, req, signal) : j0;
  if (j >= shape.length - 1 || current.km - current.cumKm[j] < 0.05) {
    // praktisch am Ziel: direkt dorthin
    // Am Ziel ist die Richtung egal, sonst erzwingt Valhalla eine Ankunft nach Norden
    const lead = await approach(from, end, null, req, signal, heading, fast);
    const cumKm = cumulativeKm(lead.shape);
    const maneuvers = lead.maneuvers.filter((m) => m.type !== 27).map((m) => toManeuver(m, cumKm));
    return {
      route: { shape: lead.shape, cumKm, maneuvers, km: cumKm[cumKm.length - 1], minutes: lead.seconds / 60, source: 'valhalla' },
      tourStartIndex: 0,
    };
  }
  const h = bearing(shape[j], shape[j + 1]);
  const lead = await approach(from, shape[j], h, req, signal, heading, fast);
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
      rejoinIndex: join,
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
