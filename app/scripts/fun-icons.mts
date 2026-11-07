/**
 * Logo als Fahrspaß Pegel (S3) als SVG für CarPlay Hinweise: fun-1 bis fun-5.
 * Gleiche Geometrie wie components/ui/fun-gauge.tsx (Stufen füllen 1, 3, 5, 7, 8 Segmente ab 6 Uhr im Uhrzeigersinn).
 * Aufruf: node --experimental-strip-types scripts/fun-icons.mts <zielordner>
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'fun-icons';
mkdirSync(out, { recursive: true });
const RO = 11.4;
const RI = 4.2;
const ROUND = 0.22;
const at = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [12 + r * Math.sin(a), 12 - r * Math.cos(a)];
};
const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const pt = (p: [number, number]) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
const SEGS = Array.from({ length: 8 }, (_, k) => {
  const c = 180 + 22.5 + k * 45;
  const apex = at(RI, c);
  const l = at(RO, c - 22.5);
  const r = at(RO, c + 22.5);
  return `M${pt(lerp(apex, r, ROUND))} L${pt(r)} A${RO},${RO} 0 0 0 ${pt(l)} L${pt(lerp(apex, l, ROUND))} Q${pt(apex)} ${pt(lerp(apex, r, ROUND))} Z`;
});
const FILLED = [0, 1, 3, 5, 7, 8];
for (let level = 1; level <= 5; level++) {
  const body = SEGS.map((d, k) => `<path d="${d}" fill="${k < FILLED[level] ? '#E2461C' : '#3A3A3F'}"/>`).join('');
  writeFileSync(`${out}/fun-${level}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>\n`);
}
console.log('ok', out);
