/**
 * Kurze Rückmeldung nach einer erledigten Aktion (Gespeichert, Exportiert, Gelöscht).
 * Wann Toast und wann etwas anderes: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 * showToast überall aufrufen; angezeigt wird es von ToastHost im Wurzel Layout.
 */
import { useSyncExternalStore } from 'react';

export type ToastMsg = {
  id: number;
  text: string;
  /** nur bei Fehlern, die nicht im Zusammenhang stehen können */
  tone?: 'ok' | 'error';
  /** eine Folgeaktion, etwa Rückgängig oder Öffnen */
  action?: { label: string; onPress: () => void };
};

let current: ToastMsg | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** wartet, solange ein Toast mit Folgeaktion steht (er wird nicht verdrängt, Audit 18.11.) */
let waiting: ToastMsg | null = null;
/** ein Symbol fliegt gerade ins Ziel: so lange zeigt sich kein Toast (nie zwei Signale zugleich) */
let held = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const life = (m: ToastMsg) => (m.action ? 5000 : 2600);

function start(m: ToastMsg) {
  current = m;
  emit();
  if (timer) clearTimeout(timer);
  // Mit Folgeaktion länger stehen lassen, damit man sie erreicht
  timer = held ? null : setTimeout(hideToast, life(m));
}

export function showToast(text: string, opts: { tone?: 'ok' | 'error'; action?: ToastMsg['action'] } = {}) {
  const m: ToastMsg = { id: ++seq, text, ...opts };
  // Ein Toast mit Folgeaktion (Rückgängig, Übernehmen) bleibt stehen; eine Nebenmeldung kommt danach.
  // Fehler und neue Folgeaktionen gehen vor.
  if (current?.action && !m.action && m.tone !== 'error') {
    waiting = m;
    return;
  }
  waiting = null;
  start(m);
}

export function hideToast() {
  if (timer) clearTimeout(timer);
  timer = null;
  const next = waiting;
  waiting = null;
  if (next) start(next);
  else {
    current = null;
    emit();
  }
}

/** Vom ToastHost gemeldet: fliegt ein Symbol, wartet der Toast und läuft danach mit voller Dauer */
export function holdToast(on: boolean) {
  if (held === on) return;
  held = on;
  if (on) {
    if (timer) clearTimeout(timer);
    timer = null;
  } else if (current) timer = setTimeout(hideToast, life(current));
}

/**
 * Wo der Toast steht (Audit 18.11.): Standard über der Tab Leiste. Seiten mit fester Hauptaktion unten melden deren
 * Höhe, die Navigation meldet den Platz unter der Abbiegekarte. null stellt den Standard wieder her.
 */
export type ToastPlace = { bottom: number } | { top: number };
let place: ToastPlace | null = null;
export function setToastPlace(p: ToastPlace | null) {
  place = p;
  emit();
}
export function useToastPlace(): ToastPlace | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => place,
    () => null,
  );
}

export function useToast(): ToastMsg | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
