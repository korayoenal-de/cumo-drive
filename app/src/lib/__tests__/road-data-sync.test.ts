// Der Web Planer holt Strecken, Pässe und Empfehlungen von der Edge Function road-data (Koray 16.11.).
// Deren Kopien müssen dem Stand der App entsprechen: nach jeder Änderung `npm run sync-road-data`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

for (const f of ['curated-roads.json', 'passes.json', 'recommended-stops.json']) {
  test(`road-data Kopie aktuell: ${f}`, () => {
    const app = readFileSync(`src/data/${f}`, 'utf8');
    const fn = readFileSync(`../supabase/functions/road-data/data/${f}`, 'utf8');
    assert.ok(app === fn, `${f} weicht ab, bitte npm run sync-road-data`);
  });
}

// Kachelweise Auslieferung (17.11.): Planer und Edge Function rechnen dieselben Kacheln
test('Kacheln: gleiche Rechnung wie die Edge Function, Route deckt die Strecke ab', async () => {
  const { tileOf, tilesAround } = await import('../road-data.web');
  assert.equal(tileOf([47.26, 11.39]), '94_22');
  assert.equal(tileOf([-0.1, -0.1]), '-1_-1');
  const fn = readFileSync('../supabase/functions/road-data/index.ts', 'utf8');
  if (fn.includes('tileOf')) assert.ok(fn.includes('Math.floor(p[0] * 2)}_${Math.floor(p[1] * 2)}'), 'Kachelrechnung in road-data/index.ts geändert');
  // München nach Imst: alle Kacheln zwischen den Punkten, nicht nur an den Enden
  const tiles = tilesAround([[48.14, 11.58], [47.24, 10.74]], 30);
  assert.ok(tiles.includes(tileOf([47.7, 11.2])));
  assert.ok(tiles.length < 40, `zu viele Kacheln: ${tiles.length}`);
});

// App Paket (17.11., Schutz des Werks): road-pack.ts muss zum Stand der JSON Dateien passen, sonst `npm run pack-data`
test('road-pack.ts aktuell und entpackbar, Fingerabdruck klein, nichts lesbar', async () => {
  const { createHash } = await import('node:crypto');
  const { ROAD_PACK, ROAD_PACK_SOURCE } = await import('../../data/road-pack');
  const { KEY, decode } = await import('../road-pack-codec');
  const read = (f: string) => JSON.parse(readFileSync(`src/data/${f}`, 'utf8'));
  const curated = read('curated-roads.json') as { id: string; line: number[][] }[];
  const src = createHash('sha256').update(JSON.stringify({ curated, passes: read('passes.json'), stops: read('recommended-stops.json') })).digest('hex').slice(0, 16);
  assert.equal(ROAD_PACK_SOURCE, src, 'road-pack.ts ist veraltet, bitte npm run pack-data');
  const t0 = performance.now();
  const d = JSON.parse(decode(ROAD_PACK, KEY)) as { curated: { id: string; line: number[][] }[] };
  const ms = performance.now() - t0;
  assert.equal(d.curated.length, curated.length);
  const moved = d.curated.filter((r, i) => JSON.stringify(r.line) !== JSON.stringify(curated[i].line)).length;
  assert.ok(moved > 0 && moved < curated.length * 0.05, `Fingerabdruck bei ${moved} Strecken`);
  assert.ok(!ROAD_PACK.includes('"curated"') && !ROAD_PACK.includes(curated[0].id), 'Paket ist lesbar');
  assert.ok(ms < 400, `Entpacken dauert ${Math.round(ms)} ms`);
});
