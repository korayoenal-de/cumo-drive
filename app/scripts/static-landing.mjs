// Landingpage ohne App Skript (Performance Messung 20.11.2026): Lighthouse mobil 69 Punkte, 1,9 s blockiert, weil
// jede Sprachseite das ganze App Paket lud und aufbaute (2 s Skript, 1,4 s Layout), obwohl die Seite fertiges HTML ist.
// Nach dem Web Export entfernt dieses Skript aus index.html, en.html und it.html alle Skripte und deren preload,
// setzt lang richtig und bindet für en und it nur public/landing/sprache.js ein. Links führen als normale Seiten zu
// Login, Registrieren und Planer, die ihr Skript wie bisher laden. Aufruf nach dem Export: node scripts/static-landing.mjs [dist]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const pages = { 'index.html': 'de', 'en.html': 'en', 'it.html': 'it' };
for (const [file, lang] of Object.entries(pages)) {
  const f = join(dist, file);
  let h = readFileSync(f, 'utf8');
  const before = h.length;
  const scripts = (h.match(/<script\b/g) ?? []).length;
  h = h
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*rel="preload"[^>]*as="script"[^>]*\/?>/g, '')
    .replace(/<html([^>]*)\blang="[a-z]+"/, `<html$1lang="${lang}"`);
  if (lang !== 'de') h = h.replace('</head>', '<script src="/landing/sprache.js" defer></script></head>');
  if (!h.includes('cd-scroll')) throw new Error(`${file}: Inhalt der Landingpage fehlt im HTML`);
  writeFileSync(f, h);
  console.log(`${file}: ${scripts} Skripte entfernt, ${Math.round(before / 1024)} auf ${Math.round(h.length / 1024)} KB`);
}
