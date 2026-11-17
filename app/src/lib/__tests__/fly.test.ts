// Aktionen mit Ziel (Koray 17.11.): gelandete Flüge setzen die Plakette am Tab, Öffnen des Tabs nimmt sie weg.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TAB_X, flyTo, freshOf, landed, seenTab } from '../fly';
import { hitKm, kmToLine } from '../map-hit';

test('Flug landet im Tab und zählt die Plakette hoch, Öffnen setzt sie zurück', () => {
  flyTo({ from: { x: 100, y: 500, size: 56 }, target: 'touren', icon: { tab: 'touren' }, bg: '#000', fg: '#fff' });
  flyTo({ from: { x: 100, y: 500, size: 56 }, target: { x: 40, y: 300 }, icon: { sf: 'mountain.2.fill' }, bg: '#000', fg: '#fff' });
  landed(1);
  landed(2);
  assert.equal(freshOf('touren'), 1);
  assert.equal(freshOf('community'), 0);
  seenTab('touren');
  assert.equal(freshOf('touren'), 0);
});

test('Tab Lage: Planen links von Touren links von Community, alle auf dem Bildschirm', () => {
  assert.ok(TAB_X.planen < TAB_X.touren && TAB_X.touren < TAB_X.community);
  for (const v of Object.values(TAB_X)) assert.ok(v > 0 && v < 1);
});

test('Überlagernde Touren: Abstand zur Linie und Fangradius', () => {
  const line: [number, number][] = [[47.0, 11.0], [47.0, 11.1]];
  // 1 km nördlich der Mitte
  const d = kmToLine(line, [47.009, 11.05]);
  assert.ok(Math.abs(d - 1) < 0.05, String(d));
  // hinter dem Ende zählt der Endpunkt
  assert.ok(kmToLine(line, [47.0, 11.2]) > 7);
  // 0,5 Grad auf 393 pt: 34 pt sind gut 3 km
  const r = hitKm({ latitude: 47, longitude: 11, latitudeDelta: 0.4, longitudeDelta: 0.5 }, 393);
  assert.ok(r > 2.5 && r < 3.5, String(r));
});
