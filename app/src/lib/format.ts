/**
 * Ein Format für Zahlen, Zeiten und Daten in der ganzen App (Konsistenzprüfung 15.11., Entscheidungen Koray
 * K2, K5, K8, K9). Kennzahlen setzt der Stil in Versalien (2:57 H), im Text steht dasselbe klein (2:57 h).
 * Reine Funktionen ohne React, damit testbar.
 */

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

/** Fahrzeit: unter einer Stunde „45 min“, sonst „2:57 h“ (nie „177 min“, nie „2 h 57“) */
export function fahrzeit(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

/** Strecke: „148 km“, unter 10 km mit einer Stelle „8,4 km“ */
export function strecke(km: number): string {
  const d = km < 10 ? 1 : 0;
  return `${km.toFixed(d).replace('.', ',')} km`;
}

/** Uhrzeit „9:30“, „Uhr“ nur im Satz */
export const uhr = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

const dayNo = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);

/** Tag kurz: „Heute“, „Morgen“, sonst „Fr 20. Nov.“ */
export function tagKurz(d: Date, now = new Date()): string {
  const n = dayNo(d) - dayNo(now);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  return `${WD[d.getDay()]} ${d.getDate()}. ${MON[d.getMonth()]}`;
}

/** Termin in Zeilen: „Heute 10:00“, „Fr 20. Nov. 10:00“ */
export const wann = (d: Date, now = new Date()) => `${tagKurz(d, now)} ${uhr(d)}`;

/** Datum ohne Wochentag für Gespeichertes und Gefahrenes: „12. Nov.“, aus anderem Jahr „12. Nov. 2025“ */
export function datum(d: Date, now = new Date()): string {
  const base = `${d.getDate()}. ${MON[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export type SeatTone = 'good' | 'warn' | 'muted';
/** Plätze aus Sicht der Teilnehmer: „4 Plätze frei“, „1 Platz frei“ (gelb), „Ausgebucht“ */
export function plaetze(free: number): { text: string; tone: SeatTone } {
  if (free <= 0) return { text: 'Ausgebucht', tone: 'muted' };
  if (free === 1) return { text: '1 Platz frei', tone: 'warn' };
  return { text: `${free} Plätze frei`, tone: 'good' };
}

/** Werte in einer Zeile mit Mittelpunkt, leere fallen weg */
export const meta = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join('  ·  ');
