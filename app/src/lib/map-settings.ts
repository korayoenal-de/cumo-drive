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
  /** Alle Pässe zeigen; sonst nur im Umkreis von 50 km um Start, Zwischenziele, Ziel und Route (Koray 9.11.) */
  passesAll: boolean;
  /** Gespeicherte Touren aus Meine Touren als dünne Linien */
  myTours: boolean;
  /** Eigene gefahrene Strecken aus Fahrten */
  drives: boolean;
  /** Wetter an den Pässen der Route zur Ankunft (WeatherKit) */
  weather: boolean;
  /** true, sobald jemand die Darstellung selbst gewählt hat; bis dahin zeigt CarPlay 3D */
  styleChosen?: boolean;
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
  passesAll: false,
  myTours: false,
  drives: false,
  weather: true,
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
  state = { ...state, ...patch, ...(patch.style ? { styleChosen: true } : {}) };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

/** Im Auto ist 3D Satellit voreingestellt (Koray 8.11.), eine eigene Wahl gilt auch dort */
export function carPlayStyleOf(m: MapSettings): MapStyle {
  return m.styleChosen ? m.style : '3d';
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
