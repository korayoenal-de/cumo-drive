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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import en from './en.json';
import it from './it.json';

export type Lang = 'de' | 'en' | 'it';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'it', label: 'Italiano' },
];
/** Sprache der Ansagen je App Sprache */
export const SPEECH_LANG: Record<Lang, string> = { de: 'de-DE', en: 'en-GB', it: 'it-IT' };

const DICT: Record<Exclude<Lang, 'de'>, Record<string, string>> = { en, it };
const KEY = 'cumo.sprache.v1';

/** Sprache des Geräts: de, it, sonst Englisch (Deutsch auch für AT und CH) */
export function deviceLang(locale?: string): Lang {
  let l = locale;
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

let lang: Lang = deviceLang();
/** null: dem Gerät folgen */
let chosen: Lang | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Beim Start: gespeicherte Wahl laden */
export async function loadLang(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === 'de' || raw === 'en' || raw === 'it') {
      chosen = raw;
      if (raw !== lang) {
        lang = raw;
        emit();
      }
    }
  } catch {
    // Gerätesprache bleibt
  }
}

/** Sprache festlegen (null: dem Gerät folgen) */
export function setLang(next: Lang | null): void {
  chosen = next;
  lang = next ?? deviceLang();
  AsyncStorage.setItem(KEY, next ?? '').catch(() => undefined);
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
export function t(de: string, vars?: Record<string, string | number>): string {
  const raw = lang === 'de' ? de : (DICT[lang][de] ?? de);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
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
