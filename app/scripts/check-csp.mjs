// Prüft nach dem Web Export, ob jedes eingebettete Skript in dist/ per Hash in der CSP von public/.htaccess steht
// (Sicherheitskonzept 17.11.). Sonst bliebe die Seite im Browser leer. Aufruf: npm run check-csp [dist]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const csp = readFileSync('public/.htaccess', 'utf8').match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? '';
const allowed = new Set(csp.match(/'sha256-[^']+'/g)?.map((h) => h.slice(1, -1)) ?? []);
const missing = new Map();
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) walk(f);
    else if (f.endsWith('.html'))
      for (const m of readFileSync(f, 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
        const h = 'sha256-' + createHash('sha256').update(m[1]).digest('base64');
        if (!allowed.has(h)) missing.set(h, f);
      }
  }
};
walk(dist);
if (missing.size) {
  for (const [h, f] of missing) console.error(`fehlt in der CSP: '${h}' (zum Beispiel ${f})`);
  process.exit(1);
}
console.log(`CSP passt: ${allowed.size} erlaubte eingebettete Skripte`);
