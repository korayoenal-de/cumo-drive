/**
 * Richtung, in die ein Kreisverkehr verlassen wird (Grad, rechts positiv, 180 heißt zurück).
 * Die Ausfahrt Nummer allein sagt das nicht: die 4. Ausfahrt kann links sein oder zurück
 * (Testfahrt 7.11.: Symbol zeigte links, obwohl gewendet wurde). Darum aus der Linie gemessen.
 */
import { pointAtKm } from './tracker';
import type { NavRoute } from './types';

const norm = (a: number) => ((((a % 360) + 540) % 360) - 180);

export function roundaboutTurn(route: NavRoute, i: number): number | null {
  const m = route.maneuvers[i];
  if (!m || m.kind !== 'kreisverkehr' || route.shape.length < 3) return null;
  const inHeading = pointAtKm(route, Math.max(0, m.km - 0.02)).heading;
  const next = route.maneuvers[i + 1];
  // mit eigener Ausfahrt Anweisung: Richtung kurz nach der Ausfahrt, sonst Lage 120 m nach der Einfahrt
  if (next && next.kind === 'kreisverkehr_verlassen' && next.km - m.km < 0.5) {
    const out = pointAtKm(route, Math.min(route.km, next.km + 0.03)).heading;
    return norm(out - inHeading);
  }
  const a = pointAtKm(route, m.km).point;
  const b = pointAtKm(route, Math.min(route.km, m.km + 0.12)).point;
  if (a[0] === b[0] && a[1] === b[1]) return null;
  const k = Math.cos((a[0] * Math.PI) / 180);
  const dir = (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI;
  return norm(dir - inHeading);
}

/**
 * Richtung, in die ein Manöver führt (Grad, rechts positiv, 0 geradeaus), für Kombiinstrument und Head-up Display
 * (Koray 21.11., Testrunde: ohne Winkel zeigte der BMW bei Abbiegungen nur die Meter, und den Kreisverkehr mit der
 * 2. Ausfahrt geradeaus zeichnete er mit Ausfahrt bei 9 Uhr). Kreisverkehr wie roundaboutTurn, sonst die Richtung
 * 20 m vor gegen 30 m nach dem Manöver.
 */
export function maneuverAngle(route: NavRoute, i: number): number | null {
  const m = route.maneuvers[i];
  if (!m || route.shape.length < 3) return null;
  if (m.kind === 'kreisverkehr') return roundaboutTurn(route, i);
  if (m.kind === 'start' || m.kind.startsWith('ziel') || m.kind === 'zwischenziel') return null;
  const a = pointAtKm(route, Math.max(0, m.km - 0.02)).heading;
  const b = pointAtKm(route, Math.min(route.km, m.km + 0.03)).heading;
  return norm(b - a);
}
