/**
 * Die Tour, die gerade angesehen oder gefahren wird. Kleiner gemeinsamer Zustand, damit
 * Planer, Kartenansicht und Navigation dieselbe Tour sehen, ohne sie über die URL zu reichen.
 */
import { useSyncExternalStore } from 'react';

import type { Profile, Tour } from './tour';
import { DEFAULT_AVOID, type Avoid } from './valhalla';

export type ActiveTour = { tour: Tour & { minutes?: number }; profile: Profile; avoid: Avoid };

let current: ActiveTour | null = null;
const listeners = new Set<() => void>();

export function setActiveTour(t: Tour & { minutes?: number }, profile: Profile = 'kurvig', avoid: Avoid = DEFAULT_AVOID) {
  current = { tour: t, profile, avoid };
  for (const l of listeners) l();
}

export function getActiveTour(): ActiveTour | null {
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useActiveTour(): ActiveTour | null {
  return useSyncExternalStore(subscribe, getActiveTour, () => null);
}
