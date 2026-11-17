// Landingpage auf Englisch und Italienisch (Koray 17.11.): jeder deutsche Text braucht eine Übersetzung
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landingHtml, landingTexts } from '../../components/landing/landing-html';
import { LANDING_KEYS, LANDING_SAME } from '../../components/landing/landing-i18n';

test('Landingpage: jeder Text übersetzt', () => {
  const missing = landingTexts().filter((t) => !LANDING_KEYS.has(t) && !LANDING_SAME.has(t));
  assert.deepEqual(missing, []);
});

test('Landingpage: englisch und italienisch ohne Gedankenstriche, Struktur gleich', () => {
  const de = landingHtml('de');
  for (const lang of ['en', 'it'] as const) {
    const html = landingHtml(lang);
    assert.equal((html.match(/</g) ?? []).length, (de.match(/</g) ?? []).length, `${lang}: andere Zahl an Tags`);
    const text = html.replace(/<[^>]*>/g, ' ');
    assert.ok(!/[–—]/.test(text), `${lang}: Gedankenstrich im Text`);
    assert.ok(!/ - /.test(text), `${lang}: Bindestrich als Satzzeichen`);
  }
  assert.ok(landingHtml('en').includes('Curves, not kilometres.'));
  assert.ok(landingHtml('it').includes('Curve, non chilometri.'));
});
