/**
 * Ein Format für Zahlen, Zeiten und Daten in der ganzen App (Konsistenzprüfung 15.11., Entscheidungen Koray
 * K2, K5, K8, K9). Kennzahlen setzt der Stil in Versalien (2:57 H), im Text steht dasselbe klein (2:57 h).
 * Reine Funktionen ohne React, damit testbar.
 */
import { getLang, t } from '@/i18n';

const WDS = {
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  it: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
};
const MONS = {
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
};
/** Tag und Monat: „20. Nov.“ (de), „20 Nov“ (en), „20 nov“ (it) */
const dayMonth = (d: Date) => (getLang() === 'de' ? `${d.getDate()}. ${MONS.de[d.getMonth()]}` : `${d.getDate()} ${MONS[getLang()][d.getMonth()]}`);

/** Fahrzeit: unter einer Stunde „45 min“, sonst „2:57 h“ (nie „177 min“, nie „2 h 57“) */
export function fahrzeit(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}

/** Strecke: „148 km“, unter 10 km mit einer Stelle „8,4 km“ */
export function strecke(km: number): string {
  const d = km < 10 ? 1 : 0;
  return `${getLang() === 'en' ? km.toFixed(d) : km.toFixed(d).replace('.', ',')} km`;
}

/** Uhrzeit „9:30“, „Uhr“ nur im Satz */
export const uhr = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

const dayNo = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);

/** Tag kurz: „Heute“, „Morgen“, sonst „Fr 20. Nov.“ */
export function tagKurz(d: Date, now = new Date()): string {
  const n = dayNo(d) - dayNo(now);
  if (n === 0) return t('Heute');
  if (n === 1) return t('Morgen');
  return `${WDS[getLang()][d.getDay()]} ${dayMonth(d)}`;
}

/** Termin in Zeilen: „Heute 10:00“, „Fr 20. Nov. 10:00“ */
export const wann = (d: Date, now = new Date()) => `${tagKurz(d, now)} ${uhr(d)}`;

/** Datum ohne Wochentag für Gespeichertes und Gefahrenes: „12. Nov.“, aus anderem Jahr „12. Nov. 2025“ */
export function datum(d: Date, now = new Date()): string {
  const base = dayMonth(d);
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export type SeatTone = 'good' | 'warn' | 'muted';
/** Plätze aus Sicht der Teilnehmer: „4 Plätze frei“, „1 Platz frei“ (gelb), „Ausgebucht“ */
export function plaetze(free: number): { text: string; tone: SeatTone } {
  if (free <= 0) return { text: t('Ausgebucht'), tone: 'muted' };
  if (free === 1) return { text: t('1 Platz frei'), tone: 'warn' };
  return { text: t('{free} Plätze frei', { free }), tone: 'good' };
}

/** Werte in einer Zeile mit Mittelpunkt, leere fallen weg */
export const meta = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join('  ·  ');
