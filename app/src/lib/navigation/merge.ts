/**
 * Wo trifft eine neue Route wieder auf die alte Tour? Für die gelbe abweichende Strecke nach Neue Route ab hier.
 */
import { haversine, type LatLon } from '../tour';

/** So nah an der alten Tour gilt ein Punkt als darauf, und so lange muss es so bleiben */
const ON_OLD_M = 25;
const ON_OLD_RUN_M = 200;

/**
 * Erster Punkt der neuen Route, ab dem sie wieder der alten Tour folgt (mindestens ON_OLD_RUN_M am Stück).
 * Die alte Linie liegt dafür in einem Raster von etwa 100 m, so bleibt es auch bei langen Touren schnell.
 * Ohne Treffer der letzte Punkt: dann ist die ganze neue Route abweichend.
 */
export function mergeIndex(shape: LatLon[], old: LatLon[]): number {
  if (shape.length < 2 || old.length < 2) return 0;
  const cell = (p: LatLon) => `${Math.floor(p[0] * 1000)},${Math.floor(p[1] * 700)}`;
  const grid = new Map<string, LatLon[]>();
  for (let i = 0; i < old.length; i++) {
    // auch die Mitte langer Abschnitte eintragen, damit gerade Stücke keine Lücken haben
    const a = old[i];
    const b = old[i + 1];
    const steps = b ? Math.max(1, Math.ceil(haversine(a, b) / 40)) : 1;
    for (let k = 0; k < steps; k++) {
      const p: LatLon = b ? [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps] : a;
      const key = cell(p);
      const list = grid.get(key);
      if (list) list.push(p);
      else grid.set(key, [p]);
    }
  }
  const near = (p: LatLon) => {
    const la = Math.floor(p[0] * 1000);
    const lo = Math.floor(p[1] * 700);
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++) for (const q of grid.get(`${la + x},${lo + y}`) ?? []) if (haversine(p, q) < ON_OLD_M) return true;
    return false;
  };
  let start = -1;
  let run = 0;
  for (let i = 0; i < shape.length; i++) {
    if (near(shape[i])) {
      if (start < 0) {
        start = i;
        run = 0;
      } else run += haversine(shape[i - 1], shape[i]);
      if (run >= ON_OLD_RUN_M) return start;
    } else start = -1;
  }
  return shape.length - 1;
}
