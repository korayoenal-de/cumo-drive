/**
 * Tempolimit entlang der Navigationsroute, für die Kurvenwarnung: nur in Zonen ab 70 km/h
 * (Wunsch Koray, 6.11.2026). Quelle: Valhalla trace_attributes auf der Routenlinie.
 * Ist maxspeed an einer Kante nicht eingetragen, gilt das Limit der vorigen eingetragenen Kante
 * derselben Straßenklasse (Schilder gelten bis zum nächsten Schild, aber nicht über eine Abfahrt
 * hinaus). Sonst wird geschätzt: Wohnstraßen und Zufahrten 50, im Ort 50, außerorts 100.
 * Geschätzte Werte zählen für die Kurvenwarnung; angezeigt wird ein bekanntes Schild (sonst stand nach der
 * Autobahn in der Stadt noch das Schild unbegrenzt, 7.11.2026) und seit 12.11. außerorts ohne Eintrag die
 * geschätzten 100 als graue Plakette (shownLimitAt), aber nicht im Kreisverkehr und nicht auf kurzen Lücken.
 * Valhallas geschätztes Tempo taugt dafür nicht (alle Bundesstraßen 57 km/h, Messung 6.11.).
 * Wird stückweise geladen (etwa 40 km je Anfrage); onPart meldet jeden fertigen Teil.
 */
import { valhallaFetch } from '../valhalla';
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

type Edge = { length?: number; speed_limit?: number | string; road_class?: string; use?: string; density?: number; names?: string[]; roundabout?: boolean };

/** Straßennummer statt Straßenname: B 47, L 3345, K 65, A 5, E 35, St 2068, SS 12, D 902 */
const REF = /^\p{L}{1,3}\s?\d+\s?\p{L}?$/u;
/** Trägt die Kante einen Straßennamen (Rohrheimer Straße)? Nur eine Nummer oder gar kein Name zählt nicht. */
function hasStreetName(e: Edge): boolean {
  return (e.names ?? []).some((n) => !REF.test(n.trim()));
}
/** Trägt die Kante nur eine Straßennummer? Das ist die freie Strecke zwischen zwei Orten. */
function refOnly(e: Edge): boolean {
  return !!e.names?.length && !hasStreetName(e);
}
/** Bis zu diesem Tempo gilt ein Schild als Ortstempo, das am Ortsausgang endet */
const TOWN_MAX = 50;
/** So weit darf ein Ortstempo ohne Straßennamen weitergelten (Kreisverkehr, kurze Lücke in den Daten) */
const TOWN_CARRY_M = 150;

const SMALL = new Set(['residential', 'service_other', 'service']);

function tagged(e: Edge): number | null {
  if (e.speed_limit === 'unlimited') return 130;
  return typeof e.speed_limit === 'number' && e.speed_limit > 0 ? e.speed_limit : null;
}

type Lim = { v: number; known: boolean; cls: string; /** Meter ohne Schild und ohne Straßennamen seit dem letzten Schild */ openM?: number };

/**
 * Limits je Kante; fehlende vom vorigen Schild derselben Straßenklasse übernehmen, sonst schätzen.
 * Ein Ortstempo (bis 50) endet am Ortsausgang: Dort steht kein neues Schild in den Daten, die Straße verliert
 * aber ihren Namen und trägt nur noch die Nummer. Nach TOWN_CARRY_M ohne Straßennamen gilt es nicht mehr
 * (Koray 12.11.: L 3345 hinter Schwanheim zeigte bis zur K 65 noch 50, dort sind 80).
 */
export function edgeLimits(edges: Edge[], carry: Lim | null): Lim[] {
  let last = carry;
  return edges.map((e) => {
    const cls = e.road_class ?? '';
    const t = tagged(e);
    if (t != null) return (last = { v: t, known: true, cls, openM: 0 });
    // Kreisverkehr ohne Schild (Koray 13.11.: am Ortsrand stand kurz die graue 100): ein Schild davor gilt
    // weiter, sonst 50 schätzen und nichts anzeigen; danach geht es weiter wie vor dem Kreisverkehr
    if (e.roundabout) return last && last.known ? { ...last } : { v: 50, known: false, cls };
    if (last && last.known && last.cls === cls) {
      if (last.v > TOWN_MAX) return { ...last };
      const openM = hasStreetName(e) ? 0 : (last.openM ?? 0) + (e.length ?? 0) * 1000;
      if (openM <= TOWN_CARRY_M) return (last = { ...last, openM });
      last = null;
    }
    if (SMALL.has(cls) || e.use === 'living_street') return { v: 50, known: false, cls };
    if (cls === 'motorway') return { v: 130, known: false, cls };
    return { v: (e.density ?? 0) <= 1 || refOnly(e) ? 100 : 50, known: false, cls };
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
    const res = await valhallaFetch('trace_attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: part.map(([lat, lon]) => ({ lat, lon })),
        costing: 'auto',
        shape_match: 'map_snap',
        filters: { attributes: ['edge.length', 'edge.speed_limit', 'edge.road_class', 'edge.use', 'edge.density', 'edge.names', 'edge.roundabout'], action: 'include' },
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

/** Geschätzte Limits, die angezeigt werden dürfen: nur die freie Strecke außerorts (Koray 12.11.) */
const SHOW_ESTIMATE = 100;
/** Kürzere Stücke mit geschätzten 100 zwischen zwei anderen Zonen werden nicht gezeigt (Lücken in den Daten) */
const SHOW_ESTIMATE_MIN_KM = 0.5;

/**
 * Limit für die Anzeige bei km: ein bekanntes Schild, oder außerorts ohne Eintrag die geschätzten 100,
 * dann mit estimated (graue Plakette ohne roten Ring). Im Ort und auf der Autobahn wird weiter nicht geraten.
 */
export function shownLimitAt(z: SpeedZones | null, km: number): { limit: number; estimated: boolean } | null {
  if (!z || km > z.loadedKm) return null;
  for (let i = 0; i < z.endKm.length; i++) {
    if (km > z.endKm[i]) continue;
    if (z.known[i]) return { limit: z.limit[i], estimated: false };
    if (z.limit[i] !== SHOW_ESTIMATE) return null;
    const from = i > 0 ? z.endKm[i - 1] : 0;
    const closed = i < z.endKm.length - 1;
    if (closed && z.endKm[i] - from < SHOW_ESTIMATE_MIN_KM) return null;
    return { limit: z.limit[i], estimated: true };
  }
  return null;
}
