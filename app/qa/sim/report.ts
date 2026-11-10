/** Ergebnisse der Szenarien: pass, fail oder nicht testbar, mit kurzen Notizen. */
export type Outcome = 'pass' | 'fail' | 'n/t';
export type ScenarioResult = { id: string; title: string; outcome: Outcome; notes: string[]; ms: number };

export class Ctx {
  readonly fails: string[] = [];
  readonly notes: string[] = [];
  untestable: string | null = null;

  /** Prüfung; bei false wird das Szenario fail, läuft aber weiter */
  expect(cond: unknown, what: string) {
    if (!cond) this.fails.push(what);
    return !!cond;
  }

  note(s: string) {
    this.notes.push(s);
  }

  notTestable(why: string) {
    this.untestable = why;
  }
}

export const results: ScenarioResult[] = [];

export async function scenario(id: string, title: string, fn: (c: Ctx) => Promise<void>) {
  const c = new Ctx();
  const t0 = Date.now();
  const r0 = performance.now();
  try {
    await fn(c);
  } catch (e) {
    c.fails.push(`Abbruch: ${e instanceof Error ? e.message : String(e)}`);
  }
  void t0;
  const outcome: Outcome = c.fails.length ? 'fail' : c.untestable ? 'n/t' : 'pass';
  const notes = [...c.fails.map((f) => `FEHLER ${f}`), ...(c.untestable ? [`nicht testbar: ${c.untestable}`] : []), ...c.notes];
  results.push({ id, title, outcome, notes, ms: Math.round(performance.now() - r0) });
  const mark = outcome === 'pass' ? 'PASS' : outcome === 'fail' ? 'FAIL' : 'N/T ';
  console.log(`${mark} ${id.padEnd(4)} ${title}`);
  for (const n of notes) console.log(`       ${n}`);
}

export function printTable() {
  const w = Math.max(...results.map((r) => r.title.length), 10);
  console.log('');
  console.log(`${'Nr'.padEnd(5)}${'Szenario'.padEnd(w + 2)}Ergebnis  Dauer`);
  console.log('-'.repeat(w + 26));
  for (const r of results) console.log(`${r.id.padEnd(5)}${r.title.padEnd(w + 2)}${r.outcome.padEnd(10)}${(r.ms / 1000).toFixed(1)} s`);
  const p = results.filter((r) => r.outcome === 'pass').length;
  const f = results.filter((r) => r.outcome === 'fail').length;
  const n = results.filter((r) => r.outcome === 'n/t').length;
  console.log('-'.repeat(w + 26));
  console.log(`${p} pass, ${f} fail, ${n} nicht testbar`);
}
