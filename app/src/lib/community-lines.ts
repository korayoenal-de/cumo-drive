/**
 * Linie, Mini Streckenbild und Fahrspaß der Community Routen, erst geladen, wenn eine Karte sichtbar wird.
 * listCommunity lädt bewusst nur Metadaten; die Linie kommt je Route über loadCommunityTour. Der Speicher
 * im Modul hält alles für die Sitzung, damit Scrollen, Sortieren und Tabwechsel nicht neu laden.
 * Fahrspaß rechnet wie in Meine Touren (tourFun), eine Route nach der anderen mit kurzer Pause.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { loadCommunityTour, type CommunityTour } from './community';
import { tourFun } from './fun-score';
import { thumbShape, type ThumbShape } from './route-thumb';
import { flatten, type LatLon } from './tour';

/** fun: undefined noch nicht gerechnet, -1 zu kurz oder nicht zu rechnen, sonst 0 bis 100 */
export type CommunityLine = { line: LatLon[]; thumb: ThumbShape | null; fun?: number };

type Key = Pick<CommunityTour, 'id' | 'km' | 'curves'>;

/** Ändert der Fahrer die veröffentlichte Tour, ändern sich meist Länge oder Kurven: dann neu laden */
const keyOf = (t: Key) => `${t.id}|${t.km}|${t.curves ?? ''}`;

const cache = new Map<string, CommunityLine>();
const inflight = new Map<string, Promise<CommunityLine | null>>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function put(key: string, v: CommunityLine) {
  cache.set(key, v);
  emit(key);
}

// Höchstens drei Abrufe zugleich, der Rest wartet in Reihenfolge der sichtbaren Karten
const MAX_PARALLEL = 3;
let running = 0;
const waiting: (() => void)[] = [];
function slot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const go = () => {
      running++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          running--;
          waiting.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) go();
    else waiting.push(go);
  });
}

// Fahrspaß nacheinander, damit die Liste flüssig bleibt (wie lib/tour-fun-queue.ts)
const funQueue: string[] = [];
let funBusy = false;
function pumpFun() {
  if (funBusy) return;
  const key = funQueue.shift();
  if (!key) return;
  funBusy = true;
  setTimeout(() => {
    const e = cache.get(key);
    try {
      if (e && e.fun === undefined) {
        const f = tourFun(e.line);
        put(key, { ...e, fun: f ? f.score : -1 });
      }
    } catch {
      if (e) put(key, { ...e, fun: -1 });
    } finally {
      funBusy = false;
      pumpFun();
    }
  }, 40);
}

/** Linie einer Community Route laden (oder aus dem Speicher). null, wenn sie sich nicht laden ließ. */
export function requestCommunityLine(t: Key): Promise<CommunityLine | null> {
  const key = keyOf(t);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = slot(() => loadCommunityTour(t.id))
    .then((full) => {
      const line = flatten(full.tour).map((x) => x.p);
      const v: CommunityLine = { line, thumb: thumbShape(line) };
      put(key, v);
      funQueue.push(key);
      pumpFun();
      return v;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Linie, Streckenbild und Fahrspaß einer Route; lädt erst, wenn want true wird. */
export function useCommunityLine(t: Key, want: boolean): CommunityLine | undefined {
  const key = keyOf(t);
  const subscribe = useCallback(
    (cb: () => void) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => {
        set.delete(cb);
        if (!set.size) listeners.delete(key);
      };
    },
    [key],
  );
  const v = useSyncExternalStore(subscribe, () => cache.get(key));
  const { id, km, curves } = t;
  useEffect(() => {
    if (want && !cache.has(key)) void requestCommunityLine({ id, km, curves });
  }, [want, key, id, km, curves]);
  return v;
}

/**
 * Wie weit die Liste der App gerade reicht (Scrollposition plus Höhe des Bildschirms, in Inhaltspixeln).
 * Die Karten fragen nur, ob ihre Oberkante darin liegt; so rendert eine Karte nur beim Wechsel neu.
 */
let reach = 0;
const reachListeners = new Set<() => void>();
const subscribeReach = (cb: () => void) => {
  reachListeners.add(cb);
  return () => {
    reachListeners.delete(cb);
  };
};
/** in Stufen von 160 px, damit nicht jedes Scrollbild alle Karten fragt */
export function setListReach(px: number) {
  const next = Math.ceil(px / 160) * 160;
  if (next === reach) return;
  reach = next;
  reachListeners.forEach((l) => l());
}

/** true, sobald eine Karte mit dieser Oberkante (y im Listenbereich) in Sichtweite ist */
export function useInReach(y: number | null): boolean {
  return useSyncExternalStore(subscribeReach, () => y != null && y <= reach);
}
