/**
 * Meine Touren: gespeicherte Touren mit Ordner, Suche und Kennzahlen.
 * Vorerst im Browser Speicher (localStorage); später über ein Konto synchronisiert.
 * Auf dem Handy liefert der Speicher vorerst nichts (kein localStorage).
 */
import { useSyncExternalStore } from 'react';

import { haversine, type LatLon, type Tour } from './tour';

export type SavedTour = Tour & {
  id: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
  minutes?: number;
  curves?: number;
};

const KEY = 'cumo.drive.touren.v1';
const listeners = new Set<() => void>();
let cache: SavedTour[] | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(): SavedTour[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(storage()?.getItem(KEY) ?? '[]') as SavedTour[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: SavedTour[]) {
  cache = list;
  try {
    storage()?.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error('Der Speicher im Browser ist voll. Lösche alte Touren oder exportiere sie als GPX.');
  }
  for (const l of listeners) l();
}

/** Linie für die Ablage ausdünnen (etwa alle 30 m ein Punkt), damit mehr Touren passen. */
function thinRuns(linie: Tour['linie']): Tour['linie'] {
  return linie.map((r) => {
    const out: LatLon[] = [];
    for (const p of r.p) {
      const last = out[out.length - 1];
      if (!last || haversine(last, p) >= 30) out.push([+p[0].toFixed(5), +p[1].toFixed(5)]);
    }
    const end = r.p[r.p.length - 1];
    if (end && out[out.length - 1] !== end) out.push(end);
    return { c: r.c, p: out };
  });
}

export function saveTour(t: Tour & { minutes?: number; curves?: number }, folder: string, id?: string): SavedTour {
  const list = read();
  const now = new Date().toISOString();
  const old = id ? list.find((x) => x.id === id) : undefined;
  const saved: SavedTour = {
    ...t,
    linie: thinRuns(t.linie),
    id: old?.id ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    folder: folder.trim(),
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  };
  write([saved, ...list.filter((x) => x.id !== saved.id)]);
  return saved;
}

export function deleteTour(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function folders(list: SavedTour[]): string[] {
  return [...new Set(list.map((t) => t.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

export type SortKey = 'neu' | 'name' | 'laenge';

export function filterTours(list: SavedTour[], q: string, folder: string | null, sort: SortKey): SavedTour[] {
  const needle = q.trim().toLowerCase();
  const out = list.filter(
    (t) => (!folder || t.folder === folder) && (!needle || `${t.name} ${t.folder}`.toLowerCase().includes(needle)),
  );
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  else if (sort === 'laenge') out.sort((a, b) => b.laenge_km - a.laenge_km);
  else out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const EMPTY: SavedTour[] = [];

/** Alle gespeicherten Touren, aktualisiert sich bei Änderungen. */
export function useLibrary(): SavedTour[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
