/**
 * Tempolimit entlang der Navigationsroute, für die Kurvenwarnung: nur in Zonen ab 70 km/h
 * (Wunsch Koray, 6.11.2026). Quelle: Valhalla trace_attributes auf der Routenlinie.
 * Ist maxspeed an einer Kante nicht eingetragen, gilt das Limit der vorigen eingetragenen Kante
 * derselben Straßenklasse (Schilder gelten bis zum nächsten Schild, aber nicht über eine Abfahrt
 * hinaus). Sonst wird geschätzt: Wohnstraßen und Zufahrten 50, im Ort 50, außerorts 100.
 * Geschätzte Werte zählen nur für die Kurvenwarnung, angezeigt wird nur ein bekanntes Schild
 * (sonst stand nach der Autobahn in der Stadt noch das Schild unbegrenzt, 7.11.2026).
 * Valhallas geschätztes Tempo taugt dafür nicht (alle Bundesstraßen 57 km/h, Messung 6.11.).
 * Wird stückweise geladen (etwa 40 km je Anfrage); onPart meldet jeden fertigen Teil.
 */
import { VALHALLA_URL } from '../valhalla';
import { lineKey, resample } from '../stats';
import type { LatLon } from '../tour';

export type SpeedZones = {
  /** Ende jeder Zone in km ab Start der Route, aufsteigend */
  endKm: number[];
  /** Tempolimit der Zone in km/h (geschätzt, wo kein Schild bekannt ist) */
  limit: number[];
  /** Ob das Limit der Zone aus einem Schild stammt (nur dann wird es angezeigt) */
  known: boolean[];
  /** bis hierhin ist geladen */
  loadedKm: number;
};

const STEP_M = 25;
const CHUNK_PTS = 1600;

type Edge = { length?: number; speed_limit?: number | string; road_class?: string; use?: string; density?: number };

const SMALL = new Set(['residential', 'service_other', 'service']);

function tagged(e: Edge): number | null {
  if (e.speed_limit === 'unlimited') return 130;
  return typeof e.speed_limit === 'number' && e.speed_limit > 0 ? e.speed_limit : null;
}

type Lim = { v: number; known: boolean; cls: string };

/** Limits je Kante; fehlende vom vorigen Schild derselben Straßenklasse übernehmen, sonst schätzen */
function edgeLimits(edges: Edge[], carry: Lim | null): Lim[] {
  let last = carry;
  return edges.map((e) => {
    const cls = e.road_class ?? '';
    const t = tagged(e);
    if (t != null) return (last = { v: t, known: true, cls });
    if (last && last.known && last.cls === cls) return { ...last };
    if (SMALL.has(cls) || e.use === 'living_street') return { v: 50, known: false, cls };
    if (cls === 'motorway') return { v: 130, known: false, cls };
    return { v: (e.density ?? 0) <= 1 ? 100 : 50, known: false, cls };
  });
}

/** Fertig geladene Zonen je Route (Neustart der Navigation, gleiche Tour) */
const zoneCache = new Map<string, SpeedZones>();

export async function loadSpeedZones(shape: LatLon[], onPart: (z: SpeedZones) => void, signal?: AbortSignal): Promise<SpeedZones> {
  const pts = resample(shape, STEP_M);
  const key = lineKey(pts);
  const hit = zoneCache.get(key);
  if (hit) {
    onPart(hit);
    return hit;
  }
  const zones: SpeedZones = { endKm: [], limit: [], known: [], loadedKm: 0 };
  let carry: Lim | null = null;
  for (let a = 0; a < pts.length - 1; a += CHUNK_PTS - 1) {
    const part = pts.slice(a, Math.min(pts.length, a + CHUNK_PTS));
    const startKm = (a * STEP_M) / 1000;
    const partKm = ((part.length - 1) * STEP_M) / 1000;
    const res = await fetch(`${VALHALLA_URL}/trace_attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: part.map(([lat, lon]) => ({ lat, lon })),
        costing: 'auto',
        shape_match: 'map_snap',
        filters: { attributes: ['edge.length', 'edge.speed_limit', 'edge.road_class', 'edge.use', 'edge.density'], action: 'include' },
      }),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as { edges?: Edge[] };
    if (!res.ok || !data.edges?.length) throw new Error('Tempolimits nicht verfügbar');
    // Kantenlängen auf die Länge des Stücks strecken, damit die km zur Route passen
    const sum = data.edges.reduce((s, e) => s + (e.length ?? 0), 0) || 1;
    let km = startKm;
    const lims = edgeLimits(data.edges, carry);
    carry = lims[lims.length - 1] ?? carry;
    for (const [k, e] of data.edges.entries()) {
      km += ((e.length ?? 0) / sum) * partKm;
      const lim = lims[k];
      const n = zones.limit.length;
      if (n && zones.limit[n - 1] === lim.v && zones.known[n - 1] === lim.known) zones.endKm[n - 1] = km;
      else {
        zones.endKm.push(km);
        zones.limit.push(lim.v);
        zones.known.push(lim.known);
      }
    }
    zones.loadedKm = startKm + partKm;
    onPart({ ...zones, endKm: [...zones.endKm], limit: [...zones.limit], known: [...zones.known] });
  }
  zoneCache.set(key, zones);
  if (zoneCache.size > 6) zoneCache.delete(zoneCache.keys().next().value!);
  return zones;
}

/** Tempolimit bei km, null wenn dort noch nichts geladen ist. onlyKnown: nur echte Schilder. */
export function limitAt(z: SpeedZones | null, km: number, onlyKnown = false): number | null {
  if (!z || km > z.loadedKm) return null;
  for (let i = 0; i < z.endKm.length; i++) if (km <= z.endKm[i]) return onlyKnown && !z.known[i] ? null : z.limit[i];
  return null;
}
