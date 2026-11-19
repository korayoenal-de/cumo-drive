/**
 * Punkte einer Tour für den Router auffächern: An Pässen und gewählten Strecken kommen Stützpunkte dazu, damit die
 * Route über die Passhöhe weiterfährt statt zu wenden. Aus use-tour-plan.ts herausgelöst (19.11.2026), damit eine
 * geöffnete Tour mit denselben Punkten vermerkt wird, mit denen später verglichen wird.
 */
import { HIGHLIGHT_ROADS, PREFER_ROADS } from "./highlight-roads";
import { haversine, type LatLon, type Profile } from "./tour";

const keyOf = (p: LatLon) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/**
 * Zwischenziel mitten auf einer kuratierten Strecke, etwa eine Passhöhe (Koray 9.11., Hahntennjoch):
 * Die Route fährt über den Punkt hinaus ein Stück auf der Strecke weiter, in der Richtung, die besser zwischen
 * den Nachbarpunkten liegt, statt zu wenden. Den Weg davor und danach wählt der Router (16.11., Sellajoch).
 * Sonst fährt der Router zur Passhöhe hinauf und auf demselben Weg wieder hinunter.
 * Nur Strecken bis 40 km, und nur wenn der Punkt nicht am Anfang oder Ende liegt.
 */
function crossingFor(p: LatLon, prev: LatLon, next: LatLon): LatLon[] | null {
  let best: { line: LatLon[]; d: number } | null = null;
  for (const r of [...HIGHLIGHT_ROADS, ...PREFER_ROADS]) {
    const line = r.line;
    if (line.length < 3) continue;
    const a = line[0];
    const b = line[line.length - 1];
    if (Math.abs(a[0] - p[0]) > 0.4 || Math.abs(a[1] - p[1]) > 0.6) continue;
    let near = Infinity;
    for (const q of line) near = Math.min(near, haversine(q, p));
    if (near > 400 || haversine(a, p) < 1500 || haversine(b, p) < 1500)
      continue;
    let len = 0;
    for (let i = 1; i < line.length; i++)
      len += haversine(line[i - 1], line[i]);
    if (len > 40000) continue;
    if (!best || near < best.d) best = { line, d: near };
  }
  if (!best) return null;
  const l = best.line;
  const fwd = haversine(prev, l[0]) + haversine(l[l.length - 1], next);
  const back = haversine(prev, l[l.length - 1]) + haversine(l[0], next);
  return fwd <= back ? l : [...l].reverse();
}

/** So weit über einen Pass hinaus wird die Strecke erzwungen: über die Passhöhe, nicht zurück */
const PAST_M = 2000;

/** Punkt der Linie etwa m Meter nach dem Index at (oder das Ende, wenn sie vorher aufhört) */
function pastPoint(line: LatLon[], at: number, m: number): LatLon | null {
  let d = 0;
  for (let i = at + 1; i < line.length; i++) {
    d += haversine(line[i - 1], line[i]);
    if (d >= m) return line[i];
  }
  return at < line.length - 1 ? line[line.length - 1] : null;
}

/** Stützpunkte entlang einer Strecke: etwa alle 2,5 km und der Ausstieg, die ersten 1,5 km frei */
function shapePoints(line: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  let since = 0;
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const d = haversine(line[i - 1], line[i]);
    since += d;
    total += d;
    if (since >= 2500 && total >= 1500) {
      out.push(line[i]);
      since = 0;
    }
  }
  const end = line[line.length - 1];
  if (!out.length || haversine(out[out.length - 1], end) > 600) out.push(end);
  else out[out.length - 1] = end;
  return out;
}

/** roads: gewählte Strecken je Punkt (Schlüssel wie keyOf im Planer) */
export function expandPoints(
  points: LatLon[],
  profiles: Profile[],
  roads: Record<string, { name: string; line: LatLon[] }>,
): { xPts: LatLon[]; xProf: Profile[] } {
  const xPts: LatLon[] = [];
  const xProf: Profile[] = [];
  points.forEach((p, i) => {
    const inner = i > 0 && i < points.length - 1;
    const cross =
      inner && !roads[keyOf(p)]
        ? crossingFor(p, points[i - 1], points[i + 1])
        : null;
    if (cross) {
      // Nur ein Stück über den Punkt hinaus auf der Strecke weiter, damit die Route nicht denselben Weg
      // zurückfährt. Wohin danach, entscheidet der nächste Punkt (Koray 16.11.: Sellajoch zum Pordoijoch
      // führte erst bis Canazei, dem Ende der Strecke Sellajoch, und wieder hinauf)
      let at = 0;
      cross.forEach((q, k) => {
        if (haversine(q, p) < haversine(cross[at], p)) at = k;
      });
      xPts.push(p);
      xProf.push(profiles[i]);
      const beyond = pastPoint(cross, at, PAST_M);
      // nur wenn es dort Richtung nächster Punkt weitergeht; zweigt er an der Passhöhe ab, entstünde ein Stich
      // (Koray 16.11.: Falzarego, danach Valparola, fuhr erst 2 km Richtung Andraz hinunter und zurück)
      const next = points[i + 1];
      if (
        beyond &&
        haversine(beyond, next) > 1500 &&
        haversine(beyond, next) < haversine(p, next)
      ) {
        xPts.push(beyond);
        xProf.push(profiles[i]);
      }
      return;
    }
    xPts.push(p);
    if (i < profiles.length) xProf.push(profiles[i]);
    const r = inner ? roads[keyOf(p)] : undefined;
    if (r)
      for (const q of shapePoints(r.line)) {
        xPts.push(q);
        xProf.push(profiles[i]);
      }
  });
  return { xPts, xProf };
}
