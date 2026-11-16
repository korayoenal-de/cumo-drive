/**
 * Fahrspaß einer Ausfahrt (Konsistenzprüfung 15.11., K1): jede Ausfahrt ist eine Tour und zeigt ihren Wert
 * wie Touren und Community. Die Tour wird einmal geladen und der Wert im Speicher gehalten.
 */
import { useEffect, useState } from 'react';

import { ausfahrtTour } from './ausfahrten';
import { tourFun } from './fun-score';
import { flatten } from './tour';

const cache = new Map<string, number>();
const inflight = new Map<string, Promise<number>>();

export function rideFun(id: string): Promise<number> {
  const hit = cache.get(id);
  if (hit != null) return Promise.resolve(hit);
  const running = inflight.get(id);
  if (running) return running;
  const p = ausfahrtTour(id)
    .then((full) => {
      const f = full ? tourFun(flatten(full.tour).map((x) => x.p)) : null;
      const score = f ? f.score : -1;
      cache.set(id, score);
      return score;
    })
    .catch(() => -1)
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** Wert einer Ausfahrt oder null, solange er lädt; -1 heißt nicht berechenbar */
export function useRideFun(id: string | null | undefined): number | null {
  const [score, setScore] = useState<number | null>(() => (id ? (cache.get(id) ?? null) : null));
  useEffect(() => {
    if (!id) return;
    let live = true;
    void rideFun(id).then((s) => live && setScore(s));
    return () => {
      live = false;
    };
  }, [id]);
  return score;
}
