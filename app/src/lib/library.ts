/**
 * Meine Touren: gespeicherte Touren mit Ordner, Suche und Kennzahlen.
 * Im Browser im localStorage, in der App im AsyncStorage, und sobald man angemeldet ist, im Konto (Supabase).
 * syncLibrary gleicht beides ab: lokale Touren gehen hoch, Touren aus dem Konto kommen dazu.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { deleteCloudTour, listCloudTours, loadCloudTour, saveCloudTour } from './cloud-tours';
import { supabase } from './supabase';
import { haversine, type LatLon, type Profile, type Tour } from './tour';

export type SavedTour = Tour & {
  id: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
  minutes?: number;
  curves?: number;
  profile?: Profile;
  /** ID im Konto, sobald synchronisiert */
  cloudId?: string;
  /** Zeitpunkt des letzten Abgleichs (updatedAt danach heißt: lokal geändert) */
  syncedAt?: string;
  /** In der Community veröffentlicht */
  published?: boolean;
  /** Fahrspaß Wert 0 bis 100, -1 wenn keiner berechenbar ist; fehlt er, rechnet die Liste ihn nach */
  fun?: number;
  /** Stand der Rechnung zu fun (TOUR_FUN_VERSION) */
  funV?: number;
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
  const st = storage();
  if (!st) {
    // App: AsyncStorage ist asynchron, bis zum Laden gilt die leere Liste
    cache = [];
    void hydrate();
    return cache;
  }
  try {
    cache = JSON.parse(st.getItem(KEY) ?? '[]') as SavedTour[];
  } catch {
    cache = [];
  }
  return cache;
}

let hydrating = false;
async function hydrate() {
  if (hydrating) return;
  hydrating = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as SavedTour[]) : [];
    // was in der Zwischenzeit gespeichert wurde, bleibt vorn
    const now = cache ?? [];
    const ids = new Set(now.map((t) => t.id));
    cache = [...now, ...stored.filter((t) => !ids.has(t.id))];
    for (const l of listeners) l();
  } catch {
    // ohne Speicher bleibt die Liste leer
  }
}

function write(list: SavedTour[]) {
  cache = list;
  const st = storage();
  if (st) {
    try {
      st.setItem(KEY, JSON.stringify(list));
    } catch {
      throw new Error('Der Speicher im Browser ist voll. Lösche alte Touren oder exportiere sie als GPX.');
    }
  } else {
    void AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
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

export function saveTour(t: Tour & { minutes?: number; curves?: number; profile?: Profile }, folder: string, id?: string): SavedTour {
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
    cloudId: old?.cloudId,
    syncedAt: old?.syncedAt,
    // Strecke kann sich geändert haben: Fahrspaß neu rechnen lassen
    fun: undefined,
  };
  write([saved, ...list.filter((x) => x.id !== saved.id)]);
  return saved;
}

/** Gespeicherte Tour umbenennen (Koray 10.11.); geht beim nächsten Abgleich auch ins Konto und in die Community. */
export function renameTour(id: string, name: string) {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!n) return;
  write(read().map((x) => (x.id === id ? { ...x, name: n, updatedAt: new Date().toISOString() } : x)));
  void syncLibrary();
}

/**
 * Tour duplizieren (Koray 10.11.): Kopie mit „Kopie“ im Namen im selben Ordner, ohne Konto Verknüpfung
 * und unveröffentlicht. Der nächste Abgleich legt sie im Konto an. Liefert die Kopie.
 */
export function duplicateTour(id: string): SavedTour | null {
  const list = read();
  const t = list.find((x) => x.id === id);
  if (!t) return null;
  const now = new Date().toISOString();
  const base = t.name.replace(/\s+Kopie(\s+\d+)?$/, '');
  const names = new Set(list.map((x) => x.name));
  let name = `${base} Kopie`;
  for (let n = 2; names.has(name); n++) name = `${base} Kopie ${n}`;
  const copy: SavedTour = {
    ...t,
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.slice(0, 120),
    createdAt: now,
    updatedAt: now,
    cloudId: undefined,
    syncedAt: undefined,
    published: undefined,
  };
  write([copy, ...list]);
  void syncLibrary();
  return copy;
}

/** Felder ändern, ohne die Tour als geändert zu markieren (zum Beispiel nach dem Veröffentlichen). */
export function patchTour(id: string, patch: Partial<SavedTour>) {
  write(read().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

/** Alle Touren nur auf diesem Gerät entfernen (nach dem Löschen des Kontos) */
export function clearLocalTours() {
  write([]);
}

export function deleteTour(id: string) {
  const t = read().find((x) => x.id === id);
  write(read().filter((x) => x.id !== id));
  if (t?.cloudId) void deleteCloudTour(t.cloudId).catch(() => undefined);
}

export type SyncState = { running: boolean; last: string | null; error: string | null };
let sync: SyncState = { running: false, last: null, error: null };
const syncListeners = new Set<() => void>();
function setSync(p: Partial<SyncState>) {
  sync = { ...sync, ...p };
  for (const l of syncListeners) l();
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => {
        syncListeners.delete(l);
      };
    },
    () => sync,
    () => sync,
  );
}

/** Lokale Touren und Konto abgleichen (nur angemeldet). */
export async function syncLibrary(): Promise<void> {
  // Sofort als laufend markieren: zwei Aufrufe kurz hintereinander (Tab Fokus, Anmeldung, Speichern)
  // haben sonst dieselbe Tour doppelt hochgeladen und die Kopie danach wieder heruntergeladen.
  if (sync.running) return;
  setSync({ running: true, error: null });
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    setSync({ running: false });
    return;
  }
  try {
    // 1. lokal neue oder geänderte Touren hochladen
    for (const t of read()) {
      if (t.cloudId && t.syncedAt && t.syncedAt >= t.updatedAt) continue;
      const cloudId = await saveCloudTour(t, { id: t.cloudId, folder: t.folder, profile: t.profile });
      const now = new Date().toISOString();
      write(read().map((x) => (x.id === t.id ? { ...x, cloudId, syncedAt: now, updatedAt: x.updatedAt > now ? x.updatedAt : now } : x)));
    }
    // 2. Touren aus dem Konto, die hier fehlen, herunterladen
    const local = new Set(read().map((x) => x.cloudId).filter(Boolean));
    for (const c of await listCloudTours()) {
      if (local.has(c.id)) continue;
      const full = await loadCloudTour(c.id);
      const saved: SavedTour = {
        ...full.tour,
        linie: thinRuns(full.tour.linie),
        id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        folder: c.folder,
        createdAt: c.updated_at,
        updatedAt: c.updated_at,
        curves: c.curves ?? undefined,
        profile: c.profile,
        cloudId: c.id,
        syncedAt: c.updated_at,
      };
      write([saved, ...read()]);
    }
    // 3. Doppelte aufräumen: gleicher Name, gleiche Länge, gleiche Strecke, gleicher Ordner.
    //    Die älteste bleibt, die Kopien gehen auch im Konto. Seit 10.11. ohne Zeitfenster, weil ein
    //    Abgleich Fehler Kopien über Stunden verteilt angelegt hat. Veröffentlichte bleiben immer.
    const seen = new Map<string, SavedTour>();
    const dupes: SavedTour[] = [];
    for (const t of [...read()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      // Start und Ziel statt Punktzahl: heruntergeladene Kopien sind ausgedünnt und haben weniger Punkte
      const a0 = t.wegpunkte[0];
      const a1 = t.wegpunkte[t.wegpunkte.length - 1];
      const ends = a0 && a1 ? `${a0[0].toFixed(4)},${a0[1].toFixed(4)},${a1[0].toFixed(4)},${a1[1].toFixed(4)},${t.wegpunkte.length}` : '';
      const key = `${t.name}|${Math.round(t.laenge_km * 10)}|${ends}|${t.folder}`;
      const first = seen.get(key);
      if (first && !t.published) dupes.push(t);
      else if (!first) seen.set(key, t);
    }
    for (const d of dupes) deleteTour(d.id);
    setSync({ running: false, last: new Date().toISOString() });
  } catch (e) {
    setSync({ running: false, error: (e as Error).message });
  }
}

export function folders(list: SavedTour[]): string[] {
  return [...new Set(list.map((t) => t.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

export type SortKey = 'neu' | 'name' | 'laenge' | 'spass';

export function filterTours(list: SavedTour[], q: string, folder: string | null, sort: SortKey): SavedTour[] {
  const needle = q.trim().toLowerCase();
  const out = list.filter(
    (t) => (!folder || t.folder === folder) && (!needle || `${t.name} ${t.folder}`.toLowerCase().includes(needle)),
  );
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  else if (sort === 'laenge') out.sort((a, b) => b.laenge_km - a.laenge_km);
  else if (sort === 'spass') out.sort((a, b) => (b.fun ?? -1) - (a.fun ?? -1));
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
