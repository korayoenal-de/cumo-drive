/**
 * Tests für reine Rechenfunktionen ohne Netz und ohne React Native.
 * Starten mit: npm test (Node Test Runner über tsx; expo-speech, AsyncStorage und react-native ersetzt
 * scripts/replay/stub.ts, damit die Navigationsmodule ohne App laden).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import { _setLangForTest } from '../../i18n';

import { arrowsAlong, doubledStretch, offsetRight, splitDoubled } from '../doubled';
import { decodeTour, encodeTour, extractCode, keepsLine } from '../share-code';
import { flatten, haversine, type LatLon, type Tour } from '../tour';
import { findHighlights } from '../navigation/highlights';
import { cumulativeKm, tourFromLine } from '../navigation/route';
import { edgeLimits, shownLimitAt } from '../navigation/speed-zones';
import { pointAtKm, snapToRoute } from '../navigation/tracker';
import type { NavRoute } from '../navigation/types';
import { PASSES, passesAlong } from '../passes';
import { planReminder } from '../plan-reminder';
import { remainingStops } from '../navigation/replan';
import { errorFingerprint, topFrames } from '../error-fingerprint';
import { pickOnScreen, pickPin, routeStroke, simplifyForScreen } from '../map-hit';
import { closureExclude, onPassRoad } from '../road-closures';
import { HIGHLIGHT_ROADS, PREFER_ROADS } from '../highlight-roads';
import { RECOMMENDED } from '../recommended';
import { roadDataLoaded } from '../road-data';
import { decodePolyline, encodePolyline } from '../polyline';
import type { PlannedTour } from '../plan';
import { reanchorLoop, rotateLoop, runFor } from '../plan-window';

// Vor jedem Test festhalten: Laden aller Module entpackt die Daten noch nicht (Performance Punkt 1, 17.11.)
const loadedAtImport = roadDataLoaded();

// Die Texte der Tests sind deutsch; der Rechner hier läuft oft auf Englisch
_setLangForTest('de');

/** Gerade Linie nach Osten ab Heppenheim, n Punkte im Abstand von etwa stepM Metern */
function eastLine(n: number, stepM = 50, start: LatLon = [49.64, 8.63]): LatLon[] {
  const dLon = stepM / (111320 * Math.cos((start[0] * Math.PI) / 180));
  return Array.from({ length: n }, (_, i) => [start[0], start[1] + i * dLon] as LatLon);
}

function tourOf(line: LatLon[]): Tour {
  return { name: 'Test', laenge_km: 0, wegpunkte: [line[0], line[line.length - 1]], linie: [{ c: 'ok', p: line }], warnungen: [] };
}

describe('Daten erst beim ersten Gebrauch (Performance 17.11.)', () => {
  it('Laden der Module entpackt nichts', () => {
    assert.equal(loadedAtImport, false);
  });
  it('erster Zugriff lädt, danach sind alle Listen voll und verhalten sich wie Arrays', () => {
    assert.ok(PASSES.length > 300, `Pässe ${PASSES.length}`);
    assert.equal(roadDataLoaded(), true);
    assert.ok(HIGHLIGHT_ROADS.length > 100 && PREFER_ROADS.length > 100 && RECOMMENDED.length > 50);
    assert.ok(Array.isArray(PASSES));
    assert.equal([...PASSES].length, PASSES.length);
    assert.equal(PASSES.filter(() => true).length, PASSES.length);
    assert.ok(PASSES.some((p) => p.tier === 'ikone'));
    assert.equal(Object.keys(PASSES).length, PASSES.length);
  });
});

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

  it('schickt bei importierten Touren die Original Linie mit, passend in den kurzen Link (Koray 21.11.)', () => {
    // 195 km kurvige Runde aus einem Import, Punkt alle 20 m, nur Start und Ziel als Wegpunkte
    const line: [number, number][] = [];
    for (let i = 0; i <= 9750; i++) {
      const a = (i / 9750) * 2 * Math.PI;
      line.push([49.64 + 0.25 * Math.sin(a) + 0.002 * Math.sin(i / 7), 8.64 + 0.38 * (1 - Math.cos(a)) + 0.002 * Math.cos(i / 9)]);
    }
    const t = { ...tourOf(line), name: 'calimoto Runde', geprueft: false, wegpunkte: [line[0], line[line.length - 1]] };
    assert.ok(keepsLine(t));
    const code = encodeTour(t, 'kurvig', { full: true, line: true });
    assert.ok(code.length <= 20000, `${code.length}`);
    const back = decodeTour(code);
    assert.ok(back?.line && back.line.length > 200, `${back?.line?.length}`);
    // Stichprobe: jeder Originalpunkt liegt nahe an der ausgedünnten Linie (Abstand zum Segment, in Metern)
    const toSeg = (p: [number, number], a: [number, number], b: [number, number]) => {
      const k = Math.cos((p[0] * Math.PI) / 180) * 111320;
      const [px, py, ax, ay, bx, by] = [p[1] * k, p[0] * 111320, a[1] * k, a[0] * 111320, b[1] * k, b[0] * 111320];
      const L = (bx - ax) ** 2 + (by - ay) ** 2;
      const u = L ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L)) : 0;
      return Math.hypot(px - ax - u * (bx - ax), py - ay - u * (by - ay));
    };
    const bl = back.line;
    for (let i = 0; i < line.length; i += 250) {
      let d = Infinity;
      for (let j = 1; j < bl.length; j++) d = Math.min(d, toSeg(line[i], bl[j - 1], bl[j]));
      assert.ok(d < 70, `${i}: ${d}`);
    }
    // geplante Touren bleiben ohne Linie
    assert.equal(keepsLine({ ...t, geprueft: true }), false);
    assert.equal(decodeTour(encodeTour({ ...t, geprueft: true }, 'kurvig', { full: true }))?.line, undefined);
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
    // weite Kurve: wird mit geschätztem Tempo gemeldet (r 100 m, etwa 85 km/h), sehr weite gar nicht
    const wide = sharpCurves(bend(100, 90, false));
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

  it('Kurvenansagen: Stufen nach Radius, Kehre, nur in Highlights, zwei Kurven mit dann', async () => {
    const { paceNotes, paceText } = await import('../navigation/pace-notes');
    assert.equal(paceNotes(bend(150, 60, false))[0]?.grade, 'leicht');
    assert.equal(paceNotes(bend(60, 90, true))[0]?.grade, 'mittel');
    assert.equal(paceNotes(bend(25, 90, false))[0]?.grade, 'scharf');
    const pin = paceNotes(bend(15, 180, true));
    assert.equal(pin[0]?.grade, 'kehre');
    assert.equal(paceText(pin, 0).text, 'Kehre links');
    assert.equal(paceNotes(bend(400, 60, false)).length, 0);
    assert.equal(paceNotes(eastLine(20)).length, 0);
    // außerhalb der Highlights still
    assert.equal(paceNotes(bend(25, 90, false), [], [{ startKm: 2, endKm: 3 }]).length, 0);
    const two = [
      { startKm: 1, endKm: 1.05, dir: 'links' as const, grade: 'mittel' as const, radius: 60, deg: 50 },
      { startKm: 1.08, endKm: 1.12, dir: 'rechts' as const, grade: 'scharf' as const, radius: 30, deg: 80 },
    ];
    assert.deepEqual(paceText(two, 0), { text: 'Links mittel, dann rechts scharf', count: 2 });
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

describe('Tempolimit am Ortsausgang', () => {
  // Kanten wie am 12.11. hinter Schwanheim: im Ort 50 mit Straßenname, danach L 3345 ohne Schild bis zur K 65
  const town = { length: 0.041, speed_limit: 50, road_class: 'secondary', density: 2, names: ['Rohrheimer Straße', 'L 3345'] };
  const open = (length: number) => ({ length, road_class: 'secondary', density: 2, names: ['L 3345'] });

  it('50 aus dem Ort gilt auf der freien Strecke nicht weiter', () => {
    const l = edgeLimits([town, open(0.008), open(0.1), open(0.106), open(0.13), open(0.27)], null);
    assert.deepEqual(l.map((x) => x.known), [true, true, true, false, false, false]);
    // geschätzt wird dort außerorts, damit die Kurvenwarnung arbeitet; angezeigt wird nichts
    assert.deepEqual(l.slice(3).map((x) => x.v), [100, 100, 100]);
  });

  it('50 bleibt im Ort über eine Lücke mit Straßenname und über einen kurzen Kreisverkehr ohne Namen', () => {
    const gap = { length: 0.4, road_class: 'secondary', density: 2, names: ['Rohrheimer Straße', 'L 3345'] };
    const ring = { length: 0.03, road_class: 'secondary', density: 2 };
    const l = edgeLimits([town, gap, ring, ring, gap], null);
    assert.ok(l.every((x) => x.known && x.v === 50));
  });

  it('Autobahn ohne Tempolimit zeigt kein Schild (A6, Koray 21.11.)', () => {
    const a6 = (speed_limit: number | 'unlimited') => ({ length: 1, road_class: 'motorway', speed_limit, names: ['A 6'] });
    const l = edgeLimits([a6(120), a6('unlimited'), { length: 1, road_class: 'motorway', names: ['A 6'] }], null);
    assert.deepEqual(l.map((x) => x.known), [true, false, false]);
    assert.deepEqual(l.map((x) => x.v), [120, 130, 130]);
  });

  it('70 und mehr gelten bis zum nächsten Schild weiter', () => {
    const l = edgeLimits([{ ...town, speed_limit: 70 }, open(0.5), open(0.5)], null);
    assert.ok(l.every((x) => x.known && x.v === 70));
  });
});

describe('Graue 100 (Koray 13.11.)', () => {
  const open = (length: number) => ({ length, road_class: 'secondary', density: 0, names: ['L 3345'] });

  it('im Kreisverkehr ohne Schild wird keine 100 geschätzt', () => {
    const ring = { length: 0.05, road_class: 'secondary', density: 0, roundabout: true };
    const l = edgeLimits([open(1), ring, ring, open(1)], null);
    assert.deepEqual(l.map((x) => x.v), [100, 50, 50, 100]);
    assert.ok(l.every((x) => !x.known));
  });

  it('ein Schild vor dem Kreisverkehr gilt darin weiter', () => {
    const ring = { length: 0.05, road_class: 'secondary', density: 0, roundabout: true };
    const l = edgeLimits([{ ...open(0.5), speed_limit: 70 }, ring], null);
    assert.ok(l.every((x) => x.known && x.v === 70));
  });

  it('kurze Lücken mit geschätzten 100 zwischen zwei Zonen zeigen nichts', () => {
    const z = { endKm: [1, 1.2, 3], limit: [70, 100, 70], known: [true, false, true], loadedKm: 3 };
    assert.equal(shownLimitAt(z, 1.1), null);
    assert.deepEqual(shownLimitAt({ ...z, endKm: [1, 2, 3] }, 1.5), { limit: 100, estimated: true });
  });
});

describe('Wendeschleifen (Matthias 15.11.)', () => {
  // Straße mit getrennten Fahrbahnen nach Norden, Gegenfahrbahn 30 m östlich
  const W = 8.43;
  const E = 8.43 + 30 / (111320 * Math.cos((49.31 * Math.PI) / 180));
  const leg = (lon: number, from: number, to: number): LatLon[] => {
    const n = Math.max(2, Math.round(Math.abs(to - from) * 111320 / 20));
    return Array.from({ length: n + 1 }, (_, i) => [from + ((to - from) * i) / n, lon] as LatLon);
  };
  /** Rampe als Halbkreis von einer Fahrbahn zur anderen, nach außen (Radius 120 m) */
  const ramp = (lat: number, north: boolean): LatLon[] => {
    const k = 111320 * Math.cos((lat * Math.PI) / 180);
    const cx = (W + E) / 2;
    const out: LatLon[] = [];
    for (let a = 0; a <= 180; a += 10) {
      const t = (a * Math.PI) / 180;
      const dx = (north ? -1 : 1) * Math.cos(t) * (15 / k) - Math.sin(t) * (120 / k) * (north ? 1 : -1);
      const dy = Math.sin(t) * (120 / 111320) * (north ? 1 : -1);
      out.push([lat + dy, cx + dx]);
    }
    return out;
  };
  const wende: LatLon[] = [...leg(W, 49.3, 49.32), ...ramp(49.32, true), ...leg(E, 49.32, 49.31)];

  it('findet die Wende am Kreuz und legt den Punkt auf der Gegenfahrbahn auf den Hinweg', async () => {
    const { findUTurns, movePointsOffUTurns, unwantedUTurns } = await import('../uturn');
    const t = findUTurns(wende);
    assert.equal(t.length, 1);
    assert.ok(haversine(t[0].tip, [49.321, (W + E) / 2]) < 150);
    const pts: LatLon[] = [[49.3, W], [49.31, E], [49.4, W]];
    assert.equal(unwantedUTurns(wende, pts).length, 1);
    const moved = movePointsOffUTurns(pts, t)!;
    assert.ok(moved);
    assert.ok(Math.abs(moved[1][1] - W) < 1e-6, 'Punkt liegt jetzt auf der Fahrbahn nach Norden');
    // Punkt an der Spitze: gewollt (Stich zum Café)
    assert.equal(unwantedUTurns(wende, [[49.3, W], [49.3212, (W + E) / 2], [49.4, W]]).length, 0);
  });

  it('Spitzkehren und gerade Strecken sind keine Wende', async () => {
    const { findUTurns } = await import('../uturn');
    assert.equal(findUTurns(leg(W, 49.3, 49.35)).length, 0);
    // Kehre mit auseinanderlaufenden Schenkeln
    const a: LatLon[] = Array.from({ length: 40 }, (_, i) => [49.3 + i * 0.0002, W + i * 0.00005] as LatLon);
    const b: LatLon[] = Array.from({ length: 40 }, (_, i) => [49.3078 - i * 0.0002, W + 0.0025 + i * 0.0002] as LatLon);
    assert.equal(findUTurns([...a, ...b]).length, 0);
  });

  it('Navigation: wer die Wendeschleife auslässt, ist nicht abseits', () => {
    // Tour: nach Norden, Wende am Kreuz, zurück zum Punkt, Wende im Süden, wieder nach Norden weiter
    const shape: LatLon[] = [...wende, ...ramp(49.31, false), ...leg(W, 49.31, 49.34)];
    const route: NavRoute = { shape, cumKm: cumulativeKm(shape), maneuvers: [], km: 0, minutes: 0, source: 'valhalla' };
    route.km = route.cumKm[route.cumKm.length - 1];
    const before = snapToRoute(route, [49.3195, W], -1, 0);
    // geradeaus über das Kreuz weiter nach Norden statt in die Schleife
    const s = snapToRoute(route, [49.3225, W], before.index, 0, 120);
    assert.ok(s.offM < 10, `auf der Route, ${s.offM.toFixed(0)} m`);
    assert.ok(s.km > before.km + 2, 'nach vorne gesprungen');
  });
});

describe('Restzeit aus den Zeiten der Anweisungen (Matthias 15.11.)', () => {
  it('Ort langsam, Landstraße schnell, statt gleichmäßig verteilt', async () => {
    const { minutesAlong, minutesAt } = await import('../navigation/route');
    // 10 km Landstraße in 6 min, dann 2 km Ort in 6 min
    const cumKm = [0, 5, 10, 11, 12];
    const cumMin = minutesAlong([{ idx: 0, time: 360 }, { idx: 2, time: 360 }, { idx: 4, time: 0 }], cumKm)!;
    assert.deepEqual(cumMin.map((x) => +x.toFixed(2)), [0, 3, 6, 9, 12]);
    const r = { cumKm, cumMin, km: 12, minutes: 12 };
    // 2 km vor dem Ziel (am Ortseingang): noch 6 min, gleichmäßig verteilt wären es nur 2
    assert.equal(+(12 - minutesAt(r, 10)).toFixed(2), 6);
    assert.equal(+minutesAt({ cumKm, km: 12, minutes: 12 }, 10).toFixed(2), 10);
  });
});

describe('Sperrungen auf Passstraßen', () => {
  // Pordoijoch Richtung Arabba (TomTom 16.11.), etwa 1 km hinter der Passhöhe
  const pordoi: LatLon[] = [[46.48296, 11.82199], [46.48305, 11.82599], [46.48407, 11.82874]];
  const mannheim: LatLon[] = [[49.4875, 8.466], [49.489, 8.47]];
  it('erkennt die Passstraße', () => {
    assert.equal(onPassRoad(pordoi), true);
    assert.equal(onPassRoad(mannheim), false);
  });
  it('im Planer nur Hinweis, unterwegs umfahren', () => {
    const hits = [{ closure: { id: 'x', line: pordoi }, points: pordoi, firstIndex: 0 }];
    const far: LatLon[] = [[46.6, 11.6], [46.4, 12.1]];
    assert.equal(closureExclude(hits, far, 'hint').length, 0);
    assert.equal(closureExclude(hits, far).length, 1);
  });
});

describe('Community Karte: Treffer und Linie (Koray 17.11.)', () => {
  // 400 pt breit, 8 Grad Länge: 50 pt je Grad
  const region = { latitude: 47, longitude: 10, latitudeDelta: 8, longitudeDelta: 8 };
  const pins = [
    { id: 'a', kind: 'route' as const, p: [47, 10] as LatLon },
    { id: 'b', kind: 'route' as const, p: [47, 10.4] as LatLon },
  ];
  it('weit: knapp daneben trifft trotzdem den nächsten Punkt', () => {
    assert.equal(pickPin(pins, [47.1, 10.25], region, 400, 'weit')?.id, 'b');
    assert.equal(pickPin(pins, [47, 10.1], region, 400, 'weit')?.id, 'a');
  });
  it('Bildschirmpunkte: der nächste Punkt im Umkreis gewinnt, auch wenn die Karte verzerrt ist (Koray 18.11.)', async () => {
    // Projektion wie auf dem Globus: nichts davon passt zur Mercator Rechnung
    const project = async (p: LatLon) => ({ x: p[1] === 10 ? 100 : 180, y: 300 });
    assert.equal((await pickOnScreen(pins, { x: 160, y: 310 }, project, () => 34))?.id, 'b');
    assert.equal((await pickOnScreen(pins, { x: 110, y: 295 }, project, () => 34))?.id, 'a');
    assert.equal(await pickOnScreen(pins, { x: 300, y: 600 }, project, () => 34), null);
    // Plakette über dem Punkt: 22 pt höher, seitlich breiter gefangen
    assert.equal((await pickOnScreen(pins, { x: 120, y: 278 }, project, () => 38, () => ({ lift: 22, wide: true })))?.id, 'a');
    // Abfrage schlägt fehl: undefined, der Aufrufer rechnet wie bisher
    assert.equal(await pickOnScreen(pins, { x: 1, y: 1 }, async () => Promise.reject(new Error('x')), () => 34), undefined);
  });
  it('weit: freie Karte hebt die Auswahl auf', () => {
    assert.equal(pickPin(pins, [45, 8], region, 400, 'weit'), null);
  });
  it('nah: die Plakette über dem Punkt zählt, auch seitlich', () => {
    const near = { latitude: 47, longitude: 10, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    const one = [{ id: 'x', kind: 'route' as const, p: [47, 10] as LatLon }];
    // 2000 pt je Grad: 22 pt über dem Punkt und 40 pt seitlich
    assert.equal(pickPin(one, [47 + 22 / 2000 / Math.cos((47 * Math.PI) / 180) * 1, 10 + 40 / 2000], near, 400, 'nah')?.id, 'x');
  });
  it('herausgezoomt wird die Strecke dünn statt ein Fleck', () => {
    const line: LatLon[] = Array.from({ length: 2000 }, (_, i) => [47 + Math.sin(i / 7) * 0.01, 10 + i * 0.00005] as LatLon);
    const far = routeStroke(line, { latitude: 47, longitude: 10, latitudeDelta: 8, longitudeDelta: 8 }, 400);
    assert.ok(far.width <= 2 && far.shadow === 0);
    const close = routeStroke(line, { latitude: 47, longitude: 10, latitudeDelta: 0.1, longitudeDelta: 0.1 }, 400);
    assert.equal(close.width, 5);
    const thin = simplifyForScreen(line, { latitude: 47, longitude: 10, latitudeDelta: 8, longitudeDelta: 8 }, 400);
    assert.ok(thin.length < 100, `zu viele Punkte: ${thin.length}`);
    assert.deepEqual(thin[0], line[0]);
    assert.deepEqual(thin[thin.length - 1], line[line.length - 1]);
  });
});

describe('Erinnerung vor der Verlängerung (Koray 17.11.)', () => {
  const now = new Date('2026-11-17T12:00:00').getTime();
  it('Jahr: 7 Tage vorher um 10 Uhr', () => {
    const r = planReminder({ id: 'jahr', willRenew: true, until: new Date('2027-11-17T09:00:00') }, now);
    assert.ok(r);
    assert.equal(r.at.getDate(), 10);
    assert.equal(r.at.getHours(), 10);
  });
  it('Jahr gekündigt, Monat und Woche: keine Erinnerung', () => {
    assert.equal(planReminder({ id: 'jahr', willRenew: false, until: new Date('2027-11-17') }, now), null);
    assert.equal(planReminder({ id: 'monat', willRenew: true, until: new Date('2026-12-17') }, now), null);
    assert.equal(planReminder({ id: 'woche', willRenew: true, until: new Date('2026-11-24') }, now), null);
  });
  it('Saison Pass: 3 Tage vor dem Ende, nicht mehr kurz davor', () => {
    assert.ok(planReminder({ id: 'saison', willRenew: false, until: new Date('2027-05-01') }, now));
    assert.equal(planReminder({ id: 'saison', willRenew: false, until: new Date('2026-11-19') }, now), null);
  });
});

describe('Absturzberichte: Fingerabdruck (Koray 17.11.)', () => {
  const stackA = 'TypeError: x\n    at renderTour (index.bundle:1:2345)\n    at map (native)\n    at TourCard (index.bundle:9:99)';
  const stackB = 'TypeError: x\n    at renderTour (index.bundle:7:1)\n    at map (native)\n    at TourCard (index.bundle:3:12)';
  it('gleich trotz anderer Zeilen und Zahlen', () => {
    assert.equal(errorFingerprint('Tour 12 hat keine Linie', stackA), errorFingerprint('Tour 345 hat keine Linie', stackB));
  });
  it('verschieden bei anderer Meldung oder Funktion', () => {
    assert.notEqual(errorFingerprint('A', stackA), errorFingerprint('B', stackA));
    assert.notEqual(errorFingerprint('A', stackA), errorFingerprint('A', stackA.replace('renderTour', 'drawLine')));
  });
  it('liest Hermes und JavaScriptCore Stapel', () => {
    assert.deepEqual(topFrames(stackA), ['renderTour', 'map', 'TourCard']);
    assert.deepEqual(topFrames('renderTour@index.bundle:1:2\nTourCard@index.bundle:3:4'), ['renderTour', 'TourCard']);
  });
});

describe('Verpasster Zwischenpunkt (Koray 17.11., Nutzerstimmen)', () => {
  // Gerade Linie nach Osten, etwa 1 km je 0,0136 Grad Länge bei 48 Grad Breite
  const line = (from: number, to: number, lat = 48): LatLon[] => Array.from({ length: 41 }, (_, i) => [lat, from + ((to - from) * i) / 40] as LatLon);
  const req = (wegpunkte: LatLon[], l: LatLon[]) => ({ tour: { ...tourFromLine('t', l), wegpunkte } }) as unknown as Parameters<typeof remainingStops>[0];

  it('nach einem verpassten Zwischenpunkt geht es zum nächsten weiter, nicht zurück', () => {
    const l = line(9, 9.4);
    const r = req([l[0], l[10], l[30], l[40]], l);
    // neben der Tour, schon hinter Zwischenziel 1 (Index 10), vor Zwischenziel 2
    const stops = remainingStops(r, [48.003, 9.2]);
    assert.deepEqual(stops, [l[30], l[40]]);
  });

  it('Runde mit gleicher Hin und Rückfahrt: am Anfang bleiben alle Zwischenziele', () => {
    // hin nach Osten, oben herum (Zwischenziele), zurück auf derselben Straße
    const out = line(9, 9.1);
    const loop: LatLon[] = [[48.02, 9.1], [48.04, 9.15], [48.02, 9.2], [48, 9.1]];
    const back = [...out].reverse();
    const l = [...out, ...loop, ...back];
    const r = req([l[0], loop[1], loop[2], l[l.length - 1]], l);
    const total = tourFromLine('t', l).laenge_km;
    // kurz nach dem Start auf der gemeinsamen Straße, fast die ganze Tour liegt noch vor einem
    const early = remainingStops(r, [48.0005, 9.02], total - 1.5);
    assert.deepEqual(early, [loop[1], loop[2], l[l.length - 1]]);
    // dieselbe Stelle auf der Rückfahrt: nur noch das Ziel
    const late = remainingStops(r, [48.0005, 9.02], 1.5);
    assert.deepEqual(late, [l[l.length - 1]]);
  });
});

describe('Kodierte Linien (Performance 17.11.)', () => {
  it('Hin und zurück ohne Verlust, auch westlich und südlich, Faktor 1e6 und 1e5', () => {
    const pts: LatLon[] = [[49.640043, 8.644979], [49.640138, 8.645439], [-33.856784, 151.215297], [40.712776, -74.005974], [0, 0]];
    for (const f of [1e6, 1e5]) {
      const back = decodePolyline(encodePolyline(pts, f), f);
      assert.equal(back.length, pts.length);
      pts.forEach((p, i) => {
        assert.ok(Math.abs(back[i][0] - p[0]) <= 0.5 / f + 1e-12 && Math.abs(back[i][1] - p[1]) <= 0.5 / f + 1e-12, `${f} ${i}`);
      });
    }
  });
  it('bekanntes Beispiel aus der Beschreibung des Verfahrens', () => {
    const d = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 1e5);
    assert.deepEqual(d.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
});

describe('Rundtour weiterdrehen und Umsortieren (Gregor 19.11.2026)', () => {
  // Quadrat S, A, B, C, S mit je elf Punkten je Seite
  const corner: LatLon[] = [[49.6, 8.6], [49.6, 8.7], [49.7, 8.7], [49.7, 8.6], [49.6, 8.6]];
  const line: LatLon[] = [];
  for (let i = 0; i < 4; i++) for (let s = i === 0 ? 0 : 1; s <= 10; s++) line.push([corner[i][0] + ((corner[i + 1][0] - corner[i][0]) * s) / 10, corner[i][1] + ((corner[i + 1][1] - corner[i][1]) * s) / 10]);
  const loop: PlannedTour = {
    name: 'Karussell', laenge_km: 37, wegpunkte: corner, minutes: 40, fixes: 0, namen: ['S', 'A', 'B', 'C', 'S'],
    linie: [{ c: 'ok', p: line.slice(0, 16) }, { c: 'pruefen', p: line.slice(15) }],
    warnungen: [{ klasse: 'pruefen', start_km: 30, laenge_km: 1, name: 'x', ort: '', gruende: [], mitte: line[35] }],
  };
  const lineOf = (t: PlannedTour) => flatten(t).map((x) => x.p);
  const lenOf = (t: PlannedTour) => flatten(t).slice(-1)[0].km;

  it('dreht die Runde auf den zweiten Punkt, die Strecke bleibt dieselbe', () => {
    const r = rotateLoop(loop, 2)!;
    assert.ok(r);
    assert.deepEqual(r.wegpunkte, [corner[2], corner[3], corner[0], corner[1], corner[2]]);
    assert.deepEqual(r.namen, ['B', 'C', 'S', 'A', 'B']);
    const pts = lineOf(r);
    assert.deepEqual(pts[0], corner[2]);
    assert.deepEqual(pts[pts.length - 1], corner[2]);
    assert.equal(pts.length, line.length);
    assert.ok(Math.abs(lenOf(r) - lenOf(loop)) < 0.01);
    // jedes Stück der alten Linie kommt genau einmal vor
    const seg = (a: LatLon[]) => new Set(a.slice(1).map((p, i) => `${a[i]}>${p}`));
    assert.deepEqual([...seg(pts)].sort(), [...seg(line)].sort());
    // die Warnung wandert mit: vorher bei km 30, die Naht liegt bei etwa km 18,3
    assert.ok(Math.abs(r.warnungen[0].start_km - (30 - flatten(loop)[20].km)) < 0.05);
  });

  it('dreht nichts, was keine Runde ist oder kein Zwischenziel meint', () => {
    assert.equal(rotateLoop({ ...loop, wegpunkte: corner.slice(0, 4) }, 1), null);
    assert.equal(rotateLoop(loop, 0), null);
    assert.equal(rotateLoop(loop, 4), null);
  });

  it('beginnt die Runde an einem Ort zwischen zwei Punkten, der alte Start bleibt Zwischenziel', () => {
    // Mitte der Seite von A nach B, 300 m daneben
    const p: LatLon = [49.65, 8.704];
    const r = reanchorLoop(loop, p)!;
    assert.ok(r);
    assert.ok(r.offM > 200 && r.offM < 400);
    assert.deepEqual(r.entry, line[15]);
    assert.deepEqual(r.tour.wegpunkte, [line[15], corner[2], corner[3], corner[0], corner[1], line[15]]);
    const pts = lineOf(r.tour);
    assert.equal(pts.length, line.length);
    assert.deepEqual(pts[0], line[15]);
    assert.deepEqual(pts[pts.length - 1], line[15]);
    assert.ok(Math.abs(lenOf(r.tour) - lenOf(loop)) < 0.01);
    // genau an einem Zwischenziel: wie Drehen
    assert.deepEqual(reanchorLoop(loop, corner[2])!.tour.wegpunkte, rotateLoop(loop, 2)!.wegpunkte);
    // am alten Start: nichts zu tun
    assert.equal(reanchorLoop(loop, corner[0])!.tour, loop);
  });

  it('findet beim Umsortieren die Etappen in der Mitte wieder', () => {
    const [s, a, b, c] = corner;
    const prof = ['kurvig', 'kurvig', 'kurvig'] as const;
    const open: PlannedTour = { ...loop, wegpunkte: [s, a, b, c], linie: [{ c: 'ok', p: line.slice(0, 31) }], warnungen: [], namen: undefined };
    // erster Punkt ans Ende: A nach B nach C bleibt, nur C nach S ist neu
    const r = runFor(open, [...prof], [a, b, c, s], [...prof])!;
    assert.ok(r);
    assert.deepEqual(r.kept.wegpunkte, [a, b, c]);
    assert.equal(r.before, null);
    assert.deepEqual(r.after?.points, [c, s]);
    // nichts geändert: kein Teilstück
    assert.equal(runFor(open, [...prof], [s, a, b, c], [...prof]), null);
  });
});

describe('route-change (feste Teile bleiben fest, Koray 19.11.)', async () => {
  const { changedLegs, legSpans, withoutSpans, arrowsWithKm } = await import('../route-change');
  const S: LatLon = [46.0, 11.0];
  const A: LatLon = [46.0, 11.1];
  const B: LatLon = [46.1, 11.1];
  const C: LatLon = [46.1, 11.0];
  const N: LatLon = [46.05, 11.15];
  const line = (pts: LatLon[]) => {
    const out: LatLon[] = [];
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 10; k++) out.push([pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * k) / 10, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * k) / 10]);
    out.push(pts[pts.length - 1]);
    return out;
  };
  const tour = (pts: LatLon[]): Tour => ({ name: 't', laenge_km: 0, wegpunkte: pts, linie: [{ c: 'ok', p: line(pts) }], warnungen: [] });
  it('Einfügen: nur die geteilte Etappe ändert sich', () => {
    const r = changedLegs([S, A, B, C, S], [S, A, N, B, C, S]);
    assert.deepEqual(r.oldChanged, [false, true, false, false]);
    assert.deepEqual(r.newChanged, [false, true, true, false, false]);
  });
  it('Bereich der Etappe auf der Linie, Rest bleibt gezeichnet', () => {
    const t = tour([S, A, B, C, S]);
    const spans = legSpans(t, [false, true, false, false]);
    assert.ok(spans && spans.length === 1);
    const total = flatten(t)[flatten(t).length - 1].km;
    const kept = withoutSpans(t.linie, spans!);
    const keptKm = kept.reduce((s, r) => s + r.p.slice(1).reduce((x, p, i) => x + haversine(r.p[i], p) / 1000, 0), 0);
    assert.ok(Math.abs(keptKm + (spans![0][1] - spans![0][0]) - total) < 0.05, `${keptKm} + Bereich = ${total}`);
    assert.equal(kept.length, 2);
  });
  it('Pfeile liegen in Fahrtrichtung und aufsteigend', () => {
    const a = arrowsWithKm(flatten(tour([S, A, B])), 2);
    assert.ok(a.length > 3);
    assert.ok(a.every((x, i) => i === 0 || x.km > a[i - 1].km));
    // erstes Stück nach Osten: etwa 90 Grad
    assert.ok(Math.abs(a[0].deg - 90) < 5, String(a[0].deg));
  });
});

describe('weather-pick (Koray 20.11.: weniger Wetter auf der Karte)', async () => {
  const { pickWeather, weatherNote } = await import('../weather-pick');
  const c = (id: string, km: number, extra: Partial<{ reason: string | null; tier: 'ikone' | 'bekannt' | 'mittel'; ele: number; symbol: string; temp: number }> = {}) => ({
    id, name: id, km, ele: 1000, tier: 'mittel' as const, symbol: 'cloud', temp: 5, reason: null, ...extra,
  });
  it('Warnung zuerst, dann 25 km Abstand', () => {
    const got = pickWeather([c('a', 10), c('b', 20, { reason: 'Glätte möglich' }), c('c', 30), c('d', 60, { symbol: 'sun' })]);
    assert.deepEqual(got.map((x) => x.id), ['b', 'd']);
  });
  it('gleiches Wetter in der Nähe entfällt, höchstens fünf', () => {
    const got = pickWeather([c('a', 0), c('b', 40), c('c', 200, { symbol: 'sun' }), ...[300, 330, 360, 390, 420].map((k, i) => c(`x${i}`, k, { symbol: `s${i}` }))]);
    assert.ok(!got.some((x) => x.id === 'b') || !got.some((x) => x.id === 'a'));
    assert.ok(got.length <= 5);
  });
  it('Zeile fürs Blatt', () => {
    const tr = (s: string, v?: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v?.[k] ?? '');
    assert.equal(weatherNote([c('Grand Ballon', 50, { reason: 'Glätte möglich' }), c('Hohneck', 20, { reason: 'Glätte möglich' }), c('x', 70)], tr), 'Glätte möglich am Hohneck und am Grand Ballon');
    assert.equal(weatherNote([c('x', 70)], tr), null);
  });
});
