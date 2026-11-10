/**
 * Synthetischer Mehrbenutzer Test: `cd app && npx tsx qa/sim/run.ts`
 *
 * Läuft komplett lokal: Postgres Test DB (Socket /var/tmp/cumopg, Datenbank sim, wird neu angelegt),
 * Fake Supabase Client je virtuellem Fahrer, Realtime als Bus im Speicher, virtuelle Uhr.
 * Kein Zugriff auf das echte Supabase Projekt, keine Konten, kein Netz.
 *
 * Optionen: SIM_ONLY=G (nur Gruppe), SIM_ONLY=C,D (Ausfahrten, Nachrichten), SIM_VERBOSE=1
 */
import path from 'node:path';

import { installVirtualClock } from './clock';
import { buildDriverBundle } from './build';
import { dbCalls, setupDatabase } from './db';
import { setBundle, World } from './harness';
import { printTable, results } from './report';
import { communityScenarios } from './scenarios-community';
import { groupScenarios } from './scenarios-group';

async function main() {
  const only = (process.env.SIM_ONLY ?? 'G,C,D').split(',').map((s: string) => s.trim().toUpperCase());
  const t0 = performance.now();
  const { skipped } = setupDatabase(path.resolve(__dirname, '../../../supabase/migrations'), process.env.SIM_STUB ?? '/var/tmp/cumopg/stub.sql');
  console.log(`Test DB sim neu aufgebaut, übersprungene Anweisungen: ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s}`);
  setBundle(await buildDriverBundle());
  installVirtualClock();

  if (only.includes('G')) {
    const w = new World();
    await w.init();
    await groupScenarios(w);
    console.log(`  Bus: ${w.server.stats.broadcasts} Broadcasts, ${w.server.stats.delivered} zugestellt, ${w.server.stats.dropped} verworfen`);
  }
  if (only.includes('C') || only.includes('D')) {
    const w = new World();
    await w.init();
    await communityScenarios(w, { ausfahrten: only.includes('C'), nachrichten: only.includes('D') });
  }

  printTable();
  console.log(`${dbCalls} SQL Aufrufe, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(results.some((r) => r.outcome === 'fail') ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
