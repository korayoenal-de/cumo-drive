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
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string, opts: { tone?: 'ok' | 'error'; action?: ToastMsg['action'] } = {}) {
  current = { id: ++seq, text, ...opts };
  emit();
  if (timer) clearTimeout(timer);
  // Mit Folgeaktion länger stehen lassen, damit man sie erreicht
  timer = setTimeout(hideToast, opts.action ? 5000 : 2600);
}

export function hideToast() {
  current = null;
  emit();
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
