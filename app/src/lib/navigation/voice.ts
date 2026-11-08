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
import { chosenVoiceId } from '../voice-settings';

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
      return 'Du bist am Ziel.';
    case 'zwischenziel':
      return 'Du bist jetzt auf der Tour.';
    default:
      return 'Jetzt geradeaus weiter.';
  }
}

/** Vorankündigung mit Entfernung. */
export function aheadPhrase(m: Maneuver, distM: number): string {
  const base = m.kind === 'ziel' || m.kind === 'ziel_links' || m.kind === 'ziel_rechts' ? 'bist du am Ziel.' : lowerFirst(m.speech);
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

type AudioModule = typeof import('expo-audio');
let audio: AudioModule | null | undefined;
function getAudio(): AudioModule | null {
  if (audio !== undefined) return audio;
  try {
    audio = require('expo-audio') as AudioModule;
  } catch {
    audio = null; // ältere Builds ohne expo-audio
  }
  return audio;
}

/**
 * Musik (Spotify, Apple Music) während der Ansage nur leiser stellen und danach wieder freigeben.
 * Ohne das hält iOS die Audiositzung der App aktiv und andere Apps pausieren dauerhaft.
 */
let speaking = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
function audioOn() {
  const a = getAudio();
  if (!a) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  void a.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: true }).catch(() => {});
  void a.setIsAudioActiveAsync(true).catch(() => {});
}
function audioOff() {
  const a = getAudio();
  if (!a) return;
  // kurz warten, falls gleich die nächste Ansage kommt
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (speaking > 0) return;
    void a.setIsAudioActiveAsync(false).catch(() => {});
  }, 600);
}

function defaultSpeak(text: string) {
  try {
    speaking++;
    audioOn();
    const done = () => {
      speaking = Math.max(0, speaking - 1);
      if (!speaking) audioOff();
    };
    Speech.speak(text, { language: 'de-DE', voice: chosenVoiceId(), rate: 1.0, onDone: done, onStopped: done, onError: done });
  } catch {
    // Sprachausgabe ist nicht wichtig genug, um die Navigation zu stören
  }
}

function defaultStop() {
  Speech.stop().catch(() => {});
  speaking = 0;
  audioOff();
}

/** Freie Ansage außerhalb der Navigation (zum Beispiel Gruppennachrichten), mit leiserer Musik. */
export const speakText = defaultSpeak;
