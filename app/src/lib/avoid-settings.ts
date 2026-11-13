/**
 * Vermeiden als feste Einstellung (Backlog 13.11.): Was du beim Planen unter Vermeiden einstellst, bleibt
 * für die nächste Tour stehen, in der App und im Web Planer (dort im Browser gespeichert). Dieselben Schalter
 * stehen in den Einstellungen unter Fahren. Gespeichert auf dem Gerät (AsyncStorage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';

import { DEFAULT_AVOID, type Avoid } from './valhalla';

const KEY = 'cumo.drive.vermeiden.v1';
let state: Avoid = DEFAULT_AVOID;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Avoid>;
      state = { ...DEFAULT_AVOID, ...saved };
      emit();
    })
    .catch(() => undefined);
}

export function setAvoidSetting(next: Avoid) {
  state = next;
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** Gespeichertes Vermeiden außerhalb von React (CarPlay, Gruppenstart) */
export function avoidSetting(): Avoid {
  load();
  return state;
}

/** Wie useState, aber gespeichert und überall gleich (Planer, Web Planer, Einstellungen) */
export function useAvoid(): [Avoid, (v: Avoid | ((a: Avoid) => Avoid)) => void] {
  load();
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
  const set = useCallback((v: Avoid | ((a: Avoid) => Avoid)) => setAvoidSetting(typeof v === 'function' ? v(state) : v), []);
  return [value, set];
}

export const AVOID_OPTIONS: readonly (readonly [keyof Avoid, string, string | undefined])[] = [
  ['closures', 'Gesperrte Straßen', 'Wir planen um gesperrte Straßen herum.'],
  ['ferries', 'Fähren', undefined],
  ['tolls', 'Maut', undefined],
  ['rough', 'Rauer Belag', 'Kopfsteinpflaster und schlechter Asphalt.'],
];
