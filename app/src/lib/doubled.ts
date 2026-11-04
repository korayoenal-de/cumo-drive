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
