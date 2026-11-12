/**
 * Gruppenfahrt: Position eines Mitfahrers zwischen zwei Meldungen fortschreiben (12.11.).
 * Positionen kommen höchstens alle 2 s. Ohne Fortschreiben springt der Punkt bei 80 km/h jedes Mal 44 m
 * und hängt bis zu 2 s hinterher. Mit Kurs und Tempo der letzten Meldung rechnen wir geradeaus weiter,
 * höchstens 3 s, damit ein Funkloch den Punkt nicht von der Straße schiebt.
 */
import type { LatLon } from '@/lib/tour';

export const POS_INTERVAL_MS = 2200;
const MAX_AHEAD_MS = 3000;

export function predictPosition(p: LatLon, heading: number | null | undefined, speedKmh: number | null | undefined, seenAt: number | null | undefined, at: number): LatLon {
  if (heading == null || speedKmh == null || seenAt == null || speedKmh < 5) return p;
  const dt = Math.max(0, Math.min(MAX_AHEAD_MS, at - seenAt)) / 1000;
  const d = (Math.min(speedKmh, 250) / 3.6) * dt;
  const r = (heading * Math.PI) / 180;
  return [p[0] + (d * Math.cos(r)) / 111320, p[1] + (d * Math.sin(r)) / (111320 * Math.cos((p[0] * Math.PI) / 180))];
}
