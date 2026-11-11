/**
 * Empfehlungen zum Einkehren (Koray 11.11.): kuratierte Restaurants, die sich für Sportwagen eignen (Parkplatz, Lage an
 * schönen Strecken, Treffpunkte der Szene). Eigene Cafés gibt es nicht mehr, einen Kaffee bekommt man in jedem
 * Restaurant. Der Tab Essen zeigt nur diese;
 * die freie Ortssuche findet weiterhin jedes Lokal.
 *
 * Quelle: Korays Recherche, jeder Eintrag gegen OpenStreetMap geprüft (Name am Ort gefunden), Position aus OSM.
 * Daten in src/data/recommended-stops.json, Aufbereitung in routing/data/stops/README.md.
 */
import RAW from '@/data/recommended-stops.json';

import { haversine, type LatLon } from './tour';

export type RecommendedStop = {
  id: string;
  name: string;
  /** mittag, kaffee oder beides */
  kinds: ('mittag' | 'kaffee')[];
  p: LatLon;
  region: string;
  /** Küche und Charakter, kurz */
  food: string;
  /** Hinweis zum Parken */
  parking: string;
  web?: string;
  /** Land (DE, AT, CH, IT, SI) */
  land?: string;
};

export const RECOMMENDED: RecommendedStop[] = (RAW as unknown as { stops: RecommendedStop[] }).stops;

/** Empfehlungen einer Art im Umkreis um einen Punkt, nächste zuerst */
export function recommendedNear(_kind: 'mittag' | 'kaffee', at: LatLon, radiusM: number): (RecommendedStop & { distM: number })[] {
  const out: (RecommendedStop & { distM: number })[] = [];
  for (const r of RECOMMENDED) {
    if (Math.abs(r.p[0] - at[0]) > radiusM / 100000 + 0.01) continue;
    const distM = haversine(at, r.p);
    if (distM <= radiusM) out.push({ ...r, distM });
  }
  return out.sort((a, b) => a.distM - b.distM);
}
