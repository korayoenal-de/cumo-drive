/**
 * Anbindung an einen Valhalla Routenplaner.
 * Prototyp: öffentlicher Server von FOSSGIS (OSM Daten, faire Nutzung, kein Schlüssel).
 * Später ersetzt durch einen eigenen Server mit Sportwagen Profil.
 */
import type { LatLon, Profile } from './tour';

/** Öffentlicher Valhalla (FOSSGIS): nur noch Notfall, höchstens eine Anfrage je Sekunde */
export const VALHALLA_URL = 'https://valhalla1.openstreetmap.de';

/**
 * Eigener Valhalla auf Server 2 (13.11.): aus derselben Karte wie unser GraphHopper, mit Höhendaten.
 * Antwortet er nicht (Neubau dienstags nachts, Ausfall), fragt die App 5 Minuten lang FOSSGIS.
 */
const OWN_VALHALLA = ['https://13-140-213-114.sslip.io/valhalla'];
const OWN_DOWN_MS = 5 * 60 * 1000;
let ownDownUntil = 0;

/**
 * Anfrage an Valhalla: zuerst der eigene, bei Netzfehler, 404 (Pfad noch nicht eingerichtet) oder 5xx der
 * öffentliche. Andere Antworten (etwa 400, keine Route) gibt sie unverändert zurück.
 */
export async function valhallaFetch(path: string, init: RequestInit): Promise<Response> {
  if (Date.now() >= ownDownUntil) {
    for (const base of OWN_VALHALLA) {
      try {
        const res = await fetch(`${base}/${path}`, init);
        if (res.status !== 404 && res.status < 500) return res;
      } catch (e) {
        if (init.signal?.aborted) throw e;
      }
    }
    ownDownUntil = Date.now() + OWN_DOWN_MS;
  }
  // Notfall: öffentlicher Server (vorher rief sich die Funktion hier selbst auf, endlos; Koray 14.11.)
  return fetch(`${VALHALLA_URL}/${path}`, init);
}

export type Avoid = {
  /** gesperrte Straßen meiden (bei uns immer Standard) */
  closures: boolean;
  ferries: boolean;
  tolls: boolean;
  /** Kopfsteinpflaster und rauer Belag */
  rough: boolean;
};

export const DEFAULT_AVOID: Avoid = { closures: true, ferries: false, tolls: false, rough: true };

/** Übersetzt unsere Profile in Valhalla Costing Optionen für Autos. */
export function costingFor(profile: Profile, avoid: Avoid) {
  const highways = { kurvig: 0, paesse: 0, entspannt: 0.2, schnell: 1 }[profile];
  return {
    costing: 'auto',
    costing_options: {
      auto: {
        use_highways: highways,
        use_tolls: avoid.tolls ? 0 : 0.5,
        use_ferry: avoid.ferries ? 0 : 0.5,
        use_tracks: 0,
        use_living_streets: 0,
        exclude_unpaved: true,
        service_penalty: 600,
        // Anliegerstraßen und Zufahrten (Mossauer Weg am 5.11.) nur, wenn es nicht anders geht
        destination_only_penalty: 1800,
        ignore_closures: !avoid.closures,
        shortest: false,
      },
    },
  };
}

/** Dekodiert eine Valhalla Polyline (Genauigkeit 6). */
export function decodePolyline6(str: string): LatLon[] {
  const out: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lon += delta;
    }
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await valhallaFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Fehler ${res.status}`;
    throw new Error(`Routenplaner: ${msg}`);
  }
  return data as T;
}

export type RouteResult = { shape: LatLon[]; km: number; minutes: number };

/** Route durch alle Punkte in Reihenfolge. */
/** Der öffentliche Valhalla Server nimmt höchstens 10 Punkte pro Anfrage. */
const MAX_LOCATIONS = 10;

/**
 * Route über beliebig viele Punkte: lange Listen werden in Stücke zu je höchstens 10 Punkten
 * geteilt (das Ende eines Stücks ist der Anfang des nächsten) und wieder zusammengesetzt.
 */
export async function route(
  points: LatLon[],
  profile: Profile,
  avoid: Avoid,
  signal?: AbortSignal,
  exclude: LatLon[] = [],
  snapMajor = false,
): Promise<RouteResult> {
  if (points.length <= MAX_LOCATIONS) return routeChunk(points, profile, avoid, signal, exclude, snapMajor);
  const out: RouteResult = { shape: [], km: 0, minutes: 0 };
  for (let a = 0; a < points.length - 1; a += MAX_LOCATIONS - 1) {
    const part = points.slice(a, Math.min(points.length, a + MAX_LOCATIONS));
    if (part.length < 2) break;
    const r = await routeChunk(part, profile, avoid, signal, exclude, snapMajor);
    out.shape.push(...(out.shape.length ? r.shape.slice(1) : r.shape));
    out.km += r.km;
    out.minutes += r.minutes;
  }
  return out;
}

async function routeChunk(
  points: LatLon[],
  profile: Profile,
  avoid: Avoid,
  signal?: AbortSignal,
  exclude: LatLon[] = [],
  /** true: Via Punkte nur an Straßen ab Klasse tertiary (für erzeugte Punkte wie bei der Rundtour) */
  snapMajor = false,
): Promise<RouteResult> {
  type Resp = { trip: { legs: { shape: string }[]; summary: { length: number; time: number } } };
  const r = await post<Resp>(
    'route',
    {
      // minimum_reachability verhindert, dass Punkte auf abgeschnittenen Straßenstücken einrasten
      locations: points.map(([lat, lon], i) => ({
        lat,
        lon,
        type: i === 0 || i === points.length - 1 ? 'break' : 'through',
        minimum_reachability: 300,
        // Start und Ziel mit 300 m Umkreis: mit 0 rastet ein Ortsmittelpunkt auf einem Kiesweg ein, den
        // exclude_unpaved sperrt, und es gibt gar keine Route (Tegernsee 8.11.: jede Rundtour scheiterte)
        radius: i === 0 || i === points.length - 1 ? 300 : 2000,
        // Via Punkte nur an richtigen Straßen einrasten lassen, nie an Forst oder Feldwegen
        ...(i === 0 || i === points.length - 1 || !snapMajor ? {} : { search_filter: { min_road_class: 'tertiary', exclude_ramp: true } }),
      })),
      ...costingFor(profile, avoid),
      // Stellen, die der Etappen Check gesperrt hat
      ...(exclude.length ? { exclude_locations: exclude.map(([lat, lon]) => ({ lat, lon })) } : {}),
      units: 'kilometers',
      directions_type: 'none',
    },
    signal,
  );
  const shape: LatLon[] = [];
  for (const leg of r.trip.legs) {
    const pts = decodePolyline6(leg.shape);
    shape.push(...(shape.length ? pts.slice(1) : pts));
  }
  return { shape, km: r.trip.summary.length, minutes: r.trip.summary.time / 60 };
}

export type Edge = {
  length?: number;
  road_class?: string;
  use?: string;
  surface?: string;
  unpaved?: boolean;
  lane_count?: number;
  names?: string[];
  begin_shape_index?: number;
  end_shape_index?: number;
};

/** Gleicht eine Linie mit dem Straßennetz ab und liefert Kantendaten. */
export async function traceAttributes(shape: LatLon[], signal?: AbortSignal): Promise<{ edges: Edge[]; shape: LatLon[] }> {
  type Resp = { edges: Edge[]; shape: string };
  const r = await post<Resp>(
    'trace_attributes',
    {
      shape: shape.map(([lat, lon]) => ({ lat, lon })),
      costing: 'auto',
      shape_match: 'map_snap',
      filters: {
        attributes: [
          'edge.length', 'edge.road_class', 'edge.use', 'edge.surface', 'edge.unpaved', 'edge.lane_count',
          'edge.names', 'edge.begin_shape_index', 'edge.end_shape_index', 'shape',
        ],
        action: 'include',
      },
    },
    signal,
  );
  return { edges: r.edges ?? [], shape: r.shape ? decodePolyline6(r.shape) : [] };
}
