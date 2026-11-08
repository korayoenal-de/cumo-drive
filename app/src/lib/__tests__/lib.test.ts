/**
 * Tests für reine Rechenfunktionen ohne Netz und ohne React Native.
 * Starten mit: npm test (Node Test Runner über tsx, keine weitere Bibliothek nötig).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import { arrowsAlong, doubledStretch, offsetRight, splitDoubled } from '../doubled';
import { decodeTour, encodeTour, extractCode } from '../share-code';
import { flatten, haversine, type LatLon, type Tour } from '../tour';
import { findHighlights } from '../navigation/highlights';
import { cumulativeKm, tourFromLine } from '../navigation/route';
import { pointAtKm, snapToRoute } from '../navigation/tracker';
import type { NavRoute } from '../navigation/types';
import { PASSES, passesAlong } from '../passes';

/** Gerade Linie nach Osten ab Heppenheim, n Punkte im Abstand von etwa stepM Metern */
function eastLine(n: number, stepM = 50, start: LatLon = [49.64, 8.63]): LatLon[] {
  const dLon = stepM / (111320 * Math.cos((start[0] * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [start[0], start[1] + i * dLon] as LatLon);
}

function tourOf(line: LatLon[]): Tour {
  return { name: 'Test', laenge_km: 0, wegpunkte: [line[0], line[line.length - 1]], linie: [{ c: 'ok', p: line }], warnungen: [] };
}

describe('tour', () => {
  it('haversine misst einen Breitengrad mit etwa 111 km', () => {
    const d = haversine([49, 8], [50, 8]);
    assert.ok(Math.abs(d - 111195) < 200, `${d}`);
  });

  it('flatten zählt Kilometer und lässt doppelte Punkte weg', () => {
    const line = eastLine(21, 100);
    const flat = flatten({ ...tourOf(line), linie: [{ c: 'ok', p: line.slice(0, 11) }, { c: 'raus', p: line.slice(10) }] });
    assert.equal(flat.length, 21);
    assert.ok(Math.abs(flat[20].km - 2) < 0.01, `${flat[20].km}`);
  });
});

describe('doubled', () => {
  it('findet nichts auf einer Strecke ohne Wiederholung', () => {
    assert.equal(doubledStretch(eastLine(200)).km, 0);
  });

  it('findet Hin und Rückweg auf derselben Straße', () => {
    const out = eastLine(100); // etwa 5 km
    const line = [...out, ...out.slice(0, -1).reverse()];
    const d = doubledStretch(line);
    assert.ok(d.km > 3 && d.km < 5.5, `${d.km}`);
  });

  it('splitDoubled markiert den Rückweg als doppelt', () => {
    const out = eastLine(100);
    const parts = splitDoubled([[...out, ...out.slice(0, -1).reverse()]]);
    assert.ok(parts[0].some((p) => p.doubled));
    assert.ok(parts[0].some((p) => !p.doubled));
  });

  it('offsetRight verschiebt nach rechts der Fahrtrichtung', () => {
    const line = eastLine(10);
    const off = offsetRight(line, 10);
    // nach Osten fahren: rechts ist Süden
    assert.ok(off[5][0] < line[5][0]);
    assert.ok(Math.abs(haversine(off[5], line[5]) - 10) < 1);
  });

  it('arrowsAlong setzt Pfeile im Abstand und in Fahrtrichtung', () => {
    const arrows = arrowsAlong(eastLine(41, 50), 500, 30); // 2 km
    assert.ok(arrows.length >= 3 && arrows.length <= 4, `${arrows.length}`);
    for (const a of arrows) assert.ok(Math.abs(a.deg - 90) < 2, `${a.deg}`);
  });
});

describe('share-code', () => {
  it('kodiert und dekodiert eine Tour ohne Verlust des Namens', () => {
    const line = eastLine(400, 100); // 40 km
    const code = encodeTour({ ...tourOf(line), name: 'Odenwald Runde' }, 'paesse');
    const back = decodeTour(code);
    assert.ok(back);
    assert.equal(back.name, 'Odenwald Runde');
    assert.equal(back.profile, 'paesse');
    assert.ok(haversine(back.points[0], line[0]) < 20);
    assert.ok(haversine(back.points[back.points.length - 1], line[line.length - 1]) < 20);
  });

  it('liest den Code aus Web Adresse und Link', () => {
    assert.equal(extractCode('https://drive.rallycumo.de/t#cumo1:abc'), 'cumo1:abc');
    assert.equal(extractCode('exp://x/--/scan?code=cumo1%3Aabc&x=1'), 'cumo1:abc');
  });

  it('lehnt fremde Codes ab', () => {
    assert.equal(decodeTour('hallo'), null);
    assert.equal(decodeTour('cumo1:%%%'), null);
  });
});

describe('sharpCurves', () => {
  /** Gerade nach Osten, dann ein Bogen mit Radius r und Winkel deg, dann gerade weiter */
  function bend(r: number, deg: number, left: boolean): LatLon[] {
    const s: LatLon = [49.64, 8.63];
    const mLat = 1 / 111320;
    const mLon = 1 / (111320 * Math.cos((s[0] * Math.PI) / 180));
    const pts: [number, number][] = [];
    for (let x = 0; x <= 300; x += 10) pts.push([x, 0]);
    const sign = left ? 1 : -1;
    for (let a = 5; a <= deg; a += 5) {
      const t = (a * Math.PI) / 180;
      pts.push([300 + r * Math.sin(t), sign * r * (1 - Math.cos(t))]);
    }
    const t = (deg * Math.PI) / 180;
    const [ex, ey] = pts[pts.length - 1];
    for (let d = 10; d <= 300; d += 10) pts.push([ex + d * Math.cos(t), ey + sign * d * Math.sin(t)]);
    return pts.map(([x, y]) => [s[0] + y * mLat, s[1] + x * mLon] as LatLon);
  }

  it('meldet eine enge Rechtskurve und keine weite', async () => {
    const { sharpCurves } = await import('../navigation/curves');
    const tight = sharpCurves(bend(25, 90, false));
    assert.equal(tight.length, 1);
    assert.equal(tight[0].kind, 'scharf');
    assert.equal(tight[0].dir, 'rechts');
    assert.ok(Math.abs(tight[0].startKm - 0.3) < 0.05);
    // weite Kurve: wird mit geschätztem Tempo gemeldet (r 150 m, etwa 85 km/h), sehr weite gar nicht
    const wide = sharpCurves(bend(150, 90, false));
    assert.equal(wide.length, 1);
    assert.equal(wide[0].kind, 'kurve');
    assert.ok(wide[0].vmax! >= 75 && wide[0].vmax! <= 90, String(wide[0].vmax));
    assert.equal(sharpCurves(bend(400, 60, false)).length, 0);
    assert.equal(sharpCurves(eastLine(20)).length, 0);
  });

  it('erkennt Kehren und lässt Manöver aus', async () => {
    const { sharpCurves, curveAhead } = await import('../navigation/curves');
    const pin = sharpCurves(bend(15, 180, true));
    assert.equal(pin.length, 1);
    assert.equal(pin[0].kind, 'kehre');
    assert.equal(pin[0].dir, 'links');
    assert.equal(sharpCurves(bend(25, 90, false), [0.32]).length, 0);
    assert.equal(curveAhead(pin, 0.1), null);
    assert.ok(curveAhead(pin, 0.2));
  });

  it('Bremshinweis: einzelne Kurve zählt herunter, Kehrenkette wird zusammengefasst', async () => {
    const { curveCue } = await import('../navigation/curves');
    const one = [{ startKm: 1, apexKm: 1.03, dir: 'rechts' as const, kind: 'scharf' as const }];
    assert.equal(curveCue(one, 0.8), null);
    assert.equal(curveCue(one, 0.87)?.big, '130 M');
    assert.equal(curveCue(one, 1.01)?.big, 'JETZT');
    assert.equal(curveCue(one, 1.04), null);
    const pins = [1, 1.2, 1.4].map((k, i) => ({ startKm: k, apexKm: k + 0.04, dir: (i % 2 ? 'links' : 'rechts') as 'links' | 'rechts', kind: 'kehre' as const }));
    assert.equal(curveCue(pins, 0.88)?.big, '3 KEHREN');
    assert.equal(curveCue(pins, 0.88)?.icon, 'serp');
    const second = curveCue(pins, 1.1);
    assert.equal(second?.big, '2 VON 3');
    assert.equal(second?.label, 'Kehre links in 100 m');
  });
});

// Regressionen aus der QS vom 6.11.2026 (echte Touren aus qa/corpus.json)
describe('QS Regressionen', () => {
  const corpus = JSON.parse(readFileSync(new URL('../../../qa/corpus.json', import.meta.url), 'utf8')) as Record<string, Tour>;
  const lineOf = (n: string) => flatten(corpus[n]).map((x) => x.p);

  it('Sellaronda zeigt alle vier Pässe einzeln', () => {
    const line = lineOf('Sellaronda');
    const names = findHighlights(line, cumulativeKm(line), null).map((h) => h.name);
    for (const p of ['Sellajoch', 'Pordoijoch', 'Campolongo', 'Grödner Joch']) assert.ok(names.some((n) => n.includes(p)), `${p} fehlt in ${names}`);
  });

  it('Position springt am Ende einer Runde nicht an den Start', () => {
    const line = lineOf('Grimsel Furka Susten');
    const cum = cumulativeKm(line);
    const route: NavRoute = { shape: line, cumKm: cum, maneuvers: [], km: cum[cum.length - 1], minutes: 0, source: 'valhalla' };
    // kurz vor dem Ziel, mit 120 m GPS Fehler quer zur Straße
    const at = pointAtKm(route, route.km - 23);
    const p: LatLon = [at.point[0] + 0.0011, at.point[1]];
    const s = snapToRoute(route, p, pointAtKm(route, route.km - 23.6).index, at.heading);
    assert.ok(s.km > route.km - 30, `gesprungen auf km ${s.km.toFixed(1)}`);
  });

  it('Stichstraße: auf dem Rückweg zählt der Rückweg', () => {
    const line: LatLon[] = [[46.5, 11.0], [46.5, 11.01], [46.5, 11.02], [46.5, 11.01], [46.5, 11.0], [46.49, 11.0]];
    const cum = cumulativeKm(line);
    const route: NavRoute = { shape: line, cumKm: cum, maneuvers: [], km: cum[cum.length - 1], minutes: 0, source: 'valhalla' };
    let hint = 0;
    let km = 0;
    for (let k = 0; k <= route.km; k += 0.03) {
      const at = pointAtKm(route, k);
      const s = snapToRoute(route, at.point, hint, at.heading);
      hint = s.index;
      km = s.km;
      assert.ok(Math.abs(s.km - k) < 0.1, `bei km ${k.toFixed(2)} auf ${s.km.toFixed(2)}`);
    }
    assert.ok(route.km - km < 0.1);
  });

  it('kurze Runde lässt sich als Link teilen', () => {
    const t = tourFromLine('Runde', [[46.5, 11.0], [46.505, 11.0], [46.505, 11.006], [46.5, 11.006], [46.5, 11.0]]);
    const back = decodeTour(encodeTour(t, 'kurvig'));
    assert.ok(back && back.points.length >= 3);
  });

  it('Pässe entlang einer langen Tour sind schnell', () => {
    const big: LatLon[] = [];
    for (const n of Object.keys(corpus)) big.push(...lineOf(n));
    const t0 = performance.now();
    passesAlong(PASSES, big);
    assert.ok(performance.now() - t0 < 500);
  });
});

describe('Fahrspaß Wert einer Tour', () => {
  it('Alpenpässe hoch, schnelle Anfahrt niedrig, Stufen passen zur Skala', async () => {
    const { tourFun, tourFunLevel } = await import('../fun-score');
    const corpus = (await import('../../../qa/corpus.json')).default as unknown as Record<string, Tour>;
    const score = (n: string) => tourFun(flatten(corpus[n]).map((x) => x.p))!.score;
    assert.ok(score('Sellaronda') >= 85);
    assert.ok(score('Anfahrt schnell dann kurvig') < 35);
    assert.deepEqual([0, 34, 35, 55, 70, 85, 100].map(tourFunLevel), [1, 1, 2, 3, 4, 5, 5]);
  });
});

describe('Kreisverkehr Richtung', () => {
  it('Wenden über den Kreisverkehr zeigt zurück, nicht links', async () => {
    const { roundaboutTurn } = await import('../navigation/roundabout');
    const { symbolFor } = await import('../../components/navigation/maneuver-geometry');
    const { cumulativeKm } = await import('../navigation/route');
    // 300 m nach Norden, Ring (r 15 m) gegen den Uhrzeigersinn fast ganz herum, dann zurück nach Süden
    const d = 0.0000090;
    const shape: LatLon[] = [];
    for (let i = 0; i <= 30; i++) shape.push([47 + i * 10 * d, 8]);
    const c: LatLon = [47 + 315 * d, 8];
    for (let a = 180; a >= -150; a -= 15) {
      const r = (a * Math.PI) / 180;
      shape.push([c[0] + 15 * d * Math.cos(r), c[1] + (15 * d * Math.sin(r)) / Math.cos((47 * Math.PI) / 180)]);
    }
    for (let i = 1; i <= 20; i++) shape.push([shape[shape.length - 1][0] - 10 * d, shape[shape.length - 1][1]]);
    const cumKm = cumulativeKm(shape);
    const route = { shape, cumKm, km: cumKm[cumKm.length - 1], minutes: 5, source: 'valhalla', maneuvers: [{ kind: 'kreisverkehr', text: '', speech: '', exit: 4, index: 30, km: cumKm[30] }] } as unknown as NavRoute;
    const t = roundaboutTurn(route, 0)!;
    assert.ok(Math.abs(t) > 130, `Winkel ${t}`);
    assert.equal(symbolFor('kreisverkehr', 4, t), 'kreisverkehr_w_4');
    assert.equal(symbolFor('kreisverkehr', 2, 85), 'kreisverkehr_r_2');
  });
});
