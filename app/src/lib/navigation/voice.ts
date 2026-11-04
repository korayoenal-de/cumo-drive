/**
 * Sprachansagen für die Routenführung (expo-speech, Deutsch).
 *
 * Jedes Manöver wird höchstens dreimal angesagt, jede Stufe höchstens einmal:
 *   weit   bei etwa 1000 m (Tempo über 60 km/h) oder 400 m
 *   nah    bei etwa 300 m (Tempo über 60 km/h) oder 100 m
 *   jetzt  direkt am Manöver, zum Beispiel "Jetzt links abbiegen"
 * Kommt man erst spät in den Bereich (zum Beispiel nach einer Neuberechnung), wird nur die
 * passende Stufe angesagt und die übersprungenen entfallen.
 */
import * as Speech from 'expo-speech';

import type { Maneuver, NavRoute } from './types';

type Stage = 'weit' | 'nah' | 'jetzt';

export type VoiceGuide = {
  /** Mit jeder neuen Position aufrufen */
  update: (route: NavRoute, next: number, distToNextM: number | null, speedKmh: number | null) => void;
  /** Freie Ansage, zum Beispiel beim Start oder bei einer Neuberechnung */
  say: (text: string, interrupt?: boolean) => void;
  setEnabled: (on: boolean) => void;
  /** Vergisst, was schon angesagt wurde (nach einer neuen Route) */
  reset: () => void;
  /** Bricht laufende Ansagen ab */
  stop: () => void;
};

const ORDINAL = ['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte'];

function thresholds(speedKmh: number | null): Record<Stage, number> {
  const fast = (speedKmh ?? 0) > 60;
  return fast ? { weit: 1000, nah: 300, jetzt: 60 } : { weit: 400, nah: 100, jetzt: 30 };
}

/** "300 Metern", "1 Kilometer", "1,5 Kilometern" */
function distanceWords(m: number): string {
  if (m >= 950) {
    const km = Math.round(m / 500) / 2;
    return km === 1 ? '1 Kilometer' : `${String(km).replace('.', ',')} Kilometern`;
  }
  const r = m >= 200 ? Math.round(m / 100) * 100 : Math.max(10, Math.round(m / 10) * 10);
  return `${r} Metern`;
}

/** Erstes Wort klein schreiben, damit "In 300 Metern rechts abbiegen" flüssig klingt. */
function lowerFirst(s: string): string {
  const first = s.split(' ')[0];
  const lower = ['Rechts', 'Links', 'In', 'Auf', 'Scharf', 'Leicht', 'Nach', 'Geradeaus', 'Weiter', 'Aus', 'Bleiben', 'Halten', 'Den', 'Die', 'Der', 'Das', 'Zum', 'Zur', 'Wenden', 'Ziel'];
  return lower.includes(first) ? first.toLowerCase() + s.slice(first.length) : s;
}

/** Kurze Ansage direkt am Manöver. */
export function nowPhrase(m: Maneuver): string {
  switch (m.kind) {
    case 'links':
      return 'Jetzt links abbiegen.';
    case 'rechts':
      return 'Jetzt rechts abbiegen.';
    case 'leicht_links':
      return 'Jetzt leicht links halten.';
    case 'leicht_rechts':
      return 'Jetzt leicht rechts halten.';
    case 'scharf_links':
      return 'Jetzt scharf links abbiegen.';
    case 'scharf_rechts':
      return 'Jetzt scharf rechts abbiegen.';
    case 'wenden':
    case 'wenden_rechts':
      return 'Jetzt wenden.';
    case 'rechts_halten':
      return 'Jetzt rechts halten.';
    case 'links_halten':
      return 'Jetzt links halten.';
    case 'einfaedeln_rechts':
    case 'einfaedeln_links':
      return 'Jetzt einfädeln.';
    case 'kreisverkehr_verlassen':
      return 'Jetzt den Kreisverkehr verlassen.';
    case 'faehre_an_bord':
      return 'Jetzt auf die Fähre.';
    case 'faehre_verlassen':
      return 'Jetzt die Fähre verlassen.';
    case 'kreisverkehr':
      return m.exit && m.exit < ORDINAL.length
        ? `Jetzt in den Kreisverkehr, ${ORDINAL[m.exit]} Ausfahrt nehmen.`
        : 'Jetzt in den Kreisverkehr fahren.';
    case 'auffahrt':
    case 'auffahrt_rechts':
    case 'auffahrt_links':
      return 'Jetzt auffahren.';
    case 'abfahrt':
    case 'abfahrt_rechts':
    case 'abfahrt_links':
      return 'Jetzt abfahren.';
    case 'ziel':
    case 'ziel_links':
    case 'ziel_rechts':
      return 'Sie haben das Ziel erreicht.';
    case 'zwischenziel':
      return 'Sie sind jetzt auf der Tour.';
    default:
      return 'Jetzt geradeaus weiter.';
  }
}

/** Vorankündigung mit Entfernung. */
export function aheadPhrase(m: Maneuver, distM: number): string {
  const base = m.kind === 'ziel' || m.kind === 'ziel_links' || m.kind === 'ziel_rechts' ? 'erreichen Sie das Ziel.' : lowerFirst(m.speech);
  return `In ${distanceWords(distM)} ${base}`;
}

export function createVoiceGuide(speak: (text: string) => void = defaultSpeak, stopSpeech: () => void = defaultStop): VoiceGuide {
  let enabled = true;
  const done = new Set<string>();

  const say = (text: string, interrupt = false) => {
    if (!enabled) return;
    if (interrupt) stopSpeech();
    speak(text);
  };

  return {
    update(route, next, distToNextM, speedKmh) {
      if (distToNextM == null) return;
      const m = route.maneuvers[next];
      if (!m || m.kind === 'start') return;
      const th = thresholds(speedKmh);
      let stage: Stage | null = null;
      if (distToNextM <= th.jetzt) stage = 'jetzt';
      else if (distToNextM <= th.nah) stage = 'nah';
      else if (distToNextM <= th.weit) stage = 'weit';
      if (!stage) return;
      const key = `${next}:${stage}`;
      if (done.has(key)) return;
      // übersprungene größere Stufen gelten als erledigt
      done.add(key);
      if (stage !== 'weit') done.add(`${next}:weit`);
      if (stage === 'jetzt') done.add(`${next}:nah`);
      // Ankunft sagt die Navigation selbst an, sobald der Status wechselt
      if (m.kind.startsWith('ziel') && stage === 'jetzt') return;
      // Bei sehr kurzem Abstand zur Vorankündigung lohnt "weit" nicht
      if (stage === 'weit' && distToNextM < th.nah * 1.5) return;
      say(stage === 'jetzt' ? nowPhrase(m) : aheadPhrase(m, distToNextM), stage === 'jetzt');
    },
    say,
    setEnabled(on) {
      enabled = on;
      if (!on) stopSpeech();
    },
    reset() {
      done.clear();
    },
    stop() {
      stopSpeech();
    },
  };
}

function defaultSpeak(text: string) {
  try {
    Speech.speak(text, { language: 'de-DE', rate: 1.0 });
  } catch {
    // Sprachausgabe ist nicht wichtig genug, um die Navigation zu stören
  }
}

function defaultStop() {
  Speech.stop().catch(() => {});
}
