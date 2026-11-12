/**
 * Doch umfahren (Konzept Warnung an Highlights, 12.11.): Pässe mit Warnung, die du für die aktuelle Tour
 * herausgenommen hast. Die Planung sperrt die Passhöhe als kleines Quadrat, bis du sie wieder einplanst
 * oder eine neue Tour beginnst. Gilt nur für diese Tour, nichts davon wird gespeichert.
 */
import { useSyncExternalStore } from 'react';

import type { LatLon } from './tour';

export type AvoidedPass = { id: string; name: string; p: LatLon };

let list: AvoidedPass[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function avoidedPasses(): AvoidedPass[] {
  return list;
}

/** Sperrpunkte für die Planung */
export function avoidedPoints(): LatLon[] {
  return list.map((a) => a.p);
}

/** Schlüssel für das Wiederverwenden geplanter Etappen: ändert sich die Liste, wird alles neu geplant */
export function avoidedKey(): string {
  return list.map((a) => a.id).join(',');
}

export function avoidPass(a: AvoidedPass) {
  if (list.some((x) => x.id === a.id)) return;
  list = [...list, a];
  emit();
}

export function allowPass(id: string) {
  if (!list.some((x) => x.id === id)) return;
  list = list.filter((x) => x.id !== id);
  emit();
}

export function clearAvoidedPasses() {
  if (!list.length) return;
  list = [];
  emit();
}

export function useAvoidedPasses(): AvoidedPass[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => list,
    () => list,
  );
}
