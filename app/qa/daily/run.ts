/**
 * Täglicher Routen Check (Koray 16.11.): 50 Testrouten über die echte Planung der App, jede wird geprüft.
 *
 * Starten im Ordner app:
 *   npx tsx --tsconfig scripts/replay/tsconfig.json qa/daily/run.ts [--out qa/daily/out] [--prev <ergebnis.json>] [--seed <zahl>]
 *
 * Feste Fälle (qa/daily/cases.ts) prüfen immer dieselben Klassiker, damit Rückschritte auffallen. Dazu kommen
 * wechselnde Fälle aus dem Tagesdatum (Seed): Rundtouren ab zufälligen Orten mit zufälliger Länge und
 * Richtung, und Strecken zwischen zwei Pässen. Ergebnis: ergebnis.json (Zahlen je Route), bericht.md
 * (Befunde zuerst) und linien/<id>.svg (die Route mit Pässen und Auffälligkeiten, zum Ansehen).
 *
 * Geprüft wird: geplant oder nicht, Planungszeit, erwartete Pässe, Pässe und Traumstrecken auf der Route
 * (Anteil der km), doppelt gefahrene Stücke (Stichstraßen), kleine Schleifen und Schlenker, Ortsdurchfahrten
 * (Kilometer in bebautem Gebiet laut Server), Großstädte, Länge zur Wunschlänge, Umweg zum direkten Weg,
 * bei Schnell das Tempo und der Autobahnanteil.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

import { BIG_CITIES } from '../../src/data/big-cities';
import { doubledStretch } from '../../src/lib/doubled';
import { tourFun } from '../../src/lib/fun-score';
import { HIGHLIGHT_ROADS, PREFER_ROADS } from '../../src/lib/highlight-roads';
import { PASSES, passesAlong } from '../../src/lib/passes';
import { planLegs } from '../../src/lib/plan';
import { smartRoundTrip } from '../../src/lib/smart-roundtrip';
import { flatten, haversine, type LatLon } from '../../src/lib/tour';
import { DEFAULT_AVOID } from '../../src/lib/valhalla';
import { buildCases, type Case } from './cases';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg('--out') ?? 'qa/daily/out';
const PREV = arg('--prev');
const today = new Date().toISOString().slice(0, 10);
const SEED = +(arg('--seed') ?? today.replace(/-/g, ''));

type Finding = { level: 'fehler' | 'hinweis'; what: string };
type Result = {
  id: string;
  name: string;
  group: string;
  ok: boolean;
  ms: number;
  km?: number;
  minutes?: number;
  passes?: string[];
  curatedKm?: number;
  curatedShare?: number;
  doubledKm?: number;
  loops?: number;
  bebautKm?: number;
  stadtKm?: number;
  autobahnKm?: number;
  fun?: number;
  findings: Finding[];
  error?: string;
};

/* ---------- Messungen ---------- */

function lengthKm(line: LatLon[]) {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversine(line[i - 1], line[i]);
  return s / 1000;
}

function resample(line: LatLon[], step: number): LatLon[] {
  const out: LatLon[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = haversine(a, b);
    let t = step - carry;
    while (t <= d) {
      const f = t / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      t += step;
    }
    carry = d ? (carry + d) % step : carry;
  }
  return out;
}

/** Kleine Schleifen und Schlenker: die Route kommt nach 300 m bis 3 km Fahrt auf 25 m an dieselbe Stelle zurück */
function smallLoops(line: LatLon[]): LatLon[] {
  const P = resample(line, 25);
  const grid = new Map<string, number[]>();
  const key = (p: LatLon) => `${Math.floor(p[0] / 0.0003)}:${Math.floor(p[1] / 0.0004)}`;
  P.forEach((p, i) => {
    const k = key(p);
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  });
  const found: LatLon[] = [];
  let skipUntil = -1;
  for (let i = 0; i < P.length; i++) {
    if (i < skipUntil) continue;
    const [ga, go] = key(P[i]).split(':').map(Number);
    let hit = -1;
    for (let da = -1; da <= 1 && hit < 0; da++)
      for (let dn = -1; dn <= 1 && hit < 0; dn++)
        for (const j of grid.get(`${ga + da}:${go + dn}`) ?? []) {
          if (j - i >= 12 && j - i <= 120 && haversine(P[i], P[j]) < 25) {
            hit = j;
            break;
          }
        }
    if (hit > 0) {
      found.push(P[i]);
      skipUntil = hit;
    }
  }
  return found;
}

/** km der Route höchstens 60 m neben einer kuratierten Strecke (Traumstrecken, Highlights, bevorzugt) */
const curatedGrid = (() => {
  const g = new Map<string, LatLon[]>();
  for (const r of [...HIGHLIGHT_ROADS, ...PREFER_ROADS])
    for (const p of resample(r.line, 150)) {
      const k = `${Math.floor(p[0] / 0.01)}:${Math.floor(p[1] / 0.014)}`;
      const l = g.get(k);
      if (l) l.push(p);
      else g.set(k, [p]);
    }
  return g;
})();
function curatedKm(line: LatLon[]) {
  const P = resample(line, 100);
  let hit = 0;
  for (const p of P) {
    const a = Math.floor(p[0] / 0.01);
    const o = Math.floor(p[1] / 0.014);
    let near = false;
    for (let da = -1; da <= 1 && !near; da++)
      for (let dn = -1; dn <= 1 && !near; dn++) for (const q of curatedGrid.get(`${a + da}:${o + dn}`) ?? []) if (haversine(p, q) < 120) { near = true; break; }
    if (near) hit++;
  }
  return hit * 0.1;
}

function bigCitiesOn(line: LatLon[]): string[] {
  const P = resample(line, 500);
  return BIG_CITIES.filter(([, la, lo, r]) => P.some((p) => haversine(p, [la, lo]) < r * 350)).map(([n]) => n);
}

/* ---------- Ablauf ---------- */

async function runCase(c: Case): Promise<Result> {
  const t0 = Date.now();
  const r: Result = { id: c.id, name: c.name, group: c.group, ok: false, ms: 0, findings: [] };
  const add = (level: Finding['level'], what: string) => r.findings.push({ level, what });
  try {
    const tour =
      c.kind === 'runde'
        ? await smartRoundTrip({ name: c.name, start: c.start, km: c.km, direction: c.direction, profile: c.profile, avoid: DEFAULT_AVOID, seed: c.seed })
        : await planLegs(c.name, c.points, c.profiles, DEFAULT_AVOID);
    r.ms = Date.now() - t0;
    r.ok = true;
    const line = flatten(tour).map((x) => x.p);
    r.km = Math.round(lengthKm(line) * 10) / 10;
    r.minutes = Math.round(tour.minutes);
    const pt = tour as { bebautKm?: number; stadtKm?: number; autobahnKm?: number };
    r.bebautKm = pt.bebautKm != null ? Math.round(pt.bebautKm * 10) / 10 : undefined;
    r.stadtKm = pt.stadtKm != null ? Math.round(pt.stadtKm * 10) / 10 : undefined;
    r.autobahnKm = pt.autobahnKm != null ? Math.round(pt.autobahnKm * 10) / 10 : undefined;
    r.passes = passesAlong(PASSES, line).map((p) => p.pass.name);
    r.curatedKm = Math.round(curatedKm(line) * 10) / 10;
    r.curatedShare = r.km ? Math.round((r.curatedKm / r.km) * 100) : 0;
    r.fun = tourFun(line)?.score;

    // Stichstraßen: doppelt gefahren, bei Rundtouren ohne die ersten und letzten 1,5 km um zu Hause
    const core = c.kind === 'runde' ? line.filter((p) => haversine(p, c.start) > 1500) : line;
    r.doubledKm = Math.round(doubledStretch(core).km * 10) / 10;
    if (r.doubledKm >= 1) add('fehler', `${r.doubledKm} km doppelt gefahren (Stichstraße)`);
    else if (r.doubledKm >= 0.3) add('hinweis', `${r.doubledKm} km doppelt gefahren`);

    const loops = smallLoops(line);
    r.loops = loops.length;
    if (loops.length) add('hinweis', `${loops.length} kleine Schleife${loops.length > 1 ? 'n' : ''} oder Schlenker bei ${loops.slice(0, 3).map((p) => `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`).join('; ')}`);

    if (r.ms > 25000) add('hinweis', `Planung dauerte ${Math.round(r.ms / 1000)} s`);

    if (c.profile !== 'schnell' || c.kind === 'runde') {
      for (const want of c.expectPasses ?? []) if (!r.passes.some((p) => p.toLowerCase().includes(want.toLowerCase()))) add('fehler', `erwarteter Pass fehlt: ${want}`);
      const cities = bigCitiesOn(line).filter((n) => !(c.allowCities ?? []).includes(n));
      if (cities.length) add('hinweis', `durch Großstadt: ${cities.join(', ')}`);
      if (r.bebautKm != null && r.km && r.bebautKm / r.km > 0.12) add('hinweis', `${r.bebautKm} km durch Orte (${Math.round((r.bebautKm / r.km) * 100)} %)`);
      if (c.minCurated != null && r.curatedShare < c.minCurated) add('hinweis', `nur ${r.curatedShare} % auf Traumstrecken und Pässen (erwartet ab ${c.minCurated} %)`);
      if (r.autobahnKm != null && r.autobahnKm > 3 && c.kind !== 'runde' && !c.allowMotorway) add('hinweis', `${r.autobahnKm} km Autobahn im kurvigen Profil`);
    }
    if (c.kind === 'runde') {
      const ratio = r.km / c.km;
      if (ratio < 0.7 || r.km > c.km * 1.3 + 5) add('fehler', `Länge ${r.km} km statt ${c.km} km`);
    } else {
      const direct = lengthKm(c.points) || 1;
      if (c.profile === 'schnell') {
        const kmh = r.km / ((r.minutes || 1) / 60);
        if (kmh < 70) add('hinweis', `schneller Weg nur ${Math.round(kmh)} km/h im Schnitt`);
        if (r.autobahnKm != null && r.km > 80 && r.autobahnKm / r.km < 0.5) add('hinweis', `schneller Weg mit nur ${Math.round((r.autobahnKm / r.km) * 100)} % Autobahn`);
      } else if (r.km / direct > (c.maxDetour ?? 2.6)) add('hinweis', `Umweg: ${r.km} km für ${Math.round(direct)} km Luftlinie`);
    }
    writeSvg(c.id, line, loops, r);
  } catch (e) {
    r.ms = Date.now() - t0;
    r.error = e instanceof Error ? e.message : String(e);
    add('fehler', `nicht geplant: ${r.error.slice(0, 160)}`);
  }
  return r;
}

/** Route als SVG: Linie, Pässe, Schleifen, Start und Ziel (ohne Kartenkacheln) */
function writeSvg(id: string, line: LatLon[], loops: LatLon[], r: Result) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of line) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const W = 800;
  const span = Math.max((e - w) * k, n - s) || 0.01;
  const sc = (W - 60) / span;
  const H = Math.round((n - s) * sc + 80);
  const xy = (p: LatLon) => [30 + (p[1] - w) * k * sc, 50 + (n - p[0]) * sc];
  const d = resample(line, Math.max(30, lengthKm(line) * 2)).map((p, i) => `${i ? 'L' : 'M'}${xy(p).map((v) => v.toFixed(1)).join(' ')}`).join('');
  const passes = passesAlong(PASSES, line).map(({ pass }) => {
    const [x, y] = xy([pass.lat, pass.lon]);
    return `<circle cx="${x}" cy="${y}" r="6" fill="#E8B03A"/><text x="${x + 9}" y="${y + 4}" font-size="12" fill="#F4F4F2">${pass.name}</text>`;
  });
  const ls = loops.map((p) => {
    const [x, y] = xy(p);
    return `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#FF5A5A" stroke-width="3"/>`;
  });
  const [sx, sy] = xy(line[0]);
  const [ex, ey] = xy(line[line.length - 1]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#0B0B0C"/><text x="20" y="28" font-size="16" fill="#F4F4F2" font-family="sans-serif">${r.name}: ${r.km} km, ${r.minutes} min, Fahrspaß ${r.fun ?? '?'}</text><path d="${d}" fill="none" stroke="#E2461C" stroke-width="3" stroke-linejoin="round"/>${passes.join('')}${ls.join('')}<circle cx="${sx}" cy="${sy}" r="7" fill="#4CC38A"/><circle cx="${ex}" cy="${ey}" r="7" fill="#F4F4F2"/></svg>`;
  writeFileSync(`${OUT}/linien/${id}.svg`, svg);
}

function report(results: Result[], prev: Result[] | null): string {
  const byId = new Map(prev?.map((r) => [r.id, r]) ?? []);
  const fehler = results.filter((r) => r.findings.some((f) => f.level === 'fehler'));
  const hinweise = results.filter((r) => !fehler.includes(r) && r.findings.length);
  const ok = results.filter((r) => !r.findings.length);
  const lines: string[] = [];
  lines.push(`# Routen Check ${today}`, '');
  lines.push(`${results.length} Routen: ${ok.length} ohne Befund, ${hinweise.length} mit Hinweis, ${fehler.length} mit Fehler. Seed ${SEED}.`, '');
  const planned = results.filter((r) => r.ok);
  const avg = (f: (r: Result) => number) => (planned.length ? Math.round(planned.reduce((a, r) => a + f(r), 0) / planned.length) : 0);
  lines.push(`Schnitt: Planung ${avg((r) => r.ms / 1000)} s, Fahrspaß ${avg((r) => r.fun ?? 0)}, Anteil Traumstrecken und Pässe ${avg((r) => r.curatedShare ?? 0)} %.`, '');
  if (prev) {
    const worse: string[] = [];
    for (const r of results) {
      const p = byId.get(r.id);
      if (!p || !p.ok) continue;
      if (!r.ok) worse.push(`${r.name}: gestern geplant, heute nicht`);
      else {
        if ((r.fun ?? 0) < (p.fun ?? 0) - 8) worse.push(`${r.name}: Fahrspaß ${p.fun} → ${r.fun}`);
        if ((r.doubledKm ?? 0) > (p.doubledKm ?? 0) + 0.5) worse.push(`${r.name}: doppelt ${p.doubledKm} → ${r.doubledKm} km`);
        const lost = (p.passes ?? []).filter((x) => !(r.passes ?? []).includes(x));
        if (lost.length) worse.push(`${r.name}: Pass verloren: ${lost.join(', ')}`);
      }
    }
    lines.push('## Gegenüber dem letzten Lauf', '', worse.length ? worse.map((x) => `- ${x}`).join('\n') : 'Keine Verschlechterung bei den festen Routen.', '');
  }
  const block = (title: string, list: Result[]) => {
    if (!list.length) return;
    lines.push(`## ${title}`, '');
    for (const r of list) lines.push(`- **${r.name}** (${r.group}, ${r.km ?? '?'} km): ${r.findings.map((f) => f.what).join('; ')}`);
    lines.push('');
  };
  block('Fehler', fehler);
  block('Hinweise', hinweise);
  lines.push('## Alle Routen', '', '| Route | Gruppe | km | min | Fahrspaß | Traumstr. % | Pässe | doppelt km | Orte km | Planung s |', '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |');
  for (const r of results)
    lines.push(`| ${r.name} | ${r.group} | ${r.km ?? ''} | ${r.minutes ?? ''} | ${r.fun ?? ''} | ${r.curatedShare ?? ''} | ${(r.passes ?? []).join(', ')} | ${r.doubledKm ?? ''} | ${r.bebautKm ?? ''} | ${Math.round(r.ms / 1000)} |`);
  return lines.join('\n') + '\n';
}

async function main() {
  mkdirSync(`${OUT}/linien`, { recursive: true });
  const cases = buildCases(SEED);
  const prev = PREV && existsSync(PREV) ? (JSON.parse(readFileSync(PREV, 'utf8')).results as Result[]) : null;
  const results: Result[] = [];
  for (const c of cases) {
    const r = await runCase(c);
    results.push(r);
    console.log(`${r.findings.some((f) => f.level === 'fehler') ? 'FEHLER ' : r.findings.length ? 'hinweis' : 'ok     '} ${c.id} ${r.km ?? '-'} km ${Math.round(r.ms / 1000)} s ${r.findings.map((f) => f.what).join('; ')}`);
  }
  writeFileSync(`${OUT}/ergebnis.json`, JSON.stringify({ date: today, seed: SEED, results }, null, 1));
  writeFileSync(`${OUT}/bericht.md`, report(results, prev));
  console.log(`fertig: ${OUT}/bericht.md`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
