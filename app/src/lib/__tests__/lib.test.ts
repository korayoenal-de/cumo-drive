/**
 * Tests für reine Rechenfunktionen ohne Netz und ohne React Native.
 * Starten mit: npm test (Node Test Runner über tsx, keine weitere Bibliothek nötig).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { arrowsAlong, doubledStretch, offsetRight, splitDoubled } from '../doubled';
import { decodeTour, encodeTour, extractCode } from '../share-code';
import { flatten, haversine, type LatLon, type Tour } from '../tour';

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
    assert.equal(sharpCurves(bend(150, 90, false)).length, 0);
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
});
