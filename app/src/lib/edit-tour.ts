/**
 * Übergabe einer gespeicherten Tour an den Planer zum Ändern. Meine Touren legt die Tour hier ab
 * und wechselt zum Planer; der Planer holt sie einmal ab, öffnet "Route" mit ihren Punkten und
 * speichert danach in dieselbe Tour der Bibliothek.
 *
 * Zurück Navigation (Koray 10.11., Muster Instagram): Wer die Tour aus einem anderen Bereich öffnet,
 * gibt die Herkunft mit. Solange sie gesetzt ist, zeigt der Planer oben links „‹ Meine Touren“ und
 * am linken Rand lässt er sich zurückwischen. Links oder QR Codes von außen haben keine Herkunft.
 */
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';

import type { SavedTour } from './library';

export type EditOrigin = { label: 'Touren' | 'Community'; href: '/touren' | '/community' };

let pending: SavedTour | null = null;
let origin: EditOrigin | null = null;
const listeners = new Set<() => void>();
const originListeners = new Set<() => void>();
/** Zurück Ablauf des Planers (fragt bei Änderungen nach); ohne Planer nur zurück zur Herkunft */
let backHandler: (() => void) | null = null;

function setOrigin(o: EditOrigin | null) {
  if (origin === o) return;
  origin = o;
  for (const l of originListeners) l();
}

/** Tour zum Ändern vormerken (der Planer übernimmt sie beim nächsten Abholen). from: Bereich, aus dem sie geöffnet wurde */
export function setEditTour(t: SavedTour, from?: EditOrigin | null) {
  pending = t;
  setOrigin(from ?? null);
  for (const l of listeners) l();
}

/** Vorgemerkte Tour abholen; danach ist sie weg, damit sie nur einmal geladen wird. */
export function takeEditTour(): SavedTour | null {
  const t = pending;
  pending = null;
  return t;
}

/** Ruft fn auf, sobald eine Tour zum Ändern vorgemerkt wird. */
export function onEditTour(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Herkunft der geöffneten Tour, null ohne Herkunft */
export function getEditOrigin(): EditOrigin | null {
  return origin;
}

/** Herkunft vergessen (Tour geschlossen, zurückgekehrt) */
export function clearEditOrigin() {
  setOrigin(null);
}

function subscribeOrigin(fn: () => void) {
  originListeners.add(fn);
  return () => {
    originListeners.delete(fn);
  };
}

/** Herkunft als Hook, für Pille und Randgeste */
export function useEditOrigin(): EditOrigin | null {
  return useSyncExternalStore(subscribeOrigin, getEditOrigin, getEditOrigin);
}

/** Der Planer meldet hier seinen Zurück Ablauf an */
export function setEditBackHandler(fn: (() => void) | null) {
  backHandler = fn;
}

/** Zurück zur Herkunft: über den Planer (Rückfrage bei Änderungen), sonst direkt */
export function requestEditBack() {
  if (backHandler) {
    backHandler();
    return;
  }
  const o = origin;
  setOrigin(null);
  if (o) router.navigate(o.href);
}
