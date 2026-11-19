/**
 * Bedienfolgen im Planer (Testkatalog Ebene 4, Regeln R1 bis R6; Koray 17.11.).
 *
 * Spielt zufällige Bearbeitungen einer Tour durch, so wie der Planer sie ausführt: Zwischenziel einfügen,
 * entfernen, verschieben, Profil einer Etappe wechseln, Ziel ändern, Einfügen und gleich wieder entfernen.
 * Jede Bearbeitung plant wie use-tour-plan.ts: erst nur das geänderte Stück (planChanged), sonst alles (planLegs),
 * über die echten Routing Server. Nach jedem Schritt prüft der Test die Regeln:
 *
 *   R1  die Route läuft durch alle Punkte, in der gewählten Reihenfolge
 *   R2  Einfügen und wieder entfernen ergibt dieselbe Route (seit 19.11. bis auf wenige km: der Rest der Tour bleibt stehen)
 *   R3  unveränderte Etappen vorn und hinten bleiben genau gleich
 *   R4  Schnell ist auf derselben Etappe nicht langsamer als Kurvig
 *   R6  Etappen ergeben Strecke und Fahrzeit, die Linie ist so lang wie die Strecke
 *
 * Nicht dabei: Pässe als Zwischenziel mit Überfahrt der Passhöhe und Strecken als Zwischenziel (der Planer setzt dort
 * zusätzliche Punkte), Oberfläche und Gesten (Ebene 6 und Gerät).
 *
 * Aufruf im Ordner app:
 *   npx tsx --tsconfig scripts/replay/tsconfig.json qa/bedienfolgen.ts [--seed <zahl>] [--folgen 3] [--schritte 6]
 * Exit 1 bei einem Fehler. Jeder Fund steht mit Seed und Schrittfolge da, damit er sich nachstellen lässt.
 */
import { planChanged, planLegs, type PlannedTour } from '../src/lib/plan';
import { unchangedLegs, windowFor } from '../src/lib/plan-window';
import { flatten, haversine, type LatLon, type Profile } from '../src/lib/tour';
import { DEFAULT_AVOID } from '../src/lib/valhalla';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SEED = Number(arg('--seed') ?? new Date().toISOString().slice(0, 10).replace(/-/g, ''));
const FOLGEN = Number(arg('--folgen') ?? 3);
const SCHRITTE = Number(arg('--schritte') ?? 6);

// Orte für Punkte: zwei Gebiete, damit die Etappen kurz genug für viele Schritte bleiben
const GEBIETE: { name: string; orte: [string, LatLon][] }[] = [
  {
    name: 'Odenwald',
    orte: [
      ['Weinheim', [49.548, 8.669]],
      ['Lindenfels', [49.684, 8.781]],
      ['Wald-Michelbach', [49.573, 8.832]],
      ['Hirschhorn', [49.447, 8.896]],
      ['Beerfelden', [49.567, 8.977]],
      ['Michelstadt', [49.678, 9.003]],
      ['Amorbach', [49.645, 9.221]],
      ['Eberbach', [49.465, 8.986]],
      ['Miltenberg', [49.703, 9.264]],
    ],
  },
  {
    name: 'Schwarzwald',
    orte: [
      ['Baden-Baden', [48.761, 8.240]],
      ['Bühlerhöhe', [48.655, 8.215]],
      ['Freudenstadt', [48.463, 8.411]],
      ['Bad Wildbad', [48.750, 8.551]],
      ['Forbach', [48.683, 8.357]],
      ['Oppenau', [48.473, 8.161]],
      ['Baiersbronn', [48.506, 8.371]],
    ],
  },
];

function rng(seed: number) {
  let s = Math.imul(seed >>> 0, 2654435761) >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < 8; i++) next();
  return next;
}

type State = { pts: LatLon[]; names: string[]; prof: Profile[]; tour: PlannedTour | null; rawProf: Profile[] };
type Finding = { level: 'fehler' | 'hinweis'; rule: string; what: string; folge: number; schritt: number; ops: string[] };
const findings: Finding[] = [];
const dropped: string[] = [];
const stats = { eligible: 0, windowed: 0, reasons: new Map<string, number>() };

const lineLen = (t: PlannedTour) => {
  const f = flatten(t);
  return f.length ? f[f.length - 1].km : 0;
};

/** R1: jeder Punkt liegt nah an der Linie, und zwar in der Reihenfolge der Punkte */
function checkOrder(t: PlannedTour, pts: LatLon[], names: string[]): string | null {
  const line = flatten(t).map((x) => x.p);
  let from = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    let best = -1;
    let bestD = Infinity;
    for (let i = from; i < line.length; i++) {
      const d = haversine(line[i], p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
      // erster Treffer genügt, sobald wir wieder weg sind
      if (bestD < 600 && d > bestD + 3000) break;
    }
    if (bestD > 1500) return `${names[k]} liegt ${(bestD / 1000).toFixed(1)} km neben der Route (oder erst nach dem nächsten Punkt)`;
    from = best;
  }
  return null;
}

async function plan(st: State, prevTour: PlannedTour | null, prevProf: Profile[]): Promise<{ t: PlannedTour; windowed: boolean; ms: number }> {
  const t0 = performance.now();
  let t: PlannedTour | null = null;
  let windowed = false;
  if (prevTour) {
    try {
      t = await planChanged(prevTour, prevProf, 'Bedienfolge', st.pts, st.prof, DEFAULT_AVOID);
      windowed = !!t;
      if (t && process.env.BF_DEBUG) {
        const w = windowFor(prevTour, prevProf, st.pts, st.prof)!;
        console.log(`     Teilstück: vorn ${w.head?.laenge_km ?? 0} km (${w.head?.wegpunkte.length ?? 0} Punkte), neu ${w.points.length} Punkte, hinten ${w.tail?.laenge_km ?? 0} km (${w.tail?.wegpunkte.length ?? 0} Punkte); alt ${prevTour.wegpunkte.length} Punkte ${prevTour.laenge_km} km, neu ${st.pts.length} Punkte, Etappen ${JSON.stringify(t.legKm)}`);
      }
    } catch {
      t = null;
    }
  }
  t ??= await planLegs('Bedienfolge', st.pts, st.prof, DEFAULT_AVOID);
  // wie use-tour-plan.ts: gemerkt wird die Tour mit den Punkten, die geplant werden sollten
  if (t.wegpunkte.length !== st.pts.length) dropped.push(`${t.wegpunkte.length} statt ${st.pts.length} Wegpunkte zurück`);
  t = { ...t, wegpunkte: [...st.pts] };
  return { t, windowed, ms: performance.now() - t0 };
}

async function folge(n: number) {
  const r = rng(SEED + n * 7919);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const gebiet = GEBIETE[n % GEBIETE.length];
  const pool = [...gebiet.orte];
  const take = () => pool.splice(Math.floor(r() * pool.length), 1)[0];
  // vier Punkte zum Start: so gibt es vorn und hinten Etappen, die beim Ändern in der Mitte stehen bleiben (R3)
  const start = [take(), take(), take(), take()];
  const st: State = { pts: start.map((o) => o[1]), names: start.map((o) => o[0]), prof: ['kurvig', 'kurvig', 'kurvig'], tour: null, rawProf: ['kurvig', 'kurvig', 'kurvig'] };
  const ops: string[] = [`Start ${start[0][0]}, über ${start[1][0]} und ${start[2][0]}, Ziel ${start[3][0]}`];
  const add = (level: Finding['level'], rule: string, what: string, schritt: number) => findings.push({ level, rule, what, folge: n, schritt, ops: [...ops] });

  let res = await plan(st, null, []);
  st.tour = res.t;
  st.rawProf = [...st.prof];
  console.log(`Folge ${n + 1} (${gebiet.name}): ${ops[0]}, ${res.t.laenge_km} km, ${Math.round(res.ms)} ms`);

  for (let s = 1; s <= SCHRITTE; s++) {
    const before = st.tour!;
    const beforePts = [...st.pts];
    const beforeProf = [...st.prof];
    const legs = st.pts.length - 1;
    const choices = ['einfügen', 'einfügen', 'profil', 'ziel', 'zurück'];
    if (legs >= 2) choices.push('entfernen', 'verschieben');
    let op = pick(choices);
    if (op !== 'entfernen' && op !== 'verschieben' && op !== 'profil' && !pool.length) op = 'profil';
    let label = '';
    let undo: { at: number } | null = null;
    if (op === 'einfügen' || op === 'zurück') {
      const o = take();
      const at = 1 + Math.floor(r() * legs);
      st.pts.splice(at, 0, o[1]);
      st.names.splice(at, 0, o[0]);
      st.prof.splice(at - 1, 0, st.prof[at - 1] ?? 'kurvig');
      label = `${o[0]} als Zwischenziel ${at} einfügen`;
      if (op === 'zurück') undo = { at };
    } else if (op === 'entfernen') {
      const at = 1 + Math.floor(r() * (legs - 1));
      label = `${st.names[at]} entfernen`;
      pool.push([st.names[at], st.pts[at]]);
      st.pts.splice(at, 1);
      st.names.splice(at, 1);
      st.prof.splice(at - 1, 1);
    } else if (op === 'verschieben') {
      const at = 1 + Math.floor(r() * (legs - 1));
      const to = at === 1 ? 2 : at - 1;
      if (to >= st.pts.length - 1) {
        s--;
        continue;
      }
      label = `${st.names[at]} mit ${st.names[to]} tauschen`;
      [st.pts[at], st.pts[to]] = [st.pts[to], st.pts[at]];
      [st.names[at], st.names[to]] = [st.names[to], st.names[at]];
    } else if (op === 'profil') {
      const i = Math.floor(r() * legs);
      st.prof[i] = st.prof[i] === 'kurvig' ? 'schnell' : 'kurvig';
      label = `Etappe ${i + 1} auf ${st.prof[i] === 'kurvig' ? 'Kurvig' : 'Schnell'}`;
    } else {
      const o = take();
      pool.push([st.names[legs], st.pts[legs]]);
      label = `Ziel ${st.names[legs]} durch ${o[0]} ersetzen`;
      st.pts[legs] = o[1];
      st.names[legs] = o[0];
    }
    ops.push(label);
    try {
      res = await plan(st, before, st.rawProf);
    } catch (e) {
      add('fehler', 'planen', `Planung scheitert: ${(e as Error).message}`, s);
      console.log(`  ${s}. ${label}: FEHLER Planung scheitert`);
      break;
    }
    const t = res.t;
    st.tour = t;
    st.rawProf = [...st.prof];
    const notes: string[] = [];

    // Nur Geändertes neu planen (11.11.): wo es ginge, aber nicht genutzt wurde, steht der Grund im Protokoll
    {
      const { head, tail } = unchangedLegs(beforePts, beforeProf, st.pts, st.prof);
      const eligible = head + tail > 0 && head + tail < st.pts.length - 1;
      if (eligible) stats.eligible++;
      if (res.windowed) stats.windowed++;
      if (eligible && !res.windowed) {
        const w = windowFor(before, beforeProf, st.pts, st.prof);
        const why = w ? 'Nahtstelle passte nicht (Wenden)' : 'Etappen der alten Tour nicht zuordenbar';
        notes.push(`Teilstück wäre möglich gewesen (${head} vorn, ${tail} hinten): ${why}`);
        stats.reasons.set(why, (stats.reasons.get(why) ?? 0) + 1);
      }
    }
    // R1 Reihenfolge
    const ord = checkOrder(t, st.pts, st.names);
    if (ord) add('fehler', 'R1', ord, s);
    // R3 unveränderte Etappen bleiben gleich (nur wenn der Planer das Teilstück wiederverwendet hat)
    if (res.windowed && before.legKm && t.legKm) {
      const { head, tail } = unchangedLegs(beforePts, beforeProf, st.pts, st.prof);
      // Die Linie bleibt gleich; die Kennzahl kommt einmal vom Router, einmal aus der Linie gemessen. Kleine
      // Sprünge sind deshalb ein Hinweis, große ein Fehler (dann ist wirklich etwas anderes gefahren).
      const cmp = (o: number, nn: number, wo: string) => {
        const d = Math.abs(o - nn);
        if (d > Math.max(0.5, o * 0.03)) add('fehler', 'R3', `${wo} geändert: ${o.toFixed(1)} statt ${nn.toFixed(1)} km`, s);
        else if (d > 0.2) add('hinweis', 'R3', `${wo} zeigt ${nn.toFixed(1)} statt ${o.toFixed(1)} km, obwohl sie gleich bleibt`, s);
      };
      for (let i = 0; i < head; i++) cmp(before.legKm[i], t.legKm[i], `Etappe ${i + 1} vorn`);
      for (let i = 1; i <= tail; i++) cmp(before.legKm.at(-i)!, t.legKm.at(-i)!, `Etappe ${i} von hinten`);
    }
    // R6 Kennzahlen passen zusammen
    if (t.legKm && t.legMin) {
      const sk = t.legKm.reduce((x, y) => x + y, 0);
      const sm = t.legMin.reduce((x, y) => x + y, 0);
      if (t.legKm.length !== st.pts.length - 1) add('fehler', 'R6', `${t.legKm.length} Etappen statt ${st.pts.length - 1}`, s);
      if (Math.abs(sk - t.laenge_km) > Math.max(0.5, t.laenge_km * 0.02)) add('fehler', 'R6', `Etappen ergeben ${sk.toFixed(1)} km, Strecke zeigt ${t.laenge_km} km`, s);
      if (Math.abs(sm - t.minutes) > Math.max(2, t.minutes * 0.03)) add('fehler', 'R6', `Etappen ergeben ${Math.round(sm)} min, Fahrzeit zeigt ${Math.round(t.minutes)} min`, s);
    } else notes.push('keine Etappenwerte');
    const ll = lineLen(t);
    if (Math.abs(ll - t.laenge_km) > Math.max(1, t.laenge_km * 0.03)) add('fehler', 'R6', `Linie ist ${ll.toFixed(1)} km lang, Strecke zeigt ${t.laenge_km} km`, s);
    // Teilplanung gegen ganze Planung: große Abweichung ist verdächtig (Nahtstelle)
    if (res.windowed) {
      const full = await planLegs('Bedienfolge', st.pts, st.prof, DEFAULT_AVOID);
      const d = Math.abs(full.laenge_km - t.laenge_km) / Math.max(1, full.laenge_km);
      if (d > 0.15) add('hinweis', 'R3', `Teilplanung ${t.laenge_km} km, ganze Planung ${full.laenge_km} km`, s);
    }
    console.log(`  ${s}. ${label}: ${t.laenge_km} km, ${Math.round(t.minutes)} min, ${res.windowed ? 'Teilstück' : 'ganz'} geplant, ${Math.round(res.ms)} ms${notes.length ? `, ${notes.join(', ')}` : ''}`);

    // R2 Einfügen und gleich wieder entfernen
    if (undo) {
      pool.push([st.names[undo.at], st.pts[undo.at]]);
      st.pts.splice(undo.at, 1);
      st.names.splice(undo.at, 1);
      st.prof.splice(undo.at - 1, 1);
      ops.push('und gleich wieder entfernen');
      const back = await plan(st, t, st.rawProf);
      st.tour = back.t;
      st.rawProf = [...st.prof];
      const dk = Math.abs(back.t.laenge_km - before.laenge_km);
      if (dk > Math.max(0.5, before.laenge_km * 0.02)) {
        // Liegt es an der Teilplanung? Ganz neu geplant müsste wieder die alte Route herauskommen
        const full = await planLegs('Bedienfolge', st.pts, st.prof, DEFAULT_AVOID);
        const fullSame = Math.abs(full.laenge_km - before.laenge_km) <= Math.max(0.5, before.laenge_km * 0.02);
        // Seit 19.11. bleibt beim Entfernen der Rest der Tour stehen (Koray): wenige km Abweichung sind hingenommen,
        // ein Fehler ist es erst über 3 km und 5 %
        if (back.windowed && fullSame && dk > Math.max(3, before.laenge_km * 0.05))
          add('fehler', 'R2', `nach Einfügen und Entfernen ${back.t.laenge_km} statt ${before.laenge_km} km; ganz neu geplant wären es wieder ${full.laenge_km} km (die Teilplanung bleibt auf dem Umweg)`, s);
        else add('hinweis', 'R2', `nach Einfügen und Entfernen ${back.t.laenge_km} statt ${before.laenge_km} km, ganz neu geplant ${full.laenge_km} km (die Route davor kam selbst aus einer Teilplanung, oder der Router plant dieselben Punkte anders)`, s);
      }
      console.log(`     und wieder entfernt: ${back.t.laenge_km} km (vorher ${before.laenge_km} km)`);
    }
  }
}

/** R4: Schnell ist auf derselben Etappe nicht langsamer als Kurvig */
async function schnellGegenKurvig() {
  const cases: [string, LatLon, LatLon][] = [
    ['Weinheim nach Miltenberg', [49.548, 8.669], [49.703, 9.264]],
    ['Baden-Baden nach Freudenstadt', [48.761, 8.240], [48.463, 8.411]],
  ];
  for (const [name, a, b] of cases) {
    const [k, s] = await Promise.all([planLegs(name, [a, b], ['kurvig'], DEFAULT_AVOID), planLegs(name, [a, b], ['schnell'], DEFAULT_AVOID)]);
    const ok = s.minutes <= k.minutes * 1.02;
    if (!ok) findings.push({ level: 'fehler', rule: 'R4', what: `${name}: Schnell ${Math.round(s.minutes)} min, Kurvig ${Math.round(k.minutes)} min`, folge: -1, schritt: 0, ops: [] });
    console.log(`R4 ${name}: Schnell ${Math.round(s.minutes)} min ${s.laenge_km} km, Kurvig ${Math.round(k.minutes)} min ${k.laenge_km} km${ok ? '' : '  FEHLER'}`);
  }
}

async function main() {
  console.log(`Bedienfolgen, Seed ${SEED}, ${FOLGEN} Folgen mit je ${SCHRITTE} Schritten\n`);
  for (let n = 0; n < FOLGEN; n++) await folge(n);
  console.log('');
  await schnellGegenKurvig();
  console.log(`\nNur Geändertes neu planen: ${stats.windowed} von ${stats.eligible} möglichen Fällen genutzt${[...stats.reasons].map(([k, v]) => `, ${v}x ${k}`).join('')}`);
  if (stats.eligible >= 4 && stats.windowed < stats.eligible / 2)
    findings.push({ level: 'hinweis', rule: 'R3', what: `Teilplanung greift selten (${stats.windowed} von ${stats.eligible}), der Rest der Tour wird oft neu geplant`, folge: -1, schritt: 0, ops: [] });
  if (dropped.length) findings.push({ level: 'hinweis', rule: 'R1', what: `Planung lieferte andere Wegpunkte: ${[...new Set(dropped)].join('; ')}`, folge: -1, schritt: 0, ops: [] });
  const fehler = findings.filter((f) => f.level === 'fehler');
  console.log(`\n${fehler.length} Fehler, ${findings.length - fehler.length} Hinweise`);
  for (const f of findings) {
    console.log(`${f.level === 'fehler' ? 'FEHLER ' : 'hinweis'} [${f.rule}] ${f.what}`);
    if (f.folge >= 0) console.log(`        nachstellen: --seed ${SEED}, Folge ${f.folge + 1}, Schritt ${f.schritt}: ${f.ops.join(' > ')}`);
  }
  process.exit(fehler.length ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
