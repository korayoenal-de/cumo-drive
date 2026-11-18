/**
 * Treffer auf der Community Karte selbst ausrechnen (Koray 17.11., zweiter Anlauf): weit herausgezoomt waren die
 * weißen Punkte kaum zu treffen, die dunklen Marken nah nur mit Glück. Das iPhone gibt einer Marke nur die Fläche ihres
 * gezeichneten Bildes, und eng liegende Marken überdecken sich. Darum entscheidet jetzt jeder Tipp auf die Karte über
 * den Abstand in Bildschirmpunkten: die nächste Marke im Umkreis gewinnt, auch wenn der Finger knapp daneben lag.
 *
 * Reine Rechnungen ohne React, getestet in lib.test.ts.
 */
import type { LatLon } from './tour';

export type HitRegion = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type HitStage = 'weit' | 'region' | 'nah';
export type HitPin = { id: string; kind: 'route' | 'ausfahrt' | 'driver'; p: LatLon };

/** Fangradius je Stufe in Punkten: weit klein gezeichnet, aber großzügig gefangen */
export const HIT_RADIUS: Record<HitStage, number> = { weit: 34, region: 34, nah: 38 };

/** Punkte je Grad Länge und Breite im Ausschnitt (Mercator, örtlich) */
function scale(region: HitRegion, widthPt: number, lat: number) {
  const perLon = widthPt / Math.max(1e-6, region.longitudeDelta);
  return { perLon, perLat: perLon / Math.max(0.05, Math.cos((lat * Math.PI) / 180)) };
}

/**
 * Nächste Marke zum Tipp oder null. In der Stufe Nah sitzt die Marke als breite Plakette über ihrem Punkt (Spitze
 * unten): dort zählt die Mitte der Plakette, und seitlich reicht sie weiter als nach oben und unten.
 */
export function pickPin<T extends HitPin>(pins: T[], at: LatLon, region: HitRegion, widthPt: number, stage: HitStage, selected: string | null = null): T | null {
  const { perLon, perLat } = scale(region, widthPt, at[0]);
  let best: T | null = null;
  let bestD = Infinity;
  for (const p of pins) {
    // gewählte Marke ist immer die volle Plakette
    const look: HitStage = p.id === selected ? 'nah' : stage;
    const plate = look === 'nah' && p.kind !== 'driver';
    const lift = plate ? 22 : 0;
    const dx = (p.p[1] - at[1]) * perLon;
    const dy = (at[0] - p.p[0]) * perLat - lift;
    // Plakette etwa 90 pt breit und 37 pt hoch: seitlich halb so stark gewichtet
    const d = Math.hypot(plate ? dx * 0.55 : dx, dy);
    if (d <= HIT_RADIUS[look] && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Breite der gewählten Strecke nach ihrer Größe auf dem Bildschirm (Koray 17.11.: herausgezoomt wurde sie zum orangen
 * Fleck). Klein gezeichnet dünn und ohne Schatten, damit die Form lesbar bleibt.
 */
export function routeStroke(line: LatLon[], region: HitRegion, widthPt: number): { width: number; shadow: number } {
  if (line.length < 2) return { width: 5, shadow: 8 };
  let minLa = Infinity;
  let maxLa = -Infinity;
  let minLo = Infinity;
  let maxLo = -Infinity;
  for (const [la, lo] of line) {
    if (la < minLa) minLa = la;
    if (la > maxLa) maxLa = la;
    if (lo < minLo) minLo = lo;
    if (lo > maxLo) maxLo = lo;
  }
  const { perLon, perLat } = scale(region, widthPt, (minLa + maxLa) / 2);
  const extent = Math.max((maxLo - minLo) * perLon, (maxLa - minLa) * perLat);
  if (extent < 70) return { width: 2, shadow: 0 };
  if (extent < 160) return { width: 3, shadow: 0 };
  if (extent < 260) return { width: 4, shadow: 6 };
  return { width: 5, shadow: 8 };
}

/**
 * Strecke für die Anzeige ausdünnen (Douglas Peucker in Bildschirmpunkten, Toleranz 0,8 pt): weit herausgezoomt
 * liegen sonst tausende Punkte auf wenigen Pixeln und die Linie verklumpt.
 */
export function simplifyForScreen(line: LatLon[], region: HitRegion, widthPt: number, tolPt = 0.8): LatLon[] {
  if (line.length < 3) return line;
  const { perLon, perLat } = scale(region, widthPt, line[0][0]);
  const xs = line.map((p) => p[1] * perLon);
  const ys = line.map((p) => p[0] * perLat);
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  const tol2 = tolPt * tolPt;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = xs[a];
    const ay = ys[a];
    const vx = xs[b] - ax;
    const vy = ys[b] - ay;
    const len2 = vx * vx + vy * vy;
    let far = -1;
    let farD = tol2;
    for (let i = a + 1; i < b; i++) {
      let t = len2 > 0 ? ((xs[i] - ax) * vx + (ys[i] - ay) * vy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * vx - xs[i];
      const ey = ay + t * vy - ys[i];
      const d2 = ex * ex + ey * ey;
      if (d2 > farD) {
        farD = d2;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return line.filter((_, i) => keep[i] === 1);
}

/**
 * Abstand vom Tipp zur nächsten Stelle einer Linie in km (örtlich flach gerechnet, für Treffer genau genug).
 * Für überlagernde Touren (Koray 17.11.): welche Touren laufen unter dem Finger.
 */
export function kmToLine(line: LatLon[], at: LatLon): number {
  if (!line.length) return Number.POSITIVE_INFINITY;
  const kx = 111.32 * Math.cos((at[0] * Math.PI) / 180);
  const ky = 110.57;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[Math.min(i + 1, line.length - 1)];
    const ax = (a[1] - at[1]) * kx;
    const ay = (a[0] - at[0]) * ky;
    const bx = (b[1] - at[1]) * kx;
    const by = (b[0] - at[0]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

/** Fangradius in km für den Ausschnitt (Treffer auf Linien gleich groß wie auf Pins) */
export function hitKm(region: HitRegion, widthPt: number, radiusPt = HIT_RADIUS.region): number {
  const kmPerPt = (region.longitudeDelta * 111.32 * Math.cos((region.latitude * Math.PI) / 180)) / Math.max(1, widthPt);
  return radiusPt * kmPerPt;
}

/**
 * Treffer über echte Bildschirmpunkte (Koray 18.11.): die Karte selbst sagt, wo eine Marke gerade liegt
 * (pointForCoordinate). Das stimmt auch in 3D Satellit und auf dem Globus, wo der gemeldete Ausschnitt und die
 * Mercator Rechnung oben daneben liegen und Tipps deshalb ins Leere gingen. Die nächste Marke im Umkreis gewinnt.
 * lift und wide beschreiben eine Plakette über ihrem Punkt (Stufe Nah). Schlägt die Abfrage fehl: undefined, dann
 * rechnet der Aufrufer wie bisher.
 */
export async function pickOnScreen<T extends { id: string; p: LatLon }>(
  pins: T[],
  tap: { x: number; y: number },
  project: (p: LatLon) => Promise<{ x: number; y: number }>,
  radius: (pin: T) => number,
  shape?: (pin: T) => { lift: number; wide: boolean },
): Promise<T | null | undefined> {
  try {
    const pts = await Promise.all(pins.map((p) => project(p.p)));
    let best: T | null = null;
    let bestD = Infinity;
    pins.forEach((p, i) => {
      const pt = pts[i];
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const sh = shape?.(p) ?? { lift: 0, wide: false };
      const dx = pt.x - tap.x;
      const dy = pt.y - sh.lift - tap.y;
      const d = Math.hypot(sh.wide ? dx * 0.55 : dx, dy);
      if (d <= radius(p) && d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  } catch {
    return undefined;
  }
}
