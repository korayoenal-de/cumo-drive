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
