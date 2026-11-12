/**
 * Richtung mit Ort an Abzweigungen (Tester Gregor 12.11.): „In Richtung Groß-Rohrheim“ gab es nur, wo in den
 * Kartendaten ein Wegweiser eingetragen ist. Sonst blieb „Rechts auf L 3345 abbiegen“, und mit einer Nummer
 * kann beim Fahren kaum jemand etwas anfangen. Hier sucht die App den nächsten Ort, durch den oder an dem
 * die Route nach dem Abbiegen vorbeiführt, über die eigene Ortssuche (Orte im Umkreis von Punkten voraus).
 * Das ist der nächste Ort an der Strecke, nicht zwingend der vom Schild; die Richtung stimmt immer.
 */
import { photonFetch } from '../photon';
import { haversine, type LatLon } from '../tour';
import { pointAtKm } from './tracker';
import type { Maneuver, ManeuverKind, NavRoute } from './types';

/** So weit voraus wird ein Ort gesucht, in diesen Schritten */
const PROBE_KM = [1.2, 2.8, 4.5, 7, 10];
/** Ein Ort zählt als „an der Strecke“, wenn sein Mittelpunkt so nah an der Route liegt */
const ON_ROUTE_M = 1200;

const BASE: Partial<Record<ManeuverKind, string>> = {
  links: 'Links abbiegen',
  rechts: 'Rechts abbiegen',
  leicht_links: 'Leicht links halten',
  leicht_rechts: 'Leicht rechts halten',
  scharf_links: 'Scharf links abbiegen',
  scharf_rechts: 'Scharf rechts abbiegen',
  links_halten: 'Links halten',
  rechts_halten: 'Rechts halten',
  abfahrt: 'Abfahren',
  abfahrt_links: 'Links abfahren',
  abfahrt_rechts: 'Rechts abfahren',
  auffahrt: 'Auffahren',
  auffahrt_links: 'Links auffahren',
  auffahrt_rechts: 'Rechts auffahren',
  kreisverkehr: 'In den Kreisverkehr',
};

/** Braucht dieses Manöver einen Ort? Nicht, wenn der Wegweiser schon einen nennt */
export function wantsToward(m: Maneuver): boolean {
  if (m.toward || !BASE[m.kind]) return false;
  if (/richtung/i.test(m.text)) return false;
  if (m.kind === 'kreisverkehr' && !m.exit) return false;
  return true;
}

type Place = { name: string; p: LatLon };
const cache = new Map<string, Place[]>();

async function placesNear(p: LatLon, signal?: AbortSignal): Promise<Place[]> {
  const key = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await photonFetch(`/reverse?lat=${p[0].toFixed(5)}&lon=${p[1].toFixed(5)}&lang=de&layer=city&radius=4&limit=4`, signal);
  const data = (await res.json()) as { features?: { properties: { name?: string }; geometry: { coordinates: [number, number] } }[] };
  const out = (data.features ?? [])
    .filter((f) => f.properties.name)
    .map((f) => ({ name: f.properties.name!, p: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as LatLon }));
  cache.set(key, out);
  if (cache.size > 400) cache.delete(cache.keys().next().value!);
  return out;
}

/** kleinster Abstand eines Punkts zu den Routenpunkten zwischen den Indizes a und b */
function distToRoute(route: NavRoute, p: LatLon, a: number, b: number): number {
  let best = Infinity;
  for (let i = a; i <= b && i < route.shape.length; i += 2) best = Math.min(best, haversine(p, route.shape[i]));
  return best;
}

/** Nächster Ort an der Route nach dem Manöver, null wenn keiner in Reichweite ist */
export async function townAfter(route: NavRoute, m: Maneuver, signal?: AbortSignal): Promise<string | null> {
  const at = route.shape[m.index];
  // der Ort, in dem man gerade abbiegt, zählt nicht
  const here = (await placesNear(at, signal)).filter((x) => haversine(x.p, at) < 1500).map((x) => x.name);
  const endKm = route.cumKm[route.cumKm.length - 1];
  for (const d of PROBE_KM) {
    const km = m.km + d;
    if (km > endKm) break;
    const probe = pointAtKm(route, km).point;
    const places = await placesNear(probe, signal);
    // Index der Route bis zu dieser Stelle (grob), dort muss der Ort liegen
    let b = m.index;
    while (b < route.cumKm.length - 1 && route.cumKm[b] < km + 1) b++;
    const hits = places
      .filter((x) => !here.includes(x.name))
      .map((x) => ({ x, d: distToRoute(route, x.p, m.index, b) }))
      .filter((h) => h.d < ON_ROUTE_M)
      .sort((u, v) => u.d - v.d);
    if (hits.length) return hits[0].x.name;
  }
  return null;
}

/** Manöver mit Ort: kurze Anweisung zum Lesen, Straße bleibt darunter, Ansage ohne Straßennummer */
export function withToward(m: Maneuver, town: string): Maneuver {
  const base = BASE[m.kind]!;
  if (m.kind === 'kreisverkehr') {
    return {
      ...m,
      toward: town,
      text: `Kreisverkehr, ${m.exit}. Ausfahrt Richtung ${town}`,
      speech: `In den Kreisverkehr fahren und die ${m.exit}. Ausfahrt nehmen, Richtung ${town}.`,
    };
  }
  return { ...m, toward: town, text: `${base} Richtung ${town}`, speech: `${base}, Richtung ${town}.` };
}
