/**
 * Erzeugt die Navigationssymbole als SVG aus maneuver-geometry.ts (eine Quelle für App und Design System).
 * Aufruf: node --experimental-strip-types scripts/nav-icons.ts <zielordner> [hintergrund]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { roundaboutExit, roundaboutSmall, symbolGeometry, ALL_SYMBOL_NAMES, type IconGeometry, type NavSymbol, type Paint } from '../src/components/navigation/maneuver-geometry.ts';

const out = process.argv[2] ?? 'nav-icons';
const bg = process.argv[3];
mkdirSync(out, { recursive: true });
const INK = '#FFFFFF';
const color: Record<Paint, string> = { ink: INK, faint: INK, ground: bg ?? 'none', signal: '#E2461C' };
/**
 * small: kräftige Fassung für die Zeile „Dann“ in CarPlay (Datei mit -s). Apple zeigt das zweite Manöver nur mit
 * 18 x 18 pt (CarPlay Developer Guide); dort waren die feinen Striche kaum zu lesen (Koray 21.11.). Striche 1,6 fach,
 * Pfeilspitzen mit Rand dicker, Kreisverkehr als kleiner Ring mit Pfeil wie in der App unter 40 pt.
 */
function svgOf(kind: NavSymbol, title: string, small: boolean): string {
  const ex = small ? roundaboutExit(kind) : null;
  const g: IconGeometry = ex != null ? roundaboutSmall(ex) : symbolGeometry(kind);
  // der kleine Kreisverkehr ist schon für kleine Größen gezeichnet (Ring 6, Nummer 18), nur Pfeile werden kräftiger
  const bold = small && ex == null;
  const k = bold ? 1.6 : 1;
  const body = g.shapes
    .map((s) =>
      s.t === 'stroke'
        ? `<path d="${s.d}" stroke="${color[s.paint]}"${s.paint === 'faint' ? ' stroke-opacity="0.35"' : ''} stroke-width="${s.w * k}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
        : `<path d="${s.d}" fill="${color[s.paint]}"${s.evenodd ? ' fill-rule="evenodd"' : ''}${s.paint === 'faint' ? ' fill-opacity="0.35"' : ''}${s.round || bold ? ` stroke="${color[s.paint]}" stroke-width="${bold ? 4 : 2}" stroke-linejoin="round"` : ''}/>`,
    )
    .join('');
  // Ausfahrt Nummer im Ring wie in der App
  const num = g.ring && /_([1-9])$/.exec(kind);
  const size = small ? 18 : 14;
  const badge = num ? `<text x="${g.ring!.x}" y="${g.ring!.y + size * 0.36}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="800" fill="${INK}" text-anchor="middle">${num[1]}</text>` : '';
  const rect = bg ? `<rect width="64" height="64" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><title>${title}</title>${rect}${g.mirror ? `<g transform="matrix(-1 0 0 1 64 0)">${body}</g>` : body}${badge}</svg>\n`;
}

for (const [kind, title] of Object.entries(ALL_SYMBOL_NAMES) as [NavSymbol, string][]) {
  const name = `nav-${kind.replaceAll('_', '-')}`;
  writeFileSync(`${out}/${name}.svg`, svgOf(kind, title, false));
  writeFileSync(`${out}/${name}-s.svg`, svgOf(kind, title, true));
}
console.log('ok', out);
