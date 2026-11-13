/**
 * Bewertung von Rundtour Varianten (früher mit GraphHopper Free, graphhopper.com).
 * GraphHopper Free ist entfernt (Koray 13.11.): das kostenlose Paket ist nur nicht kommerziell erlaubt.
 * Die Rundtouren kommen aus dem eigenen Server, im Ersatzweg aus Valhalla. Hier bleiben nur Typ und Bewertung.
 */
import type { LatLon } from './tour';

export type GhRoute = {
  shape: LatLon[];
  km: number;
  minutes: number;
  /** Anteil der Strecke mit Kurvigkeit unter 0,8 (1 heißt gerade) */
  curvyShare: number;
  curves: number;
  /** km mit Höchstbreite unter 2,5 m */
  narrowKm: number;
  /** km mit unbefestigtem Belag laut GraphHopper */
  unpavedKm: number;
  /** km auf Autobahn und Schnellstraße */
  fastKm: number;
  seed: number;
};

/**
 * Bewertung einer Variante: Kurven pro 100 km und kurviger Anteil zählen positiv; Abzug für
 * Schmales, Unbefestigtes, Autobahn und Schnellstraße (Anteil) und Abweichung von der Wunschlänge.
 */
export function scoreRoute(r: GhRoute, targetKm: number): number {
  const per100 = r.km ? (r.curves / r.km) * 100 : 0;
  const lengthPenalty = Math.abs(r.km - targetKm) / targetKm;
  const fastShare = r.km ? r.fastKm / r.km : 0;
  return per100 + r.curvyShare * 40 - r.narrowKm * 15 - r.unpavedKm * 25 - fastShare * 60 - lengthPenalty * 30;
}
