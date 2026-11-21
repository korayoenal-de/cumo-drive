/**
 * Runden der Passseiten in die Community (Koray 21.11.2026: „können unter meinem Namen veröffentlicht werden“).
 *
 * Liest die Ausgabe von pass-tours.ts, plant jede Runde ab Fahrspaß 80 aus Start, Passhöhe und Wendepunkt noch einmal
 * voll (mit Etappen Check), prüft Länge und doppelte Stücke und schreibt eine Migration, die sie unter Korays Konto
 * veröffentlicht. Nicht in seiner Bibliothek (in_library false), damit Meine Touren nicht vollläuft; schon vorhandene
 * Namen werden übersprungen.
 *
 * Aufruf (braucht ROUTING_QA_KEY): npx tsx --tsconfig scripts/replay/tsconfig.json scripts/pass-community.ts runden.json migration.sql
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { cumoPlan } from '../src/lib/cumo-routing';
import { doubledStretch } from '../src/lib/doubled';
import { tourFun } from '../src/lib/fun-score';
import { countCurves } from '../src/lib/stats';
import { PASSES } from '../src/lib/passes';
import { photonFetch } from '../src/lib/photon';
import { packTour } from '../src/lib/tour-pack';
import { flatten, haversine, type LatLon } from '../src/lib/tour';
import { DEFAULT_AVOID } from '../src/lib/valhalla';

const KORAY = '5e981c05-a751-44b3-8506-7595e5f5d299';
const MIN_FUN = 80;

type Out = { name: string; km: number; minutes: number; fun: number; open: { start: LatLon; via: LatLon[] } };
const input = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Record<string, { name: string; tours: Out[] }>;
const outFile = process.argv[3] ?? 'pass-community.sql';

/** Namen der Wegpunkte, sonst zeigt der Planer beim Öffnen nur Koordinaten: Pass, wenn einer dort liegt, sonst der Ort */
async function pointName(p: LatLon): Promise<string> {
  const pass = PASSES.find((x) => haversine(p, [x.lat, x.lon]) < 400);
  if (pass) return pass.name.replace(/\s*\(.*\)\s*/, '');
  try {
    const at = async (lang: string) => {
      const r = await photonFetch(`/reverse?lat=${p[0]}&lon=${p[1]}&lang=${lang}`);
      const pr = ((await r.json()) as { features: { properties: Record<string, string> }[] }).features[0]?.properties ?? {};
      return pr.city ?? pr.name ?? pr.district ?? '';
    };
    const d = await at('default');
    return (d.includes(' - ') ? await at('de') : d).replace(/\s[A-Z]{2}$/, '');
  } catch {
    return '';
  }
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

(async () => {
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const pass of Object.values(input)) {
    for (const t of pass.tours) {
      if (t.fun < MIN_FUN || seen.has(t.name)) continue;
      seen.add(t.name);
      const pts: LatLon[] = [t.open.start, ...t.open.via, t.open.start];
      const tour = await cumoPlan(t.name, pts, 'kurvig', DEFAULT_AVOID, undefined, [], false);
      const line = flatten(tour).map((x) => x.p);
      const doubled = doubledStretch(line).km;
      const fun = tourFun(line)?.score ?? 0;
      const ok = Math.abs(tour.laenge_km - t.km) <= t.km * 0.08 && doubled <= tour.laenge_km * 0.08 && fun >= MIN_FUN;
      console.log(`${ok ? 'ok  ' : 'raus'} ${t.name}: ${tour.laenge_km.toFixed(0)} km (vorher ${t.km}), doppelt ${doubled.toFixed(1)} km, Fahrspaß ${fun}`);
      if (!ok) continue;
      const curves = countCurves(line);
      const start = t.name.match(/^Runde ab (.+?) über/)?.[1] ?? '';
      const namen = [start, ...(await Promise.all(t.open.via.map(pointName))), start];
      const over = t.name.replace(/^Runde ab .+? über /, '');
      const description = `Runde über ${over}, Start und Ziel in ${start}.`;
      const data = JSON.stringify(packTour({ ...tour, namen, minutes: tour.minutes }, 'kurvig', DEFAULT_AVOID));
      rows.push(
        `  if not exists (select 1 from public.tours where owner = koray and name = ${q(t.name)}) then
    insert into public.tours (owner, name, folder, profile, km, minutes, curves, data, published, published_at, author, description, in_library)
    values (koray, ${q(t.name)}, 'Pässe', 'kurvig', ${tour.laenge_km.toFixed(1)}, ${Math.round(tour.minutes)}, ${curves}, ${q(data)}::jsonb, true, now(), 'Koray', ${q(description)}, false);
  end if;`,
      );
    }
  }
  const sql = `-- Runden der Passseiten in der Community unter Koray (Koray 21.11.2026), erzeugt mit scripts/pass-community.ts.
-- Nur echte Rundtouren (höchstens 8 % doppelt gefahren) ab Fahrspaß ${MIN_FUN}. Nicht in seiner Bibliothek.
do $$
declare
  koray uuid := '${KORAY}';
begin
  if not exists (select 1 from auth.users where id = koray) then
    raise notice 'Konto von Koray nicht gefunden, nichts geändert';
    return;
  end if;
${rows.join('\n')}
end $$;
`;
  writeFileSync(outFile, sql);
  console.log(`${rows.length} Runden, ${(sql.length / 1024).toFixed(0)} KB`);
})();
