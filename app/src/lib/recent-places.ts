/**
 * Zuletzt gewählte Orte und Pässe für die Suche im Planer (bis zu acht, neueste zuerst).
 * Liegt auf dem Gerät (AsyncStorage). Kleiner Speicher mit useSyncExternalStore wie map-settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Place } from './geocode';

const KEY = 'cumo.recentPlaces';
const MAX = 8;

let list: Place[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const v = raw ? (JSON.parse(raw) as Place[]) : [];
      if (Array.isArray(v)) {
        list = v.filter((x) => x && typeof x.name === 'string' && Array.isArray(x.p)).slice(0, MAX);
        emit();
      }
    })
    .catch(() => {});
}

/** Ort vorne einreihen; gleicher Name oder fast gleiche Stelle ersetzt den alten Eintrag. */
export function rememberPlace(place: Place) {
  const same = (x: Place) => x.name === place.name || (Math.abs(x.p[0] - place.p[0]) < 1e-4 && Math.abs(x.p[1] - place.p[1]) < 1e-4);
  list = [place, ...list.filter((x) => !same(x))].slice(0, MAX);
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}

export function useRecentPlaces(): Place[] {
  load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => list,
  );
}
