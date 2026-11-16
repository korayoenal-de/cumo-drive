/**
 * Doppelte Warnungen zusammenfassen (Koray 16.11.): Verkehrsmeldungen gibt es oft je Fahrtrichtung
 * ("SR48 zwischen Arabba und Pordoi" und "zwischen Pordoi und Arabba"). Dieselbe Stelle steht nur einmal
 * in der Liste und auf der Karte, auch bei schon gespeicherten Touren.
 */
import type { Warning } from './tour';

/** Ortsname ohne Zusatz in Klammern, etwa "Arabba (Delle Dolomiti/SS48)" wird zu "Arabba" */
export function cleanPlace(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Vergleichsschlüssel: ohne "Gesperrt", ohne Klammern, Orte bei "zwischen A und B" sortiert */
function sameKey(name: string): string {
  const n = cleanPlace(name.replace(/^Gesperrt:?\s*/i, '')).toLowerCase();
  const m = /^(.*?)\s*zwischen (.+) und (.+)$/.exec(n);
  if (!m) return n;
  const [a, b] = [m[2].trim(), m[3].trim()].sort();
  return `${m[1].trim()}|${a}|${b}`;
}

/** So nah liegen zwei Meldungen derselben Stelle höchstens auseinander */
const NEAR_KM = 2;

export function isSameWarning(a: Warning, b: Warning): boolean {
  if (a.klasse !== b.klasse) return false;
  if (Math.abs(a.start_km - b.start_km) > NEAR_KM) return false;
  return sameKey(a.name) === sameKey(b.name);
}

/** Erste Meldung je Stelle behalten, Reihenfolge bleibt */
export function uniqueWarnings<T>(items: T[], get: (t: T) => Warning): T[] {
  const kept: T[] = [];
  for (const it of items) {
    const w = get(it);
    if (!kept.some((k) => isSameWarning(get(k), w))) kept.push(it);
  }
  return kept;
}
