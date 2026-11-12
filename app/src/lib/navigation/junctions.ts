/**
 * Kreuzungen genauer ansehen, als die Abbiegehinweise von Valhalla es tun (Navigationsklassiker, Koray 12.11.):
 *
 * Kreisverkehr: Valhalla zählt jede befahrbare Ausfahrt, auch die Zufahrt zur Tankstelle oder den Wirtschaftsweg.
 * Am Kreisel Heppenheim B 460 wurde so aus der ersten echten Ausfahrt die "2. Ausfahrt". Liegt vor unserer
 * Ausfahrt eine solche Nebenausfahrt, ist die Zahl unsicher: dann sagt die App die Richtung statt der Zahl.
 *
 * Gabelung: Teilt sich die Straße und unsere Richtung behält den Namen, gibt Valhalla oft keinen Hinweis.
 * Liegt neben unserem Weg ein zweiter, ähnlich wichtiger oder geraderer Weg in spitzem Winkel, kommt
 * "Links halten" oder "Rechts halten" dazu.
 *
 * Beides über trace_attributes für ein kurzes Stück der Route. Reine Rechnung getrennt vom Abruf, damit testbar.
 */
import { VALHALLA_URL, decodePolyline6 } from '../valhalla';
import { haversine, type LatLon } from '../tour';
import type { Maneuver, NavRoute } from './types';

type XEdge = { driveability?: string; use?: string; road_class?: string; begin_heading?: number };
export type VEdge = {
  roundabout?: boolean;
  begin_shape_index: number;
  end_shape_index: number;
  names?: string[];
  road_class?: string;
  use?: string;
  begin_heading?: number;
  end_heading?: number;
  end_node?: { intersecting_edges?: XEdge[] };
};

const ATTRS = [
  'shape',
  'edge.roundabout',
  'edge.begin_shape_index',
  'edge.end_shape_index',
  'edge.names',
  'edge.road_class',
  'edge.use',
  'edge.begin_heading',
  'edge.end_heading',
  'node.intersecting_edge.driveability',
  'node.intersecting_edge.use',
  'node.intersecting_edge.road_class',
  'node.intersecting_edge.begin_heading',
];

/** Kanten und Linie für ein Stück der Route (eingerastet auf das Straßennetz) */
export async function edgesAlong(points: LatLon[], signal?: AbortSignal): Promise<{ edges: VEdge[]; shape: LatLon[] }> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${VALHALLA_URL}/trace_attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: points.map(([lat, lon]) => ({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) })),
        costing: 'auto',
        shape_match: 'map_snap',
        filters: { attributes: ATTRS, action: 'include' },
      }),
      signal: ctrl.signal,
    });
    const data = (await res.json()) as { edges?: VEdge[]; shape?: string };
    return { edges: data.edges ?? [], shape: data.shape ? decodePolyline6(data.shape) : [] };
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

const norm = (a: number) => ((((a % 360) + 540) % 360) - 180);
const outgoing = (x: XEdge) => x.driveability === 'forward' || x.driveability === 'both';
/** Nebenausfahrten: Zufahrten, Parkplätze, Wirtschafts und Feldwege */
const MINOR_USE = new Set(['service_road', 'driveway', 'parking_aisle', 'alley', 'drive_through', 'emergency_access', 'track']);
const isMinor = (x: { use?: string; road_class?: string }) => MINOR_USE.has(x.use ?? '') || x.road_class === 'service_other';

/**
 * Ausfahrten bis zu unserer im ersten Kreisverkehr der Kanten: all zählt jede befahrbare (wie Valhalla),
 * real nur echte Straßen. Null, wenn kein Kreisverkehr dabei ist.
 */
export function roundaboutExits(edges: VEdge[]): { all: number; real: number } | null {
  const start = edges.findIndex((e) => e.roundabout);
  if (start < 0) return null;
  let end = start;
  while (end + 1 < edges.length && edges[end + 1].roundabout) end++;
  let all = 1;
  let real = 1;
  // an den Knoten zwischen den Kanten im Kreisel; am Ende der letzten Kante liegt unsere Ausfahrt
  for (let i = start; i < end; i++) {
    for (const x of edges[i].end_node?.intersecting_edges ?? []) {
      if (!outgoing(x)) continue;
      all++;
      if (!isMinor(x)) real++;
    }
  }
  return { all, real };
}

/** Richtung der Ausfahrt in Worten, aus dem gemessenen Winkel (rechts positiv) */
export function exitWord(turn: number | null | undefined): string | null {
  if (turn == null) return null;
  const a = Math.abs(turn);
  if (a < 40) return 'geradeaus';
  if (a > 150) return 'zurück';
  return turn > 0 ? 'rechts' : 'links';
}

/** Kreisverkehr mit unsicherer Zahl: Richtung statt Ausfahrt (Text, Ansage, Symbol ohne Zahl) */
export function roundaboutByDirection(m: Maneuver, word: string): Maneuver {
  const where = m.street ? ` auf ${m.street}` : '';
  const how = word === 'zurück' ? 'ganz herum und zurück' : word;
  return {
    ...m,
    exit: undefined,
    text: `Im Kreisverkehr ${how}${where}`,
    speech: `In den Kreisverkehr fahren und ${how} wieder hinaus${where ? `,${where}` : ''}.`,
  };
}

const RANK: Record<string, number> = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 6, service_other: 7 };
const rank = (c?: string) => RANK[c ?? ''] ?? 6;
/** So spitz muss der Winkel zwischen beiden Ästen sein */
const FORK_DEG = 35;

export type Fork = { at: LatLon; keep: 'links' | 'rechts'; street?: string };

/** Gabelungen auf den Kanten: unser Ast und ein zweiter, gleich wichtiger oder geraderer Ast in spitzem Winkel */
export function forksIn(edges: VEdge[], shape: LatLon[]): Fork[] {
  const out: Fork[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i];
    const b = edges[i + 1];
    if (a.roundabout || b.roundabout || a.end_heading == null || b.begin_heading == null) continue;
    const inH = a.end_heading;
    const ours = b.begin_heading;
    const tOurs = Math.abs(norm(ours - inH));
    for (const x of a.end_node?.intersecting_edges ?? []) {
      if (!outgoing(x) || isMinor(x) || x.begin_heading == null) continue;
      // Abfahrten und Abbiegespuren neben der Straße sind keine Gabelung, außer eine Rampe teilt sich selbst
      if ((x.use === 'ramp' && b.use !== 'ramp') || x.use === 'turn_channel') continue;
      const between = norm(ours - x.begin_heading);
      if (Math.abs(between) > FORK_DEG) continue;
      const tX = Math.abs(norm(x.begin_heading - inH));
      const comparable = rank(x.road_class) <= rank(b.road_class) + 1;
      const straighter = tX + 15 < tOurs;
      if (!comparable && !straighter) continue;
      const at = shape[Math.min(a.end_shape_index, shape.length - 1)];
      if (!at) continue;
      out.push({ at, keep: between < 0 ? 'links' : 'rechts', street: b.names?.[0] });
      break;
    }
  }
  return out;
}

/** Abstand, in dem ein vorhandenes Manöver die Gabelung schon abdeckt */
const COVERED_M = 120;

/** Gabelungen als Manöver in die Route, wo kein Hinweis in der Nähe ist; liefert null ohne Änderung */
export function withForks(route: NavRoute, forks: Fork[], fromIndex: number, toIndex: number): NavRoute | null {
  const add: Maneuver[] = [];
  for (const f of forks) {
    let best = -1;
    let bd = Infinity;
    for (let i = Math.max(0, fromIndex); i <= Math.min(toIndex, route.shape.length - 1); i++) {
      const d = haversine(route.shape[i], f.at);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0 || bd > 30) continue;
    const km = route.cumKm[best];
    if (route.maneuvers.some((m) => Math.abs(m.km - km) * 1000 < COVERED_M) || add.some((m) => Math.abs(m.km - km) * 1000 < COVERED_M)) continue;
    const head = f.keep === 'links' ? 'Links halten' : 'Rechts halten';
    add.push({
      kind: f.keep === 'links' ? 'links_halten' : 'rechts_halten',
      text: head,
      speech: f.street ? `${head}, auf ${f.street}.` : `${head}.`,
      ...(f.street ? { street: f.street } : {}),
      index: best,
      km,
    });
  }
  if (!add.length) return null;
  return { ...route, maneuvers: [...route.maneuvers, ...add].sort((x, y) => x.km - y.km || x.index - y.index) };
}

/** Punkte der Route zwischen zwei km, etwa alle stepM Meter (für die Anfrage) */
export function slice(route: NavRoute, fromKm: number, toKm: number, stepM = 25): { points: LatLon[]; from: number; to: number } {
  const pts: LatLon[] = [];
  let from = -1;
  let to = -1;
  let last: LatLon | null = null;
  for (let i = 0; i < route.shape.length; i++) {
    const km = route.cumKm[i];
    if (km < fromKm) continue;
    if (km > toKm) break;
    if (from < 0) from = i;
    to = i;
    const p = route.shape[i];
    if (last && haversine(last, p) < stepM && i < route.shape.length - 1) continue;
    pts.push(p);
    last = p;
  }
  return { points: pts, from, to };
}
