/** QS: Invarianten über den Korpus (qa/corpus.json). Druckt Befunde, Exit 1 bei Fehlern. */
import { readFileSync } from 'node:fs';
import { findHighlights } from '../src/lib/navigation/highlights';
import { cumulativeKm } from '../src/lib/navigation/route';
import { sharpCurves, curveCue } from '../src/lib/navigation/curves';
import { snapToRoute, progress, pointAtKm } from '../src/lib/navigation/tracker';
import type { NavRoute } from '../src/lib/navigation/types';
import { encodeTour, decodeTour, supportPoints, extractCode, shareUrl } from '../src/lib/share-code';
import { flatten, haversine, reverseTour, toGpx, toKml, parseRouteFile, type LatLon, type Tour } from '../src/lib/tour';
import { packTour, unpackTour } from '../src/lib/tour-pack';
import { doubledStretch } from '../src/lib/doubled';
import { PASSES, passesAlong } from '../src/lib/passes';
import { routePasses } from '../src/lib/route-edit';
import { countCurves } from '../src/lib/stats';

const corpus: Record<string, Tour & { minutes: number; _profiles: string[] }> = JSON.parse(readFileSync('qa/corpus.json', 'utf8'));
const expect: Record<string, string[]> = {
  Sellaronda: ['Sellajoch', 'Pordoijoch', 'Campolongopass', 'Grödner Joch'],
  'Sellaronda andersrum': ['Grödner Joch', 'Campolongopass', 'Pordoijoch', 'Sellajoch'],
  'Stilfser und Umbrail': ['Stilfser Joch'],
  'Jaufen Timmelsjoch': ['Jaufenpass', 'Timmelsjoch'],
  'Grimsel Furka Susten': ['Grimselpass', 'Furkapass', 'Sustenpass'],
  'Gotthard Nufenen': ['Gotthardpass', 'Nufenenpass'],
  Vrsic: ['Vršič'],
  'Würzjoch Furkel': ['Würzjoch'],
  'Penser Joch': ['Penser Joch'],
  'Mendel Gampen': ['Mendelpass', 'Gampenpass'],
};
let fails = 0;
const bad = (tour: string, area: string, msg: string) => {
  fails++;
  console.log(`FEHLER  ${tour}  [${area}]  ${msg}`);
};
const note = (tour: string, area: string, msg: string) => console.log(`hinweis ${tour}  [${area}]  ${msg}`);
const rand = (() => { let s = +(process.env.QA_SEED || 7); return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const offset = (p: LatLon, m: number): LatLon => [p[0] + (gauss() * m) / 111320, p[1] + (gauss() * m) / (111320 * Math.cos((p[0] * Math.PI) / 180))];

for (const [name, t] of Object.entries(corpus)) {
  const line = flatten(t).map((x) => x.p);
  const cum = cumulativeKm(line);
  const total = cum[cum.length - 1];
  // Länge stimmt mit laenge_km
  if (Math.abs(total - t.laenge_km) / Math.max(1, t.laenge_km) > 0.03) bad(name, 'länge', `Linie ${total.toFixed(1)} km gegen laenge_km ${t.laenge_km}`);
  // Umweg: Länge gegen Luftlinie über alle Wegpunkte
  let air = 0;
  for (let i = 1; i < t.wegpunkte.length; i++) air += haversine(t.wegpunkte[i - 1], t.wegpunkte[i]) / 1000;
  if (total > air * 2.6 && total - air > 25) note(name, 'umweg', `${total.toFixed(0)} km bei ${air.toFixed(0)} km Luftlinie`);
  // Linie geht durch die Wegpunkte
  for (const [i, w] of t.wegpunkte.entries()) {
    let d = Infinity;
    for (const p of line) d = Math.min(d, haversine(p, w));
    if (d > 2000) bad(name, 'wegpunkte', `Wegpunkt ${i} liegt ${(d / 1000).toFixed(1)} km neben der Linie`);
  }

  // Highlights
  const hl = findHighlights(line, cum, null);
  const ids = new Set<string>();
  for (const h of hl) {
    if (ids.has(h.id)) bad(name, 'highlights', `doppelt ${h.name}`);
    ids.add(h.id);
    if (!(h.startKm >= 0 && h.endKm <= total + 0.01 && h.startKm <= h.endKm)) bad(name, 'highlights', `Grenzen ${h.name} ${h.startKm}-${h.endKm} bei ${total}`);
    if (h.kind === 'pass' && !(h.topKm >= h.startKm - 0.01 && h.topKm <= h.endKm + 0.01)) bad(name, 'highlights', `Passhöhe ausserhalb ${h.name}`);
    if (h.endKm - h.startKm > 40) note(name, 'highlights', `sehr langer Abschnitt ${h.name} ${(h.endKm - h.startKm).toFixed(0)} km`);
  }
  const ps = hl.filter((h) => h.kind === 'pass').sort((a, b) => a.startKm - b.startKm);
  for (let i = 1; i < ps.length; i++) if (ps[i].startKm < ps[i - 1].endKm - 0.05) bad(name, 'highlights', `Überlappung ${ps[i - 1].name} und ${ps[i].name}`);
  for (const want of expect[name] ?? []) {
    const p = PASSES.find((x) => x.name.includes(want));
    const shown = hl.some((h) => h.name.includes(want) || (p && h.kind !== 'pass' && passesAlong([p], line).some((a) => a.km >= h.startKm && a.km <= h.endKm)));
    const onLine = p && passesAlong([p], line).length > 0;
    if (!onLine) bad(name, 'route', `${want} liegt nicht auf der geplanten Linie`);
    else if (!shown) bad(name, 'highlights', `${want} fehlt (gefunden: ${hl.map((h) => h.name).join(', ')})`);
  }
  // Passvorschläge
  try { routePasses(PASSES, line); } catch (e) { bad(name, 'passvorschläge', (e as Error).message); }

  // Kurven und Bremshinweis
  const curves = sharpCurves(line);
  for (let i = 1; i < curves.length; i++) if (curves[i].apexKm < curves[i - 1].apexKm) { bad(name, 'kurven', 'nicht sortiert'); break; }
  for (let km = 0; km <= total; km += 0.02) {
    const c = curveCue(curves, km);
    if (c && /NaN|undefined|-\d/.test(JSON.stringify(c))) { bad(name, 'bremshinweis', `km ${km.toFixed(2)} ${JSON.stringify(c)}`); break; }
  }
  const nCurves = countCurves(line);
  if (!Number.isFinite(nCurves)) bad(name, 'kurven', 'countCurves');

  // Teilen: Code und Link
  const code = encodeTour(t, 'kurvig');
  const back = decodeTour(extractCode(shareUrl(code)));
  if (!back) bad(name, 'teilen', 'Code nicht lesbar');
  else {
    if (back.name !== t.name) bad(name, 'teilen', `Name ${back.name}`);
    const sp = supportPoints(t);
    if (back.points.length !== sp.length) bad(name, 'teilen', `Punkte ${back.points.length} statt ${sp.length}`);
    if (haversine(back.points[0], line[0]) > 30 || haversine(back.points[back.points.length - 1], line[line.length - 1]) > 30) bad(name, 'teilen', 'Start oder Ziel verschoben');
    if (back.points.length > 27) bad(name, 'teilen', `zu viele Punkte ${back.points.length}`);
  }
  // Konto Speicherformat (packTour) mit Namen und Etappen
  const withNames = { ...t, namen: t.wegpunkte.map((_, i) => `P${i}`), etappen: t._profiles } as Tour;
  const un = unpackTour(JSON.parse(JSON.stringify(packTour(withNames, 'kurvig'))));
  if (JSON.stringify(un.tour.namen) !== JSON.stringify(withNames.namen)) bad(name, 'konto', 'Namen gehen verloren');
  if (JSON.stringify(un.tour.etappen) !== JSON.stringify(withNames.etappen)) bad(name, 'konto', 'Etappen gehen verloren');
  const unLen = flatten(un.tour).at(-1)!.km;
  if (Math.abs(unLen - total) > 0.05) bad(name, 'konto', `Länge nach Speichern ${unLen.toFixed(2)} statt ${total.toFixed(2)}`);
  // GPX und KML
  for (const [fmt, text] of [['gpx', toGpx(t)], ['kml', toKml(t)]] as const) {
    try {
      const r = parseRouteFile(text, `x.${fmt}`);
      const l = flatten(r).at(-1)?.km ?? 0;
      if (Math.abs(l - total) / total > 0.01) bad(name, fmt, `Länge ${l.toFixed(1)} statt ${total.toFixed(1)}`);
      if (r.name !== t.name) bad(name, fmt, `Name ${r.name}`);
    } catch (e) { bad(name, fmt, (e as Error).message); }
  }
  // Umdrehen
  const rr = reverseTour(reverseTour(t));
  if (JSON.stringify(flatten(rr).map((x) => x.p)) !== JSON.stringify(line)) bad(name, 'umdrehen', 'zweimal umdrehen ergibt nicht das Original');
  // doppelte Abschnitte
  try { doubledStretch(line); } catch (e) { bad(name, 'doppelt', (e as Error).message); }

  // Navigation: Fahrt mit GPS Rauschen, Fortschritt muss stetig laufen (Rundtouren, Kreuzungen)
  const route: NavRoute = { shape: line, cumKm: cum, maneuvers: [], km: total, minutes: t.minutes, source: 'valhalla' };
  for (const noise of [8, 15, 25]) {
    let hint = 0, lastKm = 0, worstBack = 0, worstJump = 0, maxOff = 0, run = 0, worstRun = 0;
    for (let km = 0; km <= total; km += 0.025) {
      const at = pointAtKm(route, km);
      const truth = at.point;
      // GPS Kurs mit Rauschen, auf kurzen Shape Stücken schwankt er wie echt
      const s = snapToRoute(route, offset(truth, noise), hint, (at.heading + gauss() * 12 + 360) % 360);
      hint = s.index;
      worstBack = Math.max(worstBack, lastKm - s.km);
      worstJump = Math.max(worstJump, s.km - lastKm);
      if (Math.abs(s.km - km) > +(process.env.QA_TRACE || 99)) console.log('  trace', name, noise, 'wahr', km.toFixed(2), 'snap', s.km.toFixed(2), 'off', s.offM.toFixed(0), 'vorher', lastKm.toFixed(2));
      maxOff = Math.max(maxOff, Math.abs(s.km - km));
      run = Math.abs(s.km - km) > 0.3 ? run + 25 : 0;
      worstRun = Math.max(worstRun, run);
      lastKm = s.km;
      progress(route, s.km);
    }
    if (noise <= 8 ? maxOff > 0.3 || worstRun > 100 : noise <= 15 ? maxOff > 0.5 || worstRun > 200 : maxOff > 1.5 || worstRun > 500) bad(name, `navigation ${noise}m`, `Position weicht bis ${maxOff.toFixed(2)} km ab, längste Fehlstrecke ${worstRun} m`);
    else if (maxOff > 0.3) note(name, `navigation ${noise}m`, `kurze Ausreißer bis ${maxOff.toFixed(2)} km, längste Fehlstrecke ${worstRun} m`);
    if (total - lastKm > 0.3) bad(name, `navigation ${noise}m`, `Ziel nicht erreicht, Ende bei ${lastKm.toFixed(2)} von ${total.toFixed(2)}`);
  }
  console.log(`ok      ${name}: ${total.toFixed(0)} km, ${hl.length} Highlights (${hl.map((h) => h.name.split(' ')[0]).join(', ')}), ${curves.length} Kurven`);
}
console.log(`\n${fails} Fehler`);
process.exit(fails ? 1 : 0);
