/**
 * Stimme der Ansagen: eine der deutschen Stimmen, die auf dem iPhone installiert sind.
 * Ohne Auswahl spricht die Standardstimme für Deutsch. Liegt auf dem Gerät (AsyncStorage).
 */
import { voiceVolume } from './drive-settings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

export type VoiceChoice = { id: string; name: string } | null;

export type VoiceOption = {
  id: string;
  name: string;
  /** Standard, Erweitert oder Premium */
  quality: string;
  /** Land, wenn nicht Deutschland (Österreich, Schweiz) */
  region: string | null;
  rank: number;
};

const KEY = 'cumo.drive.stimme.v1';
let state: VoiceChoice = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      state = JSON.parse(raw) as VoiceChoice;
      emit();
    })
    .catch(() => undefined);
}

/** Für die Sprachausgabe: die gewählte Stimme oder undefined (Standardstimme) */
export function chosenVoiceId(): string | undefined {
  load();
  return state?.id;
}

export function setVoiceChoice(v: VoiceChoice) {
  state = v;
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(v)).catch(() => undefined);
}

export function useVoiceChoice(): VoiceChoice {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

const REGION: Record<string, string> = { 'de-AT': 'Österreich', 'de-CH': 'Schweiz' };

/**
 * Deutsche Stimmen des Geräts, die besten zuerst. Ohne die Spaß und Effektstimmen (Eloquence,
 * Bubbles und Co.), die für Ansagen nicht taugen.
 */
export async function germanVoices(): Promise<VoiceOption[]> {
  const all = await Speech.getAvailableVoicesAsync();
  return all
    .filter((v) => v.language?.startsWith('de') && !/eloquence|speech\.synthesis/i.test(v.identifier))
    .map((v) => {
      const premium = /premium/i.test(v.identifier);
      const enhanced = v.quality === Speech.VoiceQuality.Enhanced;
      return {
        id: v.identifier,
        name: v.name,
        quality: premium ? 'Premium' : enhanced ? 'Erweitert' : 'Standard',
        region: REGION[v.language] ?? null,
        rank: premium ? 0 : enhanced ? 1 : 2,
      };
    })
    .sort((a, b) => a.rank - b.rank || (a.region ? 1 : 0) - (b.region ? 1 : 0) || a.name.localeCompare(b.name, 'de'));
}

export const VOICE_SAMPLE = 'In 300 Metern rechts abbiegen. Danach beginnt die Juhöhe, eine starke Kurvenstrecke.';

export function playSample(id: string | undefined, text = VOICE_SAMPLE) {
  Speech.stop().catch(() => {});
  Speech.speak(text, { language: 'de-DE', voice: id, rate: 1.0, volume: voiceVolume() });
}
