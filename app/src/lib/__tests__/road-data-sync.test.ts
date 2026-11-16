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
