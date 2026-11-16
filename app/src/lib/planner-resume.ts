/**
 * Planer nach dem Schließen der App wiederherstellen (Koray 16.11.): Modus, Punkte, Profile, Name und das
 * geplante Ergebnis liegen im Gerät und kommen beim nächsten Start ohne neue Planung zurück.
 * Gespeichert wird gebündelt (eine Sekunde nach der letzten Änderung), gelöscht, sobald der Planer leer ist.
 * Nach 14 Tagen ohne Änderung beginnt der Planer wieder leer.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile } from './tour';

const KEY = 'cumo.planer.zuletzt.v1';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 1000;

/** tour: Stand von useTourPlan().snapshot(); round: Ergebnis der Rundtour (Tour, Anfrage, Stopps) */
export type PlannerResume<Snap, Round> = {
  at: number;
  mode: 'tour' | 'rundtour';
  profile: Profile;
  tour?: Snap;
  round?: Round;
};

let timer: ReturnType<typeof setTimeout> | null = null;

export function saveResume<S, R>(state: Omit<PlannerResume<S, R>, 'at'> | null) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const write = state ? AsyncStorage.setItem(KEY, JSON.stringify({ ...state, at: Date.now() })) : AsyncStorage.removeItem(KEY);
    write.catch(() => undefined);
  }, DEBOUNCE_MS);
}

export async function loadResume<S, R>(): Promise<PlannerResume<S, R> | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as PlannerResume<S, R>;
    if (!r || typeof r.at !== 'number' || Date.now() - r.at > MAX_AGE_MS) return null;
    if (r.mode !== 'tour' && r.mode !== 'rundtour') return null;
    return r;
  } catch {
    return null;
  }
}
