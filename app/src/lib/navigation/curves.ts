/**
 * Kurven, die man stark anbremsen muss (Idee Koray, 6.11.2026): aus der Geometrie der Route, ohne Netz.
 * Die Navigation zeigt sie 150 m vorher als dezentes Label über der Karte.
 *
 * Scharfe Kurve: mindestens 70 Grad Richtungswechsel auf höchstens 50 m (Radius etwa 40 m und enger).
 * Kehre: mindestens 140 Grad auf höchstens 120 m.
 * Abbiegungen an Kreuzungen sind schon Manöver mit eigenem Pfeil und werden hier ausgelassen.
 */
import { resample } from '../stats';
import type { LatLon } from '../tour';

export type SharpCurve = {
  /** km ab Start der Route, an dem die Kurve beginnt */
  startKm: number;
  /** km des Scheitels; bis hierhin bleibt das Label stehen */
  apexKm: number;
  dir: 'links' | 'rechts';
  kind: 'scharf' | 'kehre';
};

const STEP = 10;
const SHARP_DEG = 70;
const SHARP_M = 50;
const PIN_DEG = 140;
const PIN_M = 120;
/** Abstand zu einem Manöver, innerhalb dessen keine Kurve gemeldet wird */
const MANEUVER_GAP_KM = 0.06;

function heading(a: LatLon, b: LatLon) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2(b[0] - a[0], (b[1] - a[1]) * k) * 180) / Math.PI;
}

/** Stärkste Drehung in einem Fenster ab i, nur in eine Richtung gezählt */
function bestWindow(turns: number[], i: number, win: number): { sum: number; end: number } {
  let sum = 0;
  let best = { sum: 0, end: i };
  for (let j = i; j < Math.min(turns.length, i + win); j++) {
    sum += turns[j];
    if (Math.abs(sum) > Math.abs(best.sum)) best = { sum, end: j };
  }
  return best;
}

export function sharpCurves(shape: LatLon[], maneuverKms: number[] = []): SharpCurve[] {
  if (shape.length < 3) return [];
  const pts = resample(shape, STEP);
  // turns[i]: Richtungswechsel am Punkt i + 1, positiv ist links
  const turns: number[] = [];
  for (let i = 2; i < pts.length; i++) {
    let d = heading(pts[i - 1], pts[i]) - heading(pts[i - 2], pts[i - 1]);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turns.push(d);
  }
  const kmAt = (i: number) => ((i + 1) * STEP) / 1000;
  const nearManeuver = (a: number, b: number) => maneuverKms.some((m) => m >= a - MANEUVER_GAP_KM && m <= b + MANEUVER_GAP_KM);

  const out: SharpCurve[] = [];
  for (let i = 0; i < turns.length; i++) {
    // Kurven fangen erst an, wenn es sich wirklich dreht
    if (Math.abs(turns[i]) < 4) continue;
    const pin = bestWindow(turns, i, Math.round(PIN_M / STEP));
    const sharp = bestWindow(turns, i, Math.round(SHARP_M / STEP));
    const kind = Math.abs(pin.sum) >= PIN_DEG ? 'kehre' : Math.abs(sharp.sum) >= SHARP_DEG ? 'scharf' : null;
    if (!kind) continue;
    const w = kind === 'kehre' ? pin : sharp;
    const startKm = kmAt(i);
    const endKm = kmAt(w.end);
    if (!nearManeuver(startKm, endKm)) {
      out.push({ startKm, apexKm: (startKm + endKm) / 2, dir: w.sum > 0 ? 'links' : 'rechts', kind });
    }
    // hinter dieser Kurve weitersuchen
    i = w.end + 1;
  }
  return out;
}

export const CURVE_WARN_KM = 0.15;

/** Die Kurve, die jetzt angekündigt wird: Beginn höchstens 150 m voraus, Scheitel noch nicht erreicht */
export function curveAhead(curves: SharpCurve[], atKm: number): SharpCurve | null {
  for (const c of curves) {
    if (c.apexKm < atKm) continue;
    return c.startKm - atKm <= CURVE_WARN_KM ? c : null;
  }
  return null;
}

export function curveLabel(c: SharpCurve): string {
  if (c.kind === 'kehre') return c.dir === 'links' ? 'Kehre links' : 'Kehre rechts';
  return c.dir === 'links' ? 'Scharfe Linkskurve' : 'Scharfe Rechtskurve';
}
