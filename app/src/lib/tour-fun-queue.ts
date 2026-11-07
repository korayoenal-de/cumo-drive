/**
 * Fahrspaß Wert für gespeicherte Touren nachrechnen: eine Tour nach der anderen mit kurzer Pause,
 * damit die Liste flüssig bleibt. Das Ergebnis landet in der Tour (patchTour), ohne sie als geändert zu markieren.
 */
import { tourFun } from './fun-score';
import { patchTour, type SavedTour } from './library';
import { flatten } from './tour';

const queue: SavedTour[] = [];
const queued = new Set<string>();
let busy = false;

function pump() {
  if (busy) return;
  const t = queue.shift();
  if (!t) return;
  busy = true;
  setTimeout(() => {
    try {
      const f = tourFun(flatten(t).map((x) => x.p));
      patchTour(t.id, { fun: f ? f.score : -1 });
    } catch {
      patchTour(t.id, { fun: -1 });
    } finally {
      queued.delete(t.id);
      busy = false;
      pump();
    }
  }, 40);
}

export function ensureTourFun(t: SavedTour) {
  if (t.fun != null || queued.has(t.id)) return;
  queued.add(t.id);
  queue.push(t);
  pump();
}
