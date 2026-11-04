/**
 * Fahrmodus: Allein (schnelle Feierabendrunde, ohne Gruppe und Funk) oder Gruppe
 * (man sieht die anderen und hat Walkie Talkie).
 * Kleiner gemeinsamer Zustand ohne React Native Abhängigkeit, damit Handy und Web
 * Planer denselben Store lesen. Lebt vorerst nur im Speicher.
 */
import { useSyncExternalStore } from 'react';

export type RideMode = 'allein' | 'gruppe';

export const RIDE_MODES: { id: RideMode; label: string; hint: string }[] = [
  { id: 'allein', label: 'Allein', hint: 'Schnelle Runde, ohne Gruppenfahrt und ohne Funk.' },
  { id: 'gruppe', label: 'Gruppe', hint: 'Ihr seht euch auf der Karte und habt Walkie Talkie.' },
];

export const DEFAULT_RIDE_MODE: RideMode = 'allein';

let current: RideMode = DEFAULT_RIDE_MODE;
const listeners = new Set<() => void>();

export function getRideMode(): RideMode {
  return current;
}

export function setRideMode(mode: RideMode): void {
  if (mode === current) return;
  current = mode;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Aktueller Fahrmodus und Setter, wie useState. */
export function useRideMode(): [RideMode, (mode: RideMode) => void] {
  const mode = useSyncExternalStore(subscribe, getRideMode, getRideMode);
  return [mode, setRideMode];
}
