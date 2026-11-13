/**
 * Kurvenansagen wie ein Beifahrer, Stufe „Einfach“ (Koray 13.11.): nur auf Highlights, gesprochen
 * „Links leicht“, „Rechts mittel“, „Links scharf“, „Kehre rechts“. Folgt eine Kurve dicht auf die nächste,
 * kommen beide in eine Ansage: „Links mittel, dann rechts scharf“.
 *
 * Alles aus der Geometrie der Route, ohne Netz. Die Ansage beschreibt die Kurve, sie nennt kein Tempo.
 * Abbiegungen an Kreuzungen sind Manöver mit eigener Ansage und bleiben hier draußen.
 *
 * Stufen nach dem engsten Radius (über 40 m geglättet):
 *  - leicht: 90 bis 220 m, man lenkt deutlich, fährt aber flüssig
 *  - mittel: 40 bis 90 m
 *  - scharf: unter 40 m
 *  - Kehre: mindestens 140 Grad auf höchstens 120 m
 * Weiter als 220 m zählt als gerade, unter 25 Grad Richtungswechsel ebenso.
 */
import { resample } from '../stats';
import type { LatLon } from '../tour';

export type PaceGrade = 'leicht' | 'mittel' | 'scharf' | 'kehre';

export type PaceNote = {
  /** km ab Routenstart: Beginn und Ende der Kurve */
  startKm: number;
  endKm: number;
  dir: 'links' | 'rechts';
  grade: PaceGrade;
  /** engster Radius in m */
  radius: number;
  /** Richtungswechsel in Grad */
  deg: number;
};

const STEP = 10;
const MIN_DEG = 25;
const PIN_DEG = 140;
const PIN_M = 120;
const CURVE_M = 200;
export const R_LIGHT = 220;
export const R_MEDIUM = 90;
export const R_SHARP = 40;
/** Abstand zu einem Manöver, innerhalb dessen keine Kurve angesagt wird */
const MANEUVER_GAP_KM = 0.08;
/** Folgt die nächste Kurve höchstens so weit nach dem Ende, wird sie mit „dann“ angehängt */
export const THEN_GAP_KM = 0.06;

function heading(a: LatLon, b: LatLon) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2(b[0] - a[0], (b[1] - a[1]) * k) * 180) / Math.PI;
}

/** Engster Radius zwischen from und to: Drehung über vier Stützpunkte (40 m) */
function minRadius(turns: number[], from: number, to: number): number {
  let maxDeg = 0;
  for (let j = from; j <= Math.max(from, to - 3); j++) {
    let sum = 0;
    for (let k = j; k < Math.min(turns.length, j + 4); k++) sum += turns[k];
    maxDeg = Math.max(maxDeg, Math.abs(sum));
  }
  if (maxDeg < 0.5) return Number.POSITIVE_INFINITY;
  return (4 * STEP) / ((maxDeg * Math.PI) / 180);
}

/** Kehre: fast umkehren auf kurzem Weg, oder eng und mindestens 120 Grad */
const MERGE_GAP_KM = 0.03;
function isHairpin(deg: number, lenM: number, radius: number): boolean {
  return (deg >= PIN_DEG && lenM <= PIN_M) || (deg >= 120 && radius <= 25);
}

export function gradeOf(radius: number): Exclude<PaceGrade, 'kehre'> | null {
  if (radius > R_LIGHT) return null;
  if (radius > R_MEDIUM) return 'leicht';
  if (radius > R_SHARP) return 'mittel';
  return 'scharf';
}

/**
 * Kurven einer Route mit Stufe. ranges begrenzt auf Abschnitte (Highlights) in km; ohne ranges die ganze Route.
 */
export function paceNotes(shape: LatLon[], maneuverKms: number[] = [], ranges?: { startKm: number; endKm: number }[]): PaceNote[] {
  if (shape.length < 3) return [];
  const pts = resample(shape, STEP);
  const turns: number[] = [];
  for (let i = 2; i < pts.length; i++) {
    let d = heading(pts[i - 1], pts[i]) - heading(pts[i - 2], pts[i - 1]);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turns.push(d);
  }
  const kmAt = (i: number) => ((i + 1) * STEP) / 1000;
  const inRange = (km: number) => !ranges || ranges.some((r) => km >= r.startKm && km <= r.endKm);
  const nearManeuver = (a: number, b: number) => maneuverKms.some((m) => m >= a - MANEUVER_GAP_KM && m <= b + MANEUVER_GAP_KM);

  const raw: PaceNote[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (Math.abs(turns[i]) < 3) continue;
    const from = i;
    const sign = Math.sign(turns[i]);
    // die Kurve läuft, solange es in dieselbe Richtung dreht (kurze Geraden bis 20 m werden überbrückt)
    let end = i;
    let sum = 0;
    let straight = 0;
    for (let j = i; j < Math.min(turns.length, i + Math.round(CURVE_M / STEP)); j++) {
      if (Math.sign(turns[j]) === sign && Math.abs(turns[j]) >= 1.5) {
        sum += turns[j];
        end = j;
        straight = 0;
      } else if (Math.sign(turns[j]) === -sign && Math.abs(turns[j]) >= 3) {
        break;
      } else if (++straight > 2) {
        break;
      }
    }
    const deg = Math.abs(sum);
    const lenM = (end - i + 1) * STEP;
    const startKm = kmAt(i);
    const endKm = kmAt(end);
    i = end;
    if (deg < MIN_DEG) continue;
    const radius = minRadius(turns, from, end);
    const grade: PaceGrade | null = isHairpin(deg, lenM, radius) ? 'kehre' : gradeOf(radius);
    if (!grade) continue;
    raw.push({ startKm, endKm, dir: sum > 0 ? 'links' : 'rechts', grade, radius: Math.round(radius), deg: Math.round(deg) });
  }
  // Eine Kurve, die die Geometrie in zwei Stücke teilt (kurzes gerades Stück im Scheitel), wird wieder eins:
  // gleiche Richtung, höchstens 30 m Abstand. So wird aus „links scharf, dann links scharf“ die Kehre.
  const merged: PaceNote[] = [];
  for (const n of raw) {
    const p = merged[merged.length - 1];
    if (p && p.dir === n.dir && n.startKm - p.endKm <= MERGE_GAP_KM) {
      const deg = p.deg + n.deg;
      const radius = Math.min(p.radius, n.radius);
      const lenM = (n.endKm - p.startKm) * 1000;
      merged[merged.length - 1] = { ...p, endKm: n.endKm, deg, radius, grade: isHairpin(deg, lenM, radius) ? 'kehre' : (gradeOf(radius) ?? p.grade) };
    } else merged.push(n);
  }
  return merged.filter((n) => inRange(n.startKm) && !nearManeuver(n.startKm, n.endKm));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Eine Kurve als Wörter: „links mittel“, „Kehre rechts“ */
export function noteWords(n: PaceNote): string {
  return n.grade === 'kehre' ? `Kehre ${n.dir}` : `${n.dir} ${n.grade}`;
}

/**
 * Text der Ansage ab Kurve i und wie viele Kurven er abdeckt. Höchstens zwei Kurven je Ansage,
 * damit sie kurz bleibt; die dritte kommt als eigene Ansage.
 */
export function paceText(notes: PaceNote[], i: number): { text: string; count: number } {
  const a = notes[i];
  const b = notes[i + 1];
  if (b && b.startKm - a.endKm <= THEN_GAP_KM) return { text: `${cap(noteWords(a))}, dann ${noteWords(b)}`, count: 2 };
  return { text: cap(noteWords(a)), count: 1 };
}

/**
 * Vorlauf der Ansage in km: etwa 4 Sekunden Fahrzeit plus Sprechzeit, mindestens 70 m, höchstens 220 m.
 * Ohne Tempo 120 m.
 */
export function leadKm(speedKmh: number | null | undefined, words = 2): number {
  if (speedKmh == null) return 0.12;
  const v = speedKmh / 3.6;
  const m = v * (4 + words * 0.35);
  return Math.min(0.22, Math.max(0.07, m / 1000));
}
