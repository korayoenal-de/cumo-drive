// Sprachen (Koray 16.11.): deutscher Text ist Schlüssel und Rückfall, beide Wörterbücher passen zusammen.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import en from '../../i18n/en.json';
import it from '../../i18n/it.json';
import { _setLangForTest, deviceLang, t } from '../../i18n';
import { legalDoc } from '../../content/legal';
import { strecke, tagKurz } from '../format';
import { englishPassName } from '../passes';
import { closureNameT, reasonT } from '../warning-dedupe';

test('Gerätesprache', () => {
  assert.equal(deviceLang('de-AT'), 'de');
  assert.equal(deviceLang('it-CH'), 'it');
  assert.equal(deviceLang('fr-FR'), 'en');
});

test('Übersetzen mit Rückfall und Platzhaltern', () => {
  _setLangForTest('en');
  assert.equal(t('Losfahren'), 'Start driving');
  assert.equal(t('Noch nicht übersetzt'), 'Noch nicht übersetzt');
  assert.equal(t('Gruppenfahrt, {n} Fahrer', { n: 4 }), 'Group drive, 4 drivers');
  _setLangForTest('de');
  assert.equal(t('Gruppenfahrt, {n} Fahrer', { n: 4 }), 'Gruppenfahrt, 4 Fahrer');
});

test('Wörterbücher: gleiche Schlüssel, gleiche Platzhalter, keine Gedankenstriche', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  assert.deepEqual(Object.keys(en).sort(), Object.keys(it).sort());
  for (const [de, s] of [...Object.entries(en), ...Object.entries(it)]) {
    assert.equal(ph(s), ph(de), `Platzhalter in ${de}`);
    assert.ok(!/[–—]| - /.test(s), `Strich in ${s}`);
  }
});

test('Anzeige in der App Sprache: Warnungen, Daten, Rechtstexte', () => {
  _setLangForTest('en');
  // Warnungen bleiben deutsch gespeichert und werden erst bei der Anzeige übersetzt
  assert.equal(reasonT('Gesperrt laut Verkehrsmeldung'), 'Closed according to traffic reports');
  assert.equal(reasonT('2,5 m breit, Gegenverkehr wird eng'), '2,5 m wide, tight with oncoming traffic');
  assert.equal(reasonT('als Fußweg eingetragen'), 'mapped as footpath');
  assert.equal(closureNameT('Gesperrt: SS48 zwischen Arabba und Canazei'), 'Closed: SS48 between Arabba and Canazei');
  assert.equal(tagKurz(new Date(2026, 10, 20, 10), new Date(2026, 10, 16)), 'Fri 20 Nov');
  assert.equal(strecke(2.5), '2.5 km');
  assert.equal(legalDoc('agb', 'en').title, 'Terms');
  assert.equal(englishPassName('Stilfser Joch', 'Passo dello Stelvio'), 'Stelvio Pass');
  assert.equal(englishPassName('Grimselpass'), 'Grimsel Pass');
  assert.equal(englishPassName("Passo d'Eira", "Passo d'Eira"), 'Eira Pass');
  assert.equal(englishPassName('Col du Galibier'), 'Col du Galibier');
  _setLangForTest('it');
  assert.equal(tagKurz(new Date(2026, 10, 20, 10), new Date(2026, 10, 16)), 'ven 20 nov');
  assert.equal(legalDoc('datenschutz', 'it').title, 'Privacy');
  _setLangForTest('de');
  assert.equal(reasonT('Gesperrt laut Verkehrsmeldung'), 'Gesperrt laut Verkehrsmeldung');
  assert.equal(tagKurz(new Date(2026, 10, 20, 10), new Date(2026, 10, 16)), 'Fr 20. Nov.');
  assert.equal(strecke(2.5), '2,5 km');
});
