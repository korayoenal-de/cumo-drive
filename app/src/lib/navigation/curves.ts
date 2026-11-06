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

/** Abstand, unter dem Kurven als Kette zählen, und Mindestzahl an Kehren für die Zusammenfassung */
export const CHAIN_GAP_KM = 0.3;
export const CHAIN_MIN = 3;

export type CurveCue = {
  /** groß in der Plakette, etwa "150 M", "JETZT", "3 KEHREN", "2 VON 3" */
  big: string;
  label: string;
  icon: 'right' | 'left' | 'hairR' | 'hairL' | 'serp';
  /** für VoiceOver */
  a11y: string;
  /** Beginn der Kurve, zu der der Hinweis gehört (für "2 s nach Kurvenbeginn zurück") */
  startKm: number;
};

const up10 = (m: number) => Math.max(10, Math.ceil(m / 10) * 10);

/**
 * Bremshinweis für die Tempo Plakette (Variante A, 6.11.2026): ab 150 m vor der Kurve bis zum Scheitel.
 * Liegen mindestens drei Kehren mit weniger als 300 m Abstand hintereinander, wird zusammengefasst:
 * erst "3 KEHREN, folgen, erste in 120 m", dann "2 VON 3, Kehre rechts in 80 m".
 */
export function curveCue(curves: SharpCurve[], atKm: number): CurveCue | null {
  const i = curves.findIndex((c) => c.apexKm >= atKm);
  if (i < 0) return null;
  // Kette um die aktuelle Kurve herum
  let s = i;
  while (s > 0 && curves[s].startKm - curves[s - 1].startKm < CHAIN_GAP_KM) s--;
  let e = i;
  while (e < curves.length - 1 && curves[e + 1].startKm - curves[e].startKm < CHAIN_GAP_KM) e++;
  const chain = curves.slice(s, e + 1);
  const kehren = chain.filter((c) => c.kind === 'kehre').length;
  const c = curves[i];
  const dKm = c.startKm - atKm;
  // außerhalb einer Kette erst 150 m vorher; in der Kette bleibt der Hinweis bis zur letzten Kurve stehen
  const inChain = kehren >= CHAIN_MIN;
  if (dKm > CURVE_WARN_KM && !(inChain && i > s)) return null;
  const m = Math.round(dKm * 1000);
  const dir = c.dir === 'links' ? 'links' : 'rechts';
  if (inChain) {
    const n = chain.length;
    const k = i - s;
    if (k === 0 && m > 0) {
      return { big: `${n} KEHREN`, label: `folgen, erste in ${up10(m)} m`, icon: 'serp', a11y: `${n} Kehren folgen, erste in ${up10(m)} Metern`, startKm: c.startKm };
    }
    const where = m > 0 ? `in ${up10(m)} m` : 'jetzt';
    return { big: `${k + 1} VON ${n}`, label: `Kehre ${dir} ${where}`, icon: c.dir === 'links' ? 'hairL' : 'hairR', a11y: `Kehre ${k + 1} von ${n}, ${dir} ${where}`, startKm: c.startKm };
  }
  const label = curveLabel(c);
  const icon = c.kind === 'kehre' ? (c.dir === 'links' ? 'hairL' : 'hairR') : c.dir === 'links' ? 'left' : 'right';
  return { big: m > 0 ? `${up10(m)} M` : 'JETZT', label, icon, a11y: m > 0 ? `${label} in ${up10(m)} Metern` : `${label}, jetzt`, startKm: c.startKm };
}
