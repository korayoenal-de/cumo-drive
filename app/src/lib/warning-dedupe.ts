/**
 * Doppelte Warnungen zusammenfassen (Koray 16.11.): Verkehrsmeldungen gibt es oft je Fahrtrichtung
 * ("SR48 zwischen Arabba und Pordoi" und "zwischen Pordoi und Arabba"). Dieselbe Stelle steht nur einmal
 * in der Liste und auf der Karte, auch bei schon gespeicherten Touren.
 */
import { getLang, tr } from '@/i18n';
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

/**
 * Anzeige in der App Sprache (Koray 16.11.). Die Warnungen selbst bleiben deutsch gespeichert: sie werden
 * verglichen (oben), mit der Tour gesichert und im Web Planer auch in anderer Sprache gezeigt.
 */
export function closureNameT(name: string): string {
  if (getLang() === 'de') return name;
  return name
    .replace(/^Gesperrt\b/i, tr('Gesperrt'))
    .replace(/\bzwischen (.+) und (.+)$/, (_m, a: string, b: string) => tr('zwischen {a} und {b}', { a, b }))
    .replace(/\bbei (.+)$/, (_m, a: string) => tr('bei {a}', { a }));
}

/** Ein Grund einer Warnung, so wie er aus Prüfung und Routing kommt */
export function reasonT(r: string): string {
  if (getLang() === 'de') return r;
  let m: RegExpExecArray | null;
  if ((m = /^(.+) m breit, (.+)$/.exec(r))) return `${tr('{w} m breit', { w: m[1] })}, ${reasonT(m[2])}`;
  if ((m = /^nur (.+) m breit$/.exec(r))) return tr('nur {w} m breit', { w: m[1] });
  if ((m = /^(.+) m breit$/.exec(r))) return tr('{w} m breit', { w: m[1] });
  if ((m = /^schmal, (.+) m laut Karte, von Fahrern empfohlen$/.exec(r))) return tr('schmal, {w} m laut Karte, von Fahrern empfohlen', { w: m[1] });
  if ((m = /^als (.+) eingetragen$/.exec(r))) return tr('als {kind} eingetragen', { kind: tr(m[1]) });
  if ((m = /^Belag (.+)$/.exec(r))) return tr('Belag {s}', { s: tr(m[1]) });
  if ((m = /^Wegklasse (.+)$/.exec(r))) return tr('Wegklasse {s}', { s: m[1] });
  if ((m = /^Teil eines (.+) km langen Nebenstraßen Abschnitts mit (\d+) Sperrsignalen$/.exec(r))) return tr('Teil eines {km} km langen Nebenstraßen Abschnitts mit {n} Sperrsignalen', { km: m[1], n: m[2] });
  return tr(r);
}
