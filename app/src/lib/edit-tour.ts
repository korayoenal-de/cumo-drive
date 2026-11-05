/**
 * Übergabe einer gespeicherten Tour an den Planer zum Ändern. Meine Touren legt die Tour hier ab
 * und wechselt zum Planer; der Planer holt sie einmal ab, öffnet "Route" mit ihren Punkten und
 * speichert danach in dieselbe Tour der Bibliothek.
 */
import type { SavedTour } from './library';

let pending: SavedTour | null = null;
const listeners = new Set<() => void>();

/** Tour zum Ändern vormerken (der Planer übernimmt sie beim nächsten Abholen). */
export function setEditTour(t: SavedTour) {
  pending = t;
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
