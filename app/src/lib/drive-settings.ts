/**
 * Einstellungen für die Fahrt, auf dem Gerät gespeichert (AsyncStorage).
 * speed: eigenes Tempo und erlaubtes Tempo in der Navigation zeigen.
 * volume: Lautstärke der Ansagen im Verhältnis zur Lautstärke des iPhones (0,2 bis 1, Tester Gregor 12.11.).
 * paceNotes: Kurvenansagen wie ein Beifahrer auf Highlights (Stufe Einfach, Koray 13.11.), Standard aus.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type DriveSettings = { speed: boolean; volume: number; paceNotes: boolean };

const KEY = 'cumo.drive.fahrt.v1';
let state: DriveSettings = { speed: true, volume: 1, paceNotes: false };
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      state = { ...state, ...(JSON.parse(raw) as Partial<DriveSettings>) };
      emit();
    })
    .catch(() => undefined);
}

export function setDriveSetting<K extends keyof DriveSettings>(k: K, v: DriveSettings[K]) {
  state = { ...state, [k]: v };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

export function useDriveSettings(): DriveSettings {
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

/** Für die Sprachausgabe außerhalb von React */
export function voiceVolume(): number {
  load();
  return Math.min(1, Math.max(0.2, state.volume ?? 1));
}
