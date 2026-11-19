/**
 * Was sich an einer Tour ändert, wenn Punkte dazukommen, wandern oder wegfallen (Koray 19.11.2026).
 * Grundsatz: Was fest ist, bleibt fest. Die Karte zeigt nur die Etappen als „wird neu gerechnet“, die sich
 * wirklich ändern, und zeichnet danach nur diese neu. Keine geraden gestrichelten Linien durch alle Punkte mehr.
 * Reine Rechnung, ohne Karte: dieselben Bausteine taugen für App, Web Planer und später CarPlay.
 */
import { haversine, legs, type LatLon, type Tour } from "./tour";

const same = (a: LatLon, b: LatLon) => a[0] === b[0] && a[1] === b[1];

/** Etappe i der Liste a (a[i] bis a[i+1]) gilt als gleich, wenn b dieselben zwei Punkte direkt nacheinander hat */
function legsKeptIn(a: LatLon[], b: LatLon[]): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    let kept = false;
    for (let j = 0; j < b.length - 1 && !kept; j++)
      kept = same(a[i], b[j]) && same(a[i + 1], b[j + 1]);
    out.push(kept);
  }
  return out;
}

/**
 * Welche Etappen sich ändern: oldChanged je Etappe der alten Punkte (verschwindet oder wird neu gerechnet),
 * newChanged je Etappe der neuen Punkte (kommt neu dazu). Profile zählen hier nicht, nur die Lage.
 */
export function changedLegs(
  oldPts: LatLon[],
  newPts: LatLon[],
): { oldChanged: boolean[]; newChanged: boolean[] } {
  return {
    oldChanged: legsKeptIn(oldPts, newPts).map((k) => !k),
    newChanged: legsKeptIn(newPts, oldPts).map((k) => !k),
  };
}

/** Kilometerbereiche der markierten Etappen auf der Linie, benachbarte zusammengefasst. null: Punkte passen nicht zur Linie */
export function legSpans(
  tour: Tour,
  marked: boolean[],
): [number, number][] | null {
  const ls = legs(tour);
  if (ls.length !== marked.length || !ls.length) return null;
  const out: [number, number][] = [];
  ls.forEach((l, i) => {
    if (!marked[i] || l.endKm <= l.startKm) return;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - l.startKm) < 1e-6) last[1] = l.endKm;
    else out.push([l.startKm, l.endKm]);
  });
  return out;
}

/** Linie ohne die Bereiche spans (km): was bleibt, wird wie gewohnt gezeichnet */
export function withoutSpans(
  linie: Tour["linie"],
  spans: [number, number][],
): Tour["linie"] {
  if (!spans.length) return linie;
  const out: Tour["linie"] = [];
  let km = 0;
  let prev: LatLon | null = null;
  const inside = (k: number) => spans.some(([a, b]) => k > a && k < b);
  for (const run of linie) {
    let cur: LatLon[] = [];
    const flush = () => {
      if (cur.length > 1) out.push({ c: run.c, p: cur });
      cur = [];
    };
    for (const p of run.p) {
      const k0 = km;
      if (prev && !same(prev, p)) km += haversine(prev, p) / 1000;
      // Schnittpunkte an den Rändern der Bereiche, damit nichts überlappt und keine Lücke bleibt
      if (prev) {
        for (const [a, b] of spans) {
          for (const edge of [a, b]) {
            if (edge > k0 && edge < km) {
              const f = (edge - k0) / (km - k0);
              const q: LatLon = [
                prev[0] + (p[0] - prev[0]) * f,
                prev[1] + (p[1] - prev[1]) * f,
              ];
              if (edge === a) {
                cur.push(q);
                flush();
              } else {
                cur = [q];
              }
            }
          }
        }
      }
      if (inside(km)) flush();
      else cur.push(p);
      prev = p;
    }
    flush();
  }
  return out;
}

/** Punkte der Linie zwischen km a und b, mit genauen Enden */
export function lineBetween(
  pts: { p: LatLon; km: number }[],
  a: number,
  b: number,
): LatLon[] {
  if (!pts.length || b <= a) return [];
  const at = (k: number): LatLon => {
    let lo = 0;
    let hi = pts.length - 1;
    if (k <= pts[0].km) return pts[0].p;
    if (k >= pts[hi].km) return pts[hi].p;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].km < k) lo = mid;
      else hi = mid;
    }
    const f = (k - pts[lo].km) / Math.max(1e-9, pts[hi].km - pts[lo].km);
    return [
      pts[lo].p[0] + (pts[hi].p[0] - pts[lo].p[0]) * f,
      pts[lo].p[1] + (pts[hi].p[1] - pts[lo].p[1]) * f,
    ];
  };
  const out: LatLon[] = [at(a)];
  for (const x of pts) if (x.km > a && x.km < b) out.push(x.p);
  out.push(at(b));
  return out;
}

/** Richtungspfeile alle spacingKm, mit ihrer Lage auf der Linie (km), damit sie nacheinander erscheinen können */
export function arrowsWithKm(
  pts: { p: LatLon; km: number }[],
  spacingKm: number,
  max = 30,
): { p: LatLon; deg: number; km: number }[] {
  const out: { p: LatLon; deg: number; km: number }[] = [];
  if (pts.length < 2 || spacingKm <= 0) return out;
  const total = pts[pts.length - 1].km;
  const step = Math.max(spacingKm, total / max);
  for (let k = step / 2; k < total && out.length < max; k += step) {
    const seg = lineBetween(
      pts,
      Math.max(0, k - 0.02),
      Math.min(total, k + 0.02),
    );
    const a = seg[0];
    const b = seg[seg.length - 1];
    const cos = Math.cos((a[0] * Math.PI) / 180);
    const deg = (Math.atan2((b[1] - a[1]) * cos, b[0] - a[0]) * 180) / Math.PI;
    out.push({
      p: lineBetween(pts, k, k + 1e-6)[0],
      deg: (deg + 360) % 360,
      km: k,
    });
  }
  return out;
}
