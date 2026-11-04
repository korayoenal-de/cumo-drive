/**
 * Erzeugt die Navigationssymbole als SVG aus maneuver-geometry.ts (eine Quelle für App und Design System).
 * Aufruf: node --experimental-strip-types scripts/nav-icons.ts <zielordner> [hintergrund]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { symbolGeometry, SYMBOL_NAMES, type NavSymbol, type Paint } from '../src/components/navigation/maneuver-geometry.ts';

const out = process.argv[2] ?? 'nav-icons';
const bg = process.argv[3];
mkdirSync(out, { recursive: true });
const INK = '#FFFFFF';
const color: Record<Paint, string> = { ink: INK, faint: INK, ground: bg ?? 'none', signal: '#E2461C' };
for (const [kind, title] of Object.entries(SYMBOL_NAMES) as [NavSymbol, string][]) {
  const g = symbolGeometry(kind);
  const body = g.shapes
    .map((s) =>
      s.t === 'stroke'
        ? `<path d="${s.d}" stroke="${color[s.paint]}"${s.paint === 'faint' ? ' stroke-opacity="0.35"' : ''} stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
        : `<path d="${s.d}" fill="${color[s.paint]}"${s.evenodd ? ' fill-rule="evenodd"' : ''}${s.paint === 'faint' ? ' fill-opacity="0.35"' : ''}${s.round ? ` stroke="${color[s.paint]}" stroke-width="2" stroke-linejoin="round"` : ''}/>`,
    )
    .join('');
  const rect = bg ? `<rect width="64" height="64" fill="${bg}"/>` : '';
  writeFileSync(`${out}/nav-${kind.replaceAll('_', '-')}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>${title}</title>${rect}${g.mirror ? `<g transform="matrix(-1 0 0 1 64 0)">${body}</g>` : body}</svg>\n`);
}
console.log('ok', out);
