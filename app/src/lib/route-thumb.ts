/**
 * Mini Streckenbild: Linie auf eine quadratische Fläche gelegt (gemeinsam für Meine Touren und Community,
 * App und Web). Reine Rechnung, damit sie einmal je Strecke läuft und nicht in jedem Render.
 */
import type { LatLon } from './tour';

/** points als fertiger Text für Polyline, start für den Punkt am Anfang */
export type ThumbShape = { points: string; start: readonly [number, number] };

export function thumbShape(line: LatLon[], size = 56, pad = 8): ThumbShape | null {
  if (line.length < 2) return null;
  const step = Math.max(1, Math.floor(line.length / 120));
  const sample = line.filter((_, i) => i % step === 0 || i === line.length - 1);
  let s = 90, n = -90, w = 180, e = -180;
  for (const [la, lo] of sample) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const spanX = (e - w) * k || 1e-6;
  const spanY = n - s || 1e-6;
  const f = (size - pad * 2) / Math.max(spanX, spanY);
  const ox = (size - spanX * f) / 2;
  const oy = (size - spanY * f) / 2;
  const pts = sample.map(([la, lo]) => [ox + (lo - w) * k * f, oy + (n - la) * f] as const);
  return { points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), start: pts[0] };
}
