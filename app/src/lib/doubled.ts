/**
 * Doppelt gefahrene Strecke finden: Abschnitte, auf denen die Route später dieselbe Straße noch
 * einmal fährt (Hin und zurück zum Pass, Rückweg nach Hause auf dem Hinweg).
 *
 * Die Linie wird alle STEP Meter abgetastet. Ein Stützpunkt zählt als doppelt, wenn ein früherer
 * Stützpunkt, der mindestens minGap Meter Strecke davor liegt, näher als tol Meter ist.
 * Ein Raster aus Zellen hält die Suche auch bei langen Touren schnell.
 */
import { haversine, type LatLon } from './tour';

const STEP = 100;

export type Doubled = {
  /** doppelt gefahrene Kilometer */
  km: number;
  /** Stützpunkte auf den doppelten Stücken, etwa alle 400 m, zum Bestrafen im Router */
  points: LatLon[];
};

export function doubledStretch(line: LatLon[], minGap = 1500, tol = 35): Doubled {
  const samples = resample(line, STEP);
  if (samples.length < 3) return { km: 0, points: [] };
  const cell = 0.001; // etwa 110 m in der Breite, groß genug für tol
  const grid = new Map<string, number[]>();
  const key = (la: number, lo: number) => `${Math.floor(la / cell)}:${Math.floor(lo / cell)}`;
  const gapSteps = Math.ceil(minGap / STEP);
  let hits = 0;
  const points: LatLon[] = [];
  let lastPick = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    // frühere Stützpunkte erst in das Raster, wenn sie weit genug zurück liegen
    const j = i - gapSteps;
    if (j >= 0) {
      const q = samples[j];
      const k = key(q[0], q[1]);
      const arr = grid.get(k);
      if (arr) arr.push(j);
      else grid.set(k, [j]);
    }
    if (i < gapSteps) continue;
    const ci = Math.floor(p[0] / cell);
    const cj = Math.floor(p[1] / cell);
    let found = false;
    for (let a = -1; a <= 1 && !found; a++) {
      for (let b = -1; b <= 1 && !found; b++) {
        const arr = grid.get(`${ci + a}:${cj + b}`);
        if (!arr) continue;
        for (const idx of arr) {
          if (haversine(samples[idx], p) <= tol) {
            found = true;
            break;
          }
        }
      }
    }
    if (found) {
      hits++;
      if (i - lastPick >= 4) {
        points.push(p);
        lastPick = i;
      }
    }
  }
  return { km: +((hits * STEP) / 1000).toFixed(1), points };
}

/** Linie in gleichen Abständen abtasten. */
function resample(line: LatLon[], step: number): LatLon[] {
  if (line.length < 2) return line;
  const out: LatLon[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = haversine(a, b);
    if (d === 0) continue;
    let t = step - carry;
    while (t <= d) {
      const f = t / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      t += step;
    }
    carry = d - (t - step);
  }
  return out;
}

/** Abschnitt einer Linie: doppelt heißt, die Route fährt diese Straße an anderer Stelle noch einmal. */
export type LinePart = { p: LatLon[]; doubled: boolean };

/** Linie so verdichten, dass zwei Punkte höchstens step Meter auseinander liegen (Ecken bleiben erhalten). */
function densify(line: LatLon[], step: number): LatLon[] {
  const out: LatLon[] = line.length ? [line[0]] : [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const n = Math.ceil(haversine(a, b) / step);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/**
 * Teilt die Abschnitte einer Tour (in Fahrreihenfolge) in einfach und doppelt gefahrene Stücke.
 * Doppelt: Ein Punkt liegt höchstens tol Meter neben einem anderen, der mindestens minGap Meter
 * Strecke davor oder danach kommt (Hin und Rückweg auf derselben Straße). Für die Karte, die
 * solche Stücke als zwei versetzte Linien mit Richtungspfeilen zeigt.
 */
export function splitDoubled(runs: LatLon[][], minGap = 1500, tol = 35): LinePart[][] {
  const dense = runs.map((r) => densify(r, 25));
  const pts: { p: LatLon; m: number }[] = [];
  let m = 0;
  for (const r of dense) {
    r.forEach((p, i) => {
      if (i > 0) m += haversine(r[i - 1], p);
      else if (pts.length) m += haversine(pts[pts.length - 1].p, p);
      pts.push({ p, m });
    });
  }
  const cell = 0.0005;
  const key = (p: LatLon) => `${Math.floor(p[0] / cell)}:${Math.floor(p[1] / cell)}`;
  const grid = new Map<string, number[]>();
  pts.forEach((x, i) => {
    const k = key(x.p);
    const a = grid.get(k);
    if (a) a.push(i);
    else grid.set(k, [i]);
  });
  const flag = pts.map((x) => {
    const ci = Math.floor(x.p[0] / cell);
    const cj = Math.floor(x.p[1] / cell);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const j of grid.get(`${ci + a}:${cj + b}`) ?? []) {
          if (Math.abs(pts[j].m - x.m) >= minGap && haversine(pts[j].p, x.p) <= tol) return true;
        }
    return false;
  });
  // kurze Ausreißer glätten: einzelne Treffer unter 150 m zählen nicht
  const out: LinePart[][] = [];
  let idx = 0;
  for (const r of dense) {
    const parts: LinePart[] = [];
    for (let i = 0; i < r.length; i++, idx++) {
      const d = flag[idx];
      const last = parts[parts.length - 1];
      if (last && last.doubled === d) last.p.push(r[i]);
      else {
        // Übergang: den Punkt in beiden Teilen führen, damit keine Lücke entsteht
        if (last) last.p.push(r[i]);
        parts.push({ p: [r[i]], doubled: d });
      }
    }
    const merged: LinePart[] = [];
    for (const part of parts) {
      let len = 0;
      for (let i = 1; i < part.p.length; i++) len += haversine(part.p[i - 1], part.p[i]);
      const prev = merged[merged.length - 1];
      if (part.doubled && len < 150 && prev) {
        prev.p.push(...part.p.slice(1));
        continue;
      }
      if (prev && prev.doubled === part.doubled) prev.p.push(...part.p.slice(1));
      else merged.push({ p: [...part.p], doubled: part.doubled });
    }
    out.push(merged.filter((x) => x.p.length > 1));
  }
  return out;
}

/** Linie um meters nach rechts versetzen (in Fahrtrichtung gesehen, wie Rechtsverkehr). */
export function offsetRight(line: LatLon[], meters: number): LatLon[] {
  const k = 111320;
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const cos = Math.cos((p[0] * Math.PI) / 180);
    const dx = (b[1] - a[1]) * cos;
    const dy = b[0] - a[0];
    const len = Math.hypot(dx, dy) || 1;
    // rechts von (dx, dy) ist (dy, -dx)
    return [p[0] + ((-dx / len) * meters) / k, p[1] + ((dy / len) * meters) / (k * cos)] as LatLon;
  });
}

/** Pfeile entlang einer Linie: alle spacing Meter ein Punkt mit Fahrtrichtung in Grad (0 = Norden). */
export function arrowsAlong(line: LatLon[], spacing: number, max = 30): { p: LatLon; deg: number }[] {
  const out: { p: LatLon; deg: number }[] = [];
  let next = spacing / 2;
  let m = 0;
  for (let i = 1; i < line.length && out.length < max; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = haversine(a, b);
    while (d > 0 && m + d >= next && out.length < max) {
      const f = (next - m) / d;
      const cos = Math.cos((a[0] * Math.PI) / 180);
      const deg = (Math.atan2((b[1] - a[1]) * cos, b[0] - a[0]) * 180) / Math.PI;
      out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], deg: (deg + 360) % 360 });
      next += spacing;
    }
    m += d;
  }
  return out;
}
