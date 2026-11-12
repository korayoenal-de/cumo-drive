/**
 * Fahrt nachspielen (Koray 12.11.): Blackbox einer Fahrt oder einer Meldung durch Einrasten, Fortschritt und
 * Ansagen der App laufen lassen, ohne Auto. Zeigt, was die App damals gesagt hat und was sie heute sagen würde.
 * So wird jeder gemeldete Fehler ein Test: Stelle nachspielen, Code ändern, wieder nachspielen.
 *
 * Aufruf im Ordner app:
 *   npx tsx --tsconfig scripts/replay/tsconfig.json scripts/replay/replay.ts fahrt.json [von_s] [bis_s]
 * fahrt.json: drives.nav_log, nav_reports.log oder eine ganze Zeile aus nav_reports (mit log und context).
 */
import { readFileSync } from 'fs';

import { decodeLine } from '../../src/lib/navigation/blackbox';
import { progress, snapToRoute } from '../../src/lib/navigation/tracker';
import type { Maneuver, NavRoute } from '../../src/lib/navigation/types';
import { createVoiceGuide } from '../../src/lib/navigation/voice';
import { haversine } from '../../src/lib/tour';

type Entry = [number, string, any];
const file = process.argv[2];
if (!file) {
  console.log('Aufruf: npx tsx --tsconfig scripts/replay/tsconfig.json scripts/replay/replay.ts fahrt.json [von_s] [bis_s]');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(file, 'utf8'));
const log = raw.entries ? raw : raw.log ?? raw.nav_log;
const entries: Entry[] = log.entries;
const from = Number(process.argv[3] ?? -Infinity);
const to = Number(process.argv[4] ?? Infinity);
if (raw.context) console.log('Meldung:', JSON.stringify(raw.context));

const toMan = (x: any[]): Maneuver => ({ km: x[0], kind: x[1], text: x[2], speech: x[3], ...(x[4] != null ? { exit: x[4] } : {}), index: x[5] ?? 0 });

function buildRoute(d: any): NavRoute {
  const shape = decodeLine(d.line);
  const cumKm = [0];
  for (let i = 1; i < shape.length; i++) cumKm.push(cumKm[i - 1] + haversine(shape[i - 1], shape[i]) / 1000);
  // Manöver an den neu gerechneten km ausrichten (die Linie ist auf 1 m gerundet)
  const maneuvers = (d.man as any[]).map(toMan).map((m) => ({ ...m, index: Math.min(m.index, shape.length - 1), km: cumKm[Math.min(m.index, shape.length - 1)] ?? m.km }));
  return { shape, cumKm, maneuvers, km: cumKm[cumKm.length - 1], minutes: d.minutes ?? 0, source: d.source ?? 'valhalla', ...(d.rejoin != null ? { rejoinIndex: d.rejoin } : {}) };
}

let route: NavRoute | null = null;
let hint = -1;
let lastNext = -1;
let lastFix: { t: number; kmh: number | null } | null = null;
const said: { t: number; text: string }[] = [];
let now = 0;
const voice = createVoiceGuide((text) => said.push({ t: now, text }), () => {});
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(3, ' ')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const lines: { t: number; app: string; neu: string }[] = [];

for (const [t, kind, d] of entries) {
  now = t;
  const show = t >= from && t <= to;
  if (kind === 'route' && d?.line) {
    route = buildRoute(d);
    hint = -1;
    lastNext = -1;
    voice.reset();
    if (show) lines.push({ t, app: `ROUTE ${d.km} km, ${d.man.length} Manöver`, neu: '' });
  } else if (kind === 'enrich' && route && Array.isArray(d)) {
    for (const x of d) {
      if (!Array.isArray(x)) continue;
      const m = toMan(x);
      const i = route.maneuvers.findIndex((y) => y.index === m.index);
      if (i >= 0) route.maneuvers[i] = { ...m, km: route.maneuvers[i].km };
      else route.maneuvers = [...route.maneuvers, { ...m, km: route.cumKm[Math.min(m.index, route.cumKm.length - 1)] }].sort((a, b) => a.km - b.km);
      if (show) lines.push({ t, app: `ERGÄNZT ${m.text}`, neu: '' });
    }
  } else if (kind === 'say') {
    if (show) lines.push({ t, app: String(d), neu: '' });
  } else if (kind === 'gps' && route) {
    const [lat, lon, kmh, hdg, , , , virt] = d;
    const dt = lastFix ? t - lastFix.t : 0;
    const maxAheadM = lastFix && dt > 0 && dt < 30 ? (Math.max(kmh ?? 0, lastFix.kmh ?? 0, 30) / 3.6) * dt * 1.6 + 60 : undefined;
    const snap = snapToRoute(route, [lat, lon], hint, (kmh ?? 0) >= 12 ? hdg : null, maxAheadM);
    hint = snap.index;
    lastFix = { t, kmh };
    const pr = progress(route, snap.km);
    if (pr.next !== lastNext) {
      lastNext = pr.next;
      if (show) lines.push({ t, app: '', neu: `nächstes: ${route.maneuvers[pr.next]?.text ?? 'Ziel'}` });
    }
    const before = said.length;
    voice.update(route, pr.next, pr.distToNextM, kmh);
    if (show) for (const s of said.slice(before)) lines.push({ t, app: '', neu: `SAGT: ${s.text}` });
    if (show && snap.offM > 60) lines.push({ t, app: '', neu: `abseits ${Math.round(snap.offM)} m${virt ? ' (Tunnel)' : ''}` });
  } else if (show && kind !== 'gps') {
    lines.push({ t, app: `${kind.toUpperCase()} ${typeof d === 'string' ? d : JSON.stringify(d).slice(0, 140)}`, neu: '' });
  }
}

lines.sort((a, b) => a.t - b.t);
console.log(`Zeit     | damals (Blackbox)                                   | heute (nachgespielt)`);
for (const l of lines) console.log(`${fmt(l.t)}   | ${l.app.slice(0, 52).padEnd(52)}| ${l.neu}`);
const appSaid = entries.filter((e) => e[1] === 'say').length;
console.log(`\nAnsagen damals ${appSaid}, heute ${said.length} (Positionen sind alle 3 s gespeichert, einzelne Stufen können daher fehlen)`);
