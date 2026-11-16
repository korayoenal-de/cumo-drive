// Sprachen (Koray 16.11.): deutscher Text ist Schlüssel und Rückfall, beide Wörterbücher passen zusammen.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import en from '../../i18n/en.json';
import it from '../../i18n/it.json';
import { _setLangForTest, deviceLang, t } from '../../i18n';

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
