/**
 * Einstellungen für die Fahrt, auf dem Gerät gespeichert (AsyncStorage).
 * speed: eigenes Tempo und erlaubtes Tempo in der Navigation zeigen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type DriveSettings = { speed: boolean };

const KEY = 'cumo.drive.fahrt.v1';
let state: DriveSettings = { speed: true };
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
