/**
 * Verpackt unsere Daten für die App (Koray 17.11., Startprüfung: Schutz des Werks). Kuratierte Strecken, Pässe und
 * Einkehr Empfehlungen lagen lesbar im App Paket; wer die App Datei entpackte, hatte alle Strecken.
 *
 * Was das Skript tut:
 * 1. Fingerabdruck wie im Web Planer (Edge Function road-data, mark()): bei etwa 2 Prozent der Strecken liegt ein Punkt
 *    3 bis 7 m versetzt, mit der Kennung "app-paket". Taucht eine Kopie auf, lässt sich zeigen, dass sie aus der App stammt.
 * 2. Verschleiern: druckbare Zeichen werden mit einem Schlüsselstrom verschoben, das Ergebnis steht als Text in
 *    src/data/road-pack.ts. Das hält einfaches Auslesen ab (Text Suche, JSON Werkzeuge), nicht entschlossene Profis.
 *
 * Aufruf nach jeder Änderung an den JSON Dateien: npm run pack-data. Der Test road-pack.test.ts prüft, dass das Paket
 * zum Stand der JSON Dateien passt; der Testlauf vor dem Update schlägt sonst fehl.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { KEY, encode } from '../src/lib/road-pack-codec';

const root = join(__dirname, '..');
const read = (f: string) => JSON.parse(readFileSync(join(root, 'src/data', f), 'utf8'));

const MARK_ID = 'app-paket';

/** wie mark() in supabase/functions/road-data/index.ts, nur synchron */
type Road = { id: string; line?: [number, number][] };
function mark(road: Road): Road {
  const h = createHash('sha256').update(`cumo-road-data:${MARK_ID}:${road.id}`).digest();
  const n = road.line?.length ?? 0;
  if (h[0] >= 5 || n < 3) return road;
  const point = 1 + (((h[1] << 8) | h[2]) % (n - 2));
  const angle = (h[3] / 256) * 2 * Math.PI;
  const m = 3 + (h[4] % 5);
  const [lat, lon] = road.line![point];
  const line = road.line!.slice();
  line[point] = [
    +(lat + (m * Math.cos(angle)) / 110540).toFixed(5),
    +(lon + (m * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180))).toFixed(5),
  ];
  return { ...road, line };
}

const original = read('curated-roads.json') as Road[];
const curated = original.map(mark);
const passes = read('passes.json');
const stops = read('recommended-stops.json');
const plain = JSON.stringify({ curated, passes, stops });
const packed = encode(plain, KEY);
const hash = createHash('sha256').update(JSON.stringify({ curated: original, passes, stops })).digest('hex').slice(0, 16);

writeFileSync(
  join(root, 'src/data/road-pack.ts'),
  `// Erzeugt von scripts/pack-road-data.ts (npm run pack-data), nicht von Hand ändern.\n` +
    `export const ROAD_PACK_SOURCE = '${hash}';\n` +
    `export const ROAD_PACK = ${JSON.stringify(packed)};\n`,
);
const marked = curated.filter((r, i) => r !== original[i]).length;
console.log(`road-pack.ts: ${curated.length} Strecken (${marked} mit Fingerabdruck), ${passes.length} Pässe, ${(packed.length / 1024).toFixed(0)} KB, Quelle ${hash}`);
