/**
 * Aktionen mit Ziel (Joy of Use, Koray 17.11.): nach Speichern, Merken, Veröffentlichen und ähnlichem schrumpft die
 * Taste zum Kreis, das Symbol fliegt dorthin, wo das Ergebnis jetzt liegt (Tab oder Stelle auf der Seite), und dort
 * erscheint eine Plakette. flyTo überall aufrufen; gezeichnet wird von FlyHost im Wurzel Layout.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Aktionen mit Ziel.
 */
import { useSyncExternalStore } from 'react';

import type { BtnIcon } from '@/components/ui/btn-icon';

export type FlyTab = 'planen' | 'touren' | 'ausfahrten' | 'community';
export type FlyTarget = FlyTab | { x: number; y: number };

export type Flight = {
  id: number;
  /** Mittelpunkt und Durchmesser des Kreises, in dem das Symbol startet (Fensterkoordinaten) */
  from: { x: number; y: number; size: number };
  target: FlyTarget;
  icon: BtnIcon;
  /** Grund des Kreises und Farbe des Symbols */
  bg: string;
  fg: string;
};

/**
 * Mitte der Tab Symbole als Anteil der Breite, gemessen am 17.11. auf dem iPhone (393 pt breit: 72, 139, 214, 305);
 * die Höhe ist der untere Rand plus 23 pt. Die Leiste von iOS gibt ihre Lage nicht heraus.
 */
// Seit 20.11.2026 fünf Tabs ohne Wörter, gleich breit: geschätzt aus der Leiste (etwa 27 bis 366 pt), auf dem Gerät nachmessen
export const TAB_X: Record<FlyTab, number> = { planen: 61 / 393, touren: 129 / 393, ausfahrten: 197 / 393, community: 264 / 393 };
export const TAB_Y_ABOVE_INSET = 23;

let flights: Flight[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function flyTo(f: Omit<Flight, 'id'>): void {
  flights = [...flights, { ...f, id: ++seq }];
  emit();
}

export function landed(id: number): void {
  const f = flights.find((x) => x.id === id);
  flights = flights.filter((x) => x.id !== id);
  if (f && typeof f.target === 'string') bumpTab(f.target);
  emit();
}

export function useFlights(): Flight[] {
  return useSyncExternalStore(subscribe, () => flights, () => flights);
}

/** Neues je Tab, bis der Tab geöffnet wird (Plakette an der Leiste) */
let fresh: Record<FlyTab, number> = { planen: 0, touren: 0, ausfahrten: 0, community: 0 };

export function bumpTab(tab: FlyTab): void {
  fresh = { ...fresh, [tab]: fresh[tab] + 1 };
  emit();
}

export function seenTab(tab: FlyTab): void {
  if (!fresh[tab]) return;
  fresh = { ...fresh, [tab]: 0 };
  emit();
}

export function freshOf(tab: FlyTab): number {
  return fresh[tab];
}

export function useFresh(tab: FlyTab): number {
  return useSyncExternalStore(subscribe, () => fresh[tab], () => 0);
}
