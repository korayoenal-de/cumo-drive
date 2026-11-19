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
/**
 * Tempo des Rechners (Koray 19.11.2026). Die Budgets unten sind an einem normalen Rechner geeicht. Auf einem geteilten
 * Rechner bei GitHub lief am 19.11. alles gleichmäßig 1,7 mal langsamer, und „Position ohne Hinweis" riss ihr Budget
 * (1.690 und 1.770 statt 970 ms), ohne dass sich am Code etwas geändert hatte: kein Update ging raus.
 * Darum misst der Test zuerst eine feste Rechenaufgabe (dieselbe Art Arbeit: Winkel und Abstände) und streckt die
 * Budgets um den Faktor, um den der Rechner langsamer ist als die Eichung. Schneller als die Eichung zählt nicht
 * (Faktor mindestens 1), und mehr als das Dreifache wird nicht ausgeglichen: dann ist der Lauf ohnehin nicht belastbar.
 * So wird weiter rot, was im Code langsamer wurde, aber nicht mehr, was am Rechner liegt.
 */
const CALIB_REF_MS = 14;
function calibrate(): number {
  // wie die Kernlogik: viele kleine Punkt Paare im Speicher, je Punkt Abstand und Winkel
  const pts: [number, number][] = Array.from({ length: 300_000 }, (_, i) => [46 + (i % 1000) * 1e-4, 11 + (i % 777) * 1e-4]);
  let best = Infinity;
  for (let run = 0; run < 15; run++) {
    const t0 = performance.now();
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [la, lo] = pts[i];
      const [la0, lo0] = pts[i - 1];
      const h = Math.sin((la - la0) * 0.0087) ** 2 + Math.cos(la * 0.0174) * Math.cos(la0 * 0.0174) * Math.sin((lo - lo0) * 0.0087) ** 2;
      acc += Math.asin(Math.sqrt(Math.min(1, h))) + Math.atan2(lo - lo0, la - la0);
    }
    if (acc !== acc) throw new Error('Eichung liefert keine Zahl');
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}
const CALIB_MS = calibrate();
const SPEED = Math.min(3, Math.max(1, CALIB_MS / CALIB_REF_MS));
console.log(`tempo   Eichung ${CALIB_MS.toFixed(1)} ms (Bezug ${CALIB_REF_MS} ms), Budgets mal ${SPEED.toFixed(2)}`);

function timed(area: string, budgetMs: number, f: () => unknown) {
  const budget = budgetMs * SPEED;
  const t0 = performance.now();
  safe(area, f);
  const ms = performance.now() - t0;
  console.log(`${ms > budget ? 'LANGSAM' : 'zeit   '} ${area}: ${ms.toFixed(1)} ms (Budget ${budget.toFixed(0)}${SPEED > 1 ? `, geeicht ${budgetMs}` : ''})`);
  if (ms > budget) fails++;
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
