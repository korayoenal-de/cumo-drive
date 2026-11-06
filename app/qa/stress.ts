/** Stresstests: Extremeingaben und Laufzeit der Kernlogik. Exit 1 bei Fehlern. */
import { readFileSync } from 'node:fs';
import { findHighlights, hairpinKms } from '../src/lib/navigation/highlights';
import { cumulativeKm , tourFromLine } from '../src/lib/navigation/route';
import { sharpCurves, curveCue } from '../src/lib/navigation/curves';
import { snapToRoute, progress, pointAtKm } from '../src/lib/navigation/tracker';
import { encodeTour, decodeTour, extractCode } from '../src/lib/share-code';
import { flatten, reverseTour, toGpx, parseRouteFile, type LatLon, type Tour } from '../src/lib/tour';
import { packTour, unpackTour } from '../src/lib/tour-pack';
import { doubledStretch, splitDoubled, arrowsAlong } from '../src/lib/doubled';
import { PASSES, passesAlong, searchPasses } from '../src/lib/passes';
import { routePasses, passesOnLegs, insertVia, movePoint } from '../src/lib/route-edit';
import { countCurves, resample } from '../src/lib/stats';
import { mergeLegs } from '../src/lib/plan';

let fails = 0;
const bad = (area: string, msg: string) => { fails++; console.log(`FEHLER  [${area}] ${msg}`); };
function safe<T>(area: string, f: () => T): T | undefined {
  try { return f(); } catch (e) { bad(area, `wirft: ${(e as Error).message}`); return undefined; }
}
function timed(area: string, budgetMs: number, f: () => unknown) {
  const t0 = performance.now();
  safe(area, f);
  const ms = performance.now() - t0;
  console.log(`${ms > budgetMs ? 'LANGSAM' : 'zeit   '} ${area}: ${ms.toFixed(1)} ms (Budget ${budgetMs})`);
  if (ms > budgetMs) fails++;
}

// 1. Entartete Eingaben
const P: LatLon = [46.5552, 11.7592];
const lines: Record<string, LatLon[]> = {
  leer: [],
  'ein Punkt': [P],
  'zwei gleiche': [P, P],
  'viele gleiche': Array(50).fill(P),
  'hin und zurück': [P, [46.56, 11.76], P],
  'Nullinsel': [[0, 0], [0, 0.001]],
};
for (const [name, line] of Object.entries(lines)) {
  const cum = line.length ? cumulativeKm(line) : [];
  safe(`highlights ${name}`, () => findHighlights(line, cum, null));
  safe(`kurven ${name}`, () => { const c = sharpCurves(line); curveCue(c, 0); });
  safe(`kehren ${name}`, () => hairpinKms(line));
  safe(`kurvenzahl ${name}`, () => { const n = countCurves(line); if (!Number.isFinite(n)) bad('kurvenzahl', `${name}: ${n}`); });
  safe(`doppelt ${name}`, () => { doubledStretch(line); splitDoubled([line]); arrowsAlong(line, 100); });
  safe(`pässe ${name}`, () => { passesAlong(PASSES, line); routePasses(PASSES, line); });
  safe(`resample ${name}`, () => resample(line, 20));
  if (line.length) {
    const t = tourFromLine(name, line);
    safe(`teilen ${name}`, () => { const c = encodeTour(t, 'kurvig'); if (!decodeTour(c)) bad('teilen', `${name} nicht lesbar`); });
    // eine Datei ohne echte Strecke darf mit klarer Meldung abgelehnt werden, aber nie mit Unsinn
    try { parseRouteFile(toGpx(t), 'a.gpx'); } catch (e) { if (!/keine Route/.test((e as Error).message)) bad(`gpx ${name}`, (e as Error).message); }
    safe(`konto ${name}`, () => unpackTour(packTour(t, 'kurvig')));
    safe(`umdrehen ${name}`, () => reverseTour(t));
    const route = { shape: line, cumKm: cum, maneuvers: [], km: cum.at(-1) ?? 0, minutes: 0, source: 'valhalla' as const };
    safe(`snap ${name}`, () => { const s = snapToRoute(route, P, 0, 90); if (!Number.isFinite(s.km)) bad('snap', `${name} km ${s.km}`); progress(route, s.km); pointAtKm(route, 5); });
  }
}
// Kaputte Codes und Dateien
for (const code of ['', 'cumo1:', 'cumo1:%%%', 'cumo1:' + 'A'.repeat(5000), 'https://drive.rallycumo.de/t?c=xyz', 'h:abc', '\u0000']) {
  safe(`code ${JSON.stringify(code.slice(0, 20))}`, () => decodeTour(extractCode(code)));
}
for (const [n, text] of [['leer.gpx', ''], ['kaputt.gpx', '<gpx><trk><trkseg><trkpt lat="x" lon="y"/></trkseg></trk></gpx>'], ['nix.kml', '<kml></kml>'], ['bin.gpx', '\u0000\u0001']]) {
  try {
    const t = parseRouteFile(text, n);
    if (flatten(t).some((x) => !Number.isFinite(x.p[0]) || !Number.isFinite(x.p[1]))) bad('datei', `${n} liefert NaN Koordinaten`);
  } catch { /* klare Fehlermeldung ist ok */ }
}
// Suche mit Sonderzeichen
for (const q of ['', ' ', '(', '[a-', '.*', 'Grödner', 'GRÖDNER', 'groedner', 'Vrsic', 'Passo Pordoi', '🏔️']) safe(`suche ${q}`, () => searchPasses(PASSES, q));
// Wegpunkte bearbeiten
safe('einfügen leer', () => insertVia([], P));
safe('verschieben Rand', () => { movePoint([P], 0, -1); movePoint([P, P], 1, 1); });
safe('mergeLegs leer', () => mergeLegs('x', [], []));

// 2. Last: eine sehr lange Tour aus allen Korpus Touren hintereinander
const corpus: Record<string, Tour> = JSON.parse(readFileSync('qa/corpus.json', 'utf8'));
const big: LatLon[] = [];
for (const t of Object.values(corpus)) for (const x of flatten(t)) big.push(x.p);
const cum = cumulativeKm(big);
console.log(`\nLasttour: ${big.length} Punkte, ${cum.at(-1)!.toFixed(0)} km`);
const tour = tourFromLine('Last', big);
timed('Highlights Planer (4.000 km, normale Touren um 5 ms)', 1000, () => findHighlights(big, cum, null));
let curves: ReturnType<typeof sharpCurves> = [];
timed('scharfe Kurven', 400, () => { curves = sharpCurves(big); });
timed('Bremshinweis je GPS Punkt (10.000 Aufrufe)', 150, () => { for (let i = 0; i < 10000; i++) curveCue(curves, (i / 10000) * cum.at(-1)!); });
const route = { shape: big, cumKm: cum, maneuvers: [], km: cum.at(-1)!, minutes: 0, source: 'valhalla' as const };
timed('Position auf Route (2.000 Fixes mit Hinweis)', 400, () => { let h = 0; for (let i = 0; i < 2000; i++) { const p = pointAtKm(route, i * 0.05); h = snapToRoute(route, p.point, h, p.heading).index; } });
timed('Position ohne Hinweis (Start oder Neuberechnung, 50 Fixes)', 1500, () => { for (let i = 0; i < 50; i++) snapToRoute(route, pointAtKm(route, i * 40).point, -1); });
timed('Kurven zählen', 300, () => countCurves(big));
timed('Doppelte Abschnitte', 800, () => doubledStretch(big));
timed('Pässe entlang', 400, () => passesAlong(PASSES, big));
timed('Passvorschläge', 800, () => routePasses(PASSES, big));
timed('Teilen Code', 100, () => { const c = encodeTour(tour, 'kurvig'); if (c.length > 900) bad('teilen', `Code ${c.length} Zeichen, zu lang für QR`); });
timed('Konto Paket hin und zurück', 400, () => unpackTour(JSON.parse(JSON.stringify(packTour(tour, 'kurvig')))));
timed('GPX hin und zurück', 1500, () => parseRouteFile(toGpx(tour), 'a.gpx'));
// 25 Zwischenziele mit Passvorschlägen je Etappe
const slots: LatLon[] = Array.from({ length: 26 }, (_, i) => big[Math.floor((i / 25) * (big.length - 1))]);
const legLines: LatLon[][] = slots.slice(1).map((p, i) => big.slice(Math.floor((i / 25) * (big.length - 1)), Math.floor(((i + 1) / 25) * (big.length - 1)) + 1));
timed('Passvorschläge für 25 Etappen', 1500, () => passesOnLegs(PASSES, slots, legLines, new Set()));

console.log(`\n${fails} Fehler`);
process.exit(fails ? 1 : 0);
