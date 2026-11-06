/**
 * Kennzahlen einer Tour: Höhenprofil (über Valhalla /height), Höhenmeter und Kurvenzahl.
 */
import { VALHALLA_URL } from './valhalla';
import { haversine, type LatLon } from './tour';

/** Punkte in gleichmäßigem Abstand entlang der Linie. */
export function resample(line: LatLon[], stepM: number): LatLon[] {
  if (line.length < 2) return line;
  const out: LatLon[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = haversine(a, b);
    let pos = stepM - carry;
    while (pos <= d) {
      const t = pos / d;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      pos += stepM;
    }
    carry = d - (pos - stepM);
  }
  if (out[out.length - 1] !== line[line.length - 1]) out.push(line[line.length - 1]);
  return out;
}

export type ElevationProfile = { km: number[]; m: number[]; up: number; down: number; min: number; max: number };

/** Schlüssel einer Linie für Zwischenspeicher: Punkte auf etwa 10 m gerundet */
export function lineKey(pts: LatLon[]): string {
  let h = 0;
  for (const [a, b] of pts) h = (Math.imul(h, 31) + Math.round(a * 1e4) * 7 + Math.round(b * 1e4)) | 0;
  return `${pts.length}:${h}`;
}

/** Zuletzt geladene Höhenprofile: dieselbe Tour im Planer, beim erneuten Öffnen oder Losfahren kostet kein Netz */
const elevationCache = new Map<string, ElevationProfile>();

/** Höhenprofil mit höchstens etwa 800 Punkten. */
export async function elevationProfile(line: LatLon[], signal?: AbortSignal): Promise<ElevationProfile> {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversine(line[i - 1], line[i]);
  const step = Math.max(100, total / 800);
  const pts = resample(line, step);
  const key = lineKey(pts);
  const hit = elevationCache.get(key);
  if (hit) return hit;
  const res = await fetch(`${VALHALLA_URL}/height`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range: true, shape: pts.map(([lat, lon]) => ({ lat, lon })) }),
    signal,
  });
  if (!res.ok) throw new Error(`Höhendaten: Fehler ${res.status}`);
  const data = (await res.json()) as { range_height: [number, number | null][] };
  const km: number[] = [];
  const m: number[] = [];
  for (const [dist, h] of data.range_height) {
    if (h === null || h < -500) continue;
    km.push(dist / 1000);
    m.push(h);
  }
  // Höhenmeter mit kleiner Schwelle, damit Rauschen nicht mitzählt
  let up = 0;
  let down = 0;
  let ref = m[0] ?? 0;
  for (const h of m) {
    if (h - ref > 5) {
      up += h - ref;
      ref = h;
    } else if (ref - h > 5) {
      down += ref - h;
      ref = h;
    }
  }
  const profile = { km, m, up: Math.round(up), down: Math.round(down), min: Math.min(...m), max: Math.max(...m) };
  elevationCache.set(key, profile);
  if (elevationCache.size > 12) elevationCache.delete(elevationCache.keys().next().value!);
  return profile;
}

function heading(a: LatLon, b: LatLon) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2(b[0] - a[0], (b[1] - a[1]) * k) * 180) / Math.PI;
}

/**
 * Kurvenzahl: Eine Kurve zählt, wenn sich die Richtung innerhalb von höchstens 150 m
 * um mindestens 90 Grad in dieselbe Richtung dreht (Abtastung alle 60 m).
 * An der RCO EAST 26 E3 kalibriert: 157 Kurven, calimoto zeigt 152.
 */
export function countCurves(line: LatLon[]): number {
  const STEP = 60;
  const pts = resample(line, STEP);
  let curves = 0;
  let acc = 0;
  let span = 0;
  let lastSign = 0;
  for (let i = 2; i < pts.length; i++) {
    let d = heading(pts[i - 1], pts[i]) - heading(pts[i - 2], pts[i - 1]);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const sign = Math.sign(d);
    if (Math.abs(d) < 3 || (lastSign && sign !== lastSign)) {
      acc = 0;
      span = 0;
    }
    acc += Math.abs(d);
    span += STEP;
    lastSign = sign;
    if (acc >= 90 && span <= 150) {
      curves++;
      acc = 0;
      span = 0;
    } else if (span > 150) {
      acc = 0;
      span = 0;
    }
  }
  return curves;
}
