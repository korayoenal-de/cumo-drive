/** QS Korpus: echte Touren über die App Planung (eigener Server, sonst Valhalla). Ergebnis: qa/corpus.json */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { planLegs } from '../src/lib/plan';
import { DEFAULT_AVOID } from '../src/lib/valhalla';
import { PASSES } from '../src/lib/passes';
import type { LatLon, Profile } from '../src/lib/tour';

const P = (name: string): LatLon => {
  const p = PASSES.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? PASSES.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
  if (!p) throw new Error('Pass fehlt: ' + name);
  return [p.lat, p.lon];
};
type Def = { name: string; pts: (LatLon | string)[]; prof?: Profile[] };
const defs: Def[] = [
  { name: 'Sellaronda', pts: [[46.5552, 11.7592], 'Sellajoch', 'Pordoijoch', 'Campolongopass', 'Grödner Joch', [46.5552, 11.7592]] },
  { name: 'Sellaronda andersrum', pts: [[46.5552, 11.7592], 'Grödner Joch', 'Campolongopass', 'Pordoijoch', 'Sellajoch', [46.5552, 11.7592]] },
  { name: 'Stilfser und Umbrail', pts: [[46.6167, 10.5917], 'Stilfser Joch', 'Umbrail', [46.6178, 10.4290]] },
  { name: 'Jaufen Timmelsjoch', pts: [[46.8936, 11.4306], 'Jaufenpass', [46.7653, 11.2370], 'Timmelsjoch', [47.0167, 11.0000]] },
  { name: 'Grimsel Furka Susten', pts: [[46.7275, 8.2297], 'Grimselpass', 'Furkapass', 'Sustenpass', [46.7275, 8.2297]] },
  { name: 'Gotthard Nufenen', pts: [[46.6370, 8.5940], 'Gotthardpass', [46.5269, 8.6070], 'Nufenenpass', [46.4886, 8.3850]] },
  { name: 'Galibier Iseran', pts: [[45.2780, 6.3460], 'Col du Télégraphe', 'Col du Galibier', [45.0440, 6.4060]] },
  { name: 'Vrsic', pts: [[46.4900, 13.7850], 'Vršič', [46.3350, 13.5530]] },
  { name: 'Grossglockner', pts: [[47.2860, 12.8170], 'Hochtor', [47.0420, 12.8430]] },
  { name: 'Silvretta', pts: [[46.9680, 10.0800], 'Bielerhöhe', [46.9790, 10.2560]] },
  { name: 'Schwarzwald', pts: [[48.7600, 8.2400], [48.5500, 8.2000], [48.4600, 8.1100], [47.9900, 8.0800]] },
  { name: 'Anfahrt schnell dann kurvig', pts: [[48.1370, 11.5750], [47.4920, 11.0960], [47.2370, 10.7390]], prof: ['schnell' as Profile, 'paesse' as Profile] },
  { name: 'Würzjoch Furkel', pts: [[46.7160, 11.6570], 'Würzjoch', [46.6900, 11.9300]] },
  { name: 'Penser Joch', pts: [[46.4980, 11.3540], 'Penser Joch', [46.8930, 11.4300]] },
  { name: 'Mendel Gampen', pts: [[46.4600, 11.2200], 'Mendelpass', [46.4000, 11.0600], 'Gampen', [46.6700, 11.1600]] },
  { name: 'Kurz 5 km', pts: [[46.5552, 11.7592], [46.5400, 11.7900]] },
  { name: 'Viele Zwischenziele', pts: [[46.4980, 11.3540], [46.55, 11.40], [46.60, 11.45], [46.64, 11.55], [46.62, 11.65], [46.58, 11.70], [46.55, 11.75], [46.5552, 11.7592], [46.52, 11.80], [46.50, 11.85], [46.48, 11.90], [46.53, 11.95], [46.57, 11.90]] },
];
async function main() {
  const out: Record<string, unknown> = existsSync('qa/corpus.json') ? JSON.parse(readFileSync('qa/corpus.json', 'utf8')) : {};
  for (const d of defs) {
    if (out[d.name]) continue;
    const pts = d.pts.map((x) => (typeof x === 'string' ? P(x) : x));
    const prof = d.prof ? [...d.prof, ...Array(pts.length).fill(d.prof[d.prof.length - 1])].slice(0, pts.length - 1) : Array(pts.length - 1).fill('kurvig');
    const t0 = Date.now();
    try {
      const t = await planLegs(d.name, pts, prof, DEFAULT_AVOID);
      out[d.name] = { ...t, _profiles: prof, _ms: Date.now() - t0 };
      console.log('ok', d.name, t.laenge_km, 'km', Date.now() - t0, 'ms');
    } catch (e) {
      console.log('FEHLER', d.name, (e as Error).message);
    }
    writeFileSync('qa/corpus.json', JSON.stringify(out));
  }
}
void main();
