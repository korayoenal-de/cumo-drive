/**
 * Fahrspaß Pegel: sechs Dreiecke auf einem offenen Kreis (Lücke unten), Spitzen zur Mitte, wie das
 * CDC Keyvisual. Fünf Stufen füllen 1, 2, 4, 5 und 6 Dreiecke in Signal Orange (Design Prinzipien 5b).
 */
import Svg, { Polygon } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export type FunLevel = 1 | 2 | 3 | 4 | 5;

export const FUN_NAMES: Record<FunLevel, string> = { 1: 'Nett', 2: 'Lohnend', 3: 'Stark', 4: 'Traumstraße', 5: 'Legende' };

const FILLED: Record<FunLevel, number> = { 1: 1, 2: 2, 3: 4, 4: 5, 5: 6 };
const COUNT = 6;
const R = 8.3;
const H = 4.9;
const W = 3.18;
const OFF = '#3A3A3F';

/** Eckpunkte der sechs Dreiecke im 24er Raster, einmal berechnet. */
const TRIS = Array.from({ length: COUNT }, (_, i) => {
  const a = ((-135 + (i * 270) / (COUNT - 1)) * Math.PI) / 180;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);
  const bx = 12 + ux * (R + H / 2);
  const by = 12 + uy * (R + H / 2);
  const f = (v: number) => v.toFixed(2);
  return `${f(12 + ux * (R - H / 2))},${f(12 + uy * (R - H / 2))} ${f(bx + px * W)},${f(by + py * W)} ${f(bx - px * W)},${f(by - py * W)}`;
});

export function FunGauge({ level, size = 20 }: { level: FunLevel; size?: number }) {
  const n = FILLED[level];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image" accessibilityLabel={`Fahrspaß ${FUN_NAMES[level]}, ${level} von 5`}>
      {TRIS.map((pts, i) => (
        <Polygon key={i} points={pts} fill={i < n ? Colors.signal : OFF} />
      ))}
    </Svg>
  );
}

export const toFunLevel = (v: number | null | undefined): FunLevel => Math.max(1, Math.min(5, Math.round(v ?? 3))) as FunLevel;
