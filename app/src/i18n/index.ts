/**
 * Sprachen der App (Koray 16.11.): Deutsch ist die Quelle, dazu Englisch und Italienisch.
 *
 * Schlüssel ist der deutsche Text selbst: t('Losfahren') liefert auf Englisch "Start driving". Fehlt eine
 * Übersetzung, bleibt der deutsche Text stehen; so bricht nichts, wenn ein neuer Text noch nicht übersetzt ist.
 * Platzhalter in geschweiften Klammern: t('In {m} Metern', { m: 500 }).
 *
 * Die Sprache folgt dem iPhone (Intl, ohne natives Modul) und lässt sich in den Einstellungen festlegen
 * (auf dem Gerät gespeichert). Ein Wechsel zeichnet die App neu (Schlüssel am Stamm in _layout).
 */
import { useSyncExternalStore } from 'react';

import en from './en.json';
import it from './it.json';
import { readChoice, writeChoice } from './store';

export type Lang = 'de' | 'en' | 'it';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
];
/** Sprache der Ansagen je App Sprache */
export const SPEECH_LANG: Record<Lang, string> = { de: 'de-DE', en: 'en-GB', it: 'it-IT' };

const DICT: Record<Exclude<Lang, 'de'>, Record<string, string>> = { en, it };

/** Sprache des Geräts: de, it, sonst Englisch (Deutsch auch für AT und CH) */
export function deviceLang(locale?: string): Lang {
  let l = locale;
  // Vorrendern der Webseiten (expo export, ohne window): immer Deutsch. Sonst bestimmte die Sprache des Rechners,
  // auf dem gebaut wird, die statischen Seiten (17.11.: Englisch), und deutsche Besucher sahen beim Laden kurz
  // Englisch, dazu React Fehler 418, weil der Browser die Seite auf Deutsch neu zeichnete.
  if (!l && typeof window === 'undefined') return 'de';
  if (!l) {
    try {
      l = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      l = 'de';
    }
  }
  const base = (l ?? 'de').toLowerCase().slice(0, 2);
  return base === 'de' ? 'de' : base === 'it' ? 'it' : 'en';
}

const valid = (v: string | null): v is Lang => v === 'de' || v === 'en' || v === 'it';
const stored = readChoice();
/** null: dem Gerät folgen */
let chosen: Lang | null = valid(stored) ? stored : null;
let lang: Lang = chosen ?? deviceLang();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Früher asynchron geladen; die Wahl liegt jetzt synchron vor (store.ts). Bleibt für den Aufruf beim Start. */
export async function loadLang(): Promise<void> {}

/** Sprache festlegen (null: dem Gerät folgen) */
export function setLang(next: Lang | null): void {
  chosen = next;
  lang = next ?? deviceLang();
  writeChoice(next);
  emit();
}

export function getLang(): Lang {
  return lang;
}

export function chosenLang(): Lang | null {
  return chosen;
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang,
    () => lang,
  );
}

/** Übersetzen; der deutsche Text ist Schlüssel und Rückfall */
export function t(de: string, vars?: Record<string, string | number | null | undefined>): string {
  const raw = lang === 'de' ? de : (DICT[lang][de] ?? de);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m));
}

/** Für Tests: Sprache direkt setzen, ohne Speichern */
export function _setLangForTest(l: Lang): void {
  lang = l;
}

/** Zahlen im Text: 1.234 m (de, it) oder 1,234 m (en) */
export function numberLocale(): string {
  return lang === 'en' ? 'en-GB' : lang === 'it' ? 'it-IT' : 'de-DE';
}

/**
 * Unterzeile einer Strecke ("Kurvenstrecke", "Passstraße"): aus dem Wörterbuch, sonst ein allgemeines Wort,
 * damit in Ansagen kein deutscher Begriff steht.
 */
export function noteT(de: string): string {
  if (lang === 'de') return de;
  const hit = DICT[lang][de];
  if (hit) return hit;
  if (/renn/i.test(de)) return DICT[lang]['Bergrennstrecke'] ?? de;
  if (/rallye/i.test(de)) return DICT[lang]['Rallyestrecke'] ?? de;
  if (/pass/i.test(de)) return DICT[lang]['Passstraße'] ?? de;
  return DICT[lang]['Kurvenstrecke'] ?? de;
}

/** Gleich wie t, für Dateien, in denen t schon ein anderer Name ist */
export const tr = t;

/** Dezimalzeichen der Sprache: 2,5 (de, it) oder 2.5 (en) */
export function decimal(s: string): string {
  return lang === 'en' ? s : s.replace('.', ',');
}
