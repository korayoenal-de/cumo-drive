/**
 * Karteneinstellungen: Darstellung (Standard, Satellit, 3D) und was zusätzlich auf der Karte liegt.
 * Liegt auf dem Gerät (AsyncStorage) und gilt für alle Karten der App.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type MapStyle = 'standard' | 'satellit' | '3d';

export type MapSettings = {
  style: MapStyle;
  /** Gesperrte und zu prüfende Stellen der Route als Marker */
  warnings: boolean;
  /** Alpenpässe und Bergstraßen aus unserer Liste */
  passes: boolean;
  /** Gespeicherte Touren aus Meine Touren als dünne Linien */
  myTours: boolean;
  /** Eigene gefahrene Strecken aus Fahrten */
  drives: boolean;
};

export const MAP_STYLES: { id: MapStyle; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'satellit', label: 'Satellit' },
  { id: '3d', label: '3D Satellit' },
];

const KEY = 'cumo.drive.karte.v1';
const DEFAULTS: MapSettings = {
  style: 'standard',
  warnings: true,
  passes: false,
  myTours: false,
  drives: false,
};

let state: MapSettings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      state = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MapSettings>) };
      emit();
    })
    .catch(() => undefined);
}

export function setMapSettings(patch: Partial<MapSettings>) {
  state = { ...state, ...patch };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

export function useMapSettings(): MapSettings {
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
