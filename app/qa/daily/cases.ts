/**
 * Fälle für den täglichen Routen Check (Koray 16.11.). Feste Klassiker prüfen jeden Tag dasselbe (Rückschritte),
 * dazu wechselnde Fälle aus dem Tagesdatum, damit mit der Zeit viele Gegenden und Längen drankommen.
 * Zusammen 50.
 */
import { PASSES } from '../../src/lib/passes';
import type { Direction } from '../../src/lib/roundtrip';
import type { LatLon, Profile } from '../../src/lib/tour';

type Base = {
  id: string;
  name: string;
  /** schnell, paesse, strecke, runde, viele, zufall */
  group: string;
  profile: Profile;
  /** Pässe, die auf der Route liegen müssen (Teil des Namens genügt) */
  expectPasses?: string[];
  /** Mindestanteil der km auf Traumstrecken und Pässen in Prozent */
  minCurated?: number;
  allowCities?: string[];
  allowMotorway?: boolean;
  /** größtes Verhältnis Länge zu Luftlinie, bevor es als Umweg gilt */
  maxDetour?: number;
};
export type Case =
  | (Base & { kind: 'route'; points: LatLon[]; profiles: Profile[] })
  | (Base & { kind: 'runde'; start: LatLon; km: number; direction: Direction; seed: number });

const P = (name: string): LatLon => {
  const p = PASSES.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? PASSES.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
  if (!p) throw new Error(`Pass fehlt: ${name}`);
  return [p.lat, p.lon];
};

const ORTE: Record<string, LatLon> = {
  Frankfurt: [50.1109, 8.6821],
  Stuttgart: [48.7758, 9.1829],
  München: [48.1371, 11.5754],
  Innsbruck: [47.2692, 11.4041],
  Zürich: [47.3769, 8.5417],
  Mailand: [45.4642, 9.19],
  Köln: [50.9375, 6.9603],
  Arabba: [46.4969, 11.8746],
  Cortina: [46.5405, 12.1357],
  Brixen: [46.7154, 11.6563],
  Corvara: [46.5497, 11.8726],
  Bormio: [46.4669, 10.3705],
  'Ponte di Legno': [46.2595, 10.5095],
  Livigno: [46.5386, 10.1357],
  Andermatt: [46.6356, 8.5939],
  Valloire: [45.1652, 6.4296],
  Briançon: [44.8986, 6.6435],
  'Bourg-Saint-Maurice': [45.6188, 6.7687],
  Bonneval: [45.3722, 7.0508],
  Bruck: [47.2853, 12.8186],
  Heiligenblut: [47.0397, 12.8427],
  Sölden: [46.9655, 11.0076],
  Meran: [46.6713, 11.1525],
  Kranjska: [46.4847, 13.7856],
  Bovec: [46.3378, 13.5522],
  'Baden-Baden': [48.7606, 8.2398],
  Freudenstadt: [48.4636, 8.4111],
  Munster: [48.0408, 7.1347],
  Thann: [47.8076, 7.1033],
  Altdorf: [46.8804, 8.6444],
  Linthal: [46.9213, 8.9978],
  Martigny: [46.0986, 7.0729],
  Aosta: [45.7376, 7.3172],
  Bozen: [46.4983, 11.3548],
  Garmisch: [47.4917, 11.0955],
  Freiburg: [47.999, 7.8421],
  Annecy: [45.8992, 6.1294],
  Chur: [46.8508, 9.532],
  Lugano: [46.0037, 8.9511],
  Bensheim: [49.6811, 8.6197],
  Lienz: [46.8297, 12.7697],
  Bad_Tölz: [47.7604, 11.5577],
  Füssen: [47.5696, 10.7004],
  Sankt_Johann: [47.5227, 12.4258],
  Trient: [46.0748, 11.1217],
  Grenoble: [45.1885, 5.7245],
  Kaiserslautern: [49.4447, 7.7689],
  Bad_Kreuznach: [49.8431, 7.8676],
  Bayreuth: [49.9456, 11.5713],
  Spittal: [46.7997, 13.4956],
  Tolmin: [46.1834, 13.7331],
  Bad_Ischl: [47.7115, 13.6237],
};
const O = (n: string) => ORTE[n];

const route = (id: string, name: string, group: string, pts: (LatLon | string)[], profile: Profile, extra: Partial<Base> = {}): Case => {
  const points = pts.map((x) => (typeof x === 'string' ? (ORTE[x] ?? P(x)) : x));
  return { kind: 'route', id, name, group, profile, points, profiles: points.slice(1).map(() => profile), ...extra };
};

/** 30 feste Fälle */
export const FIXED: Case[] = [
  // schnell, Autobahn
  route('s-ffm-stg', 'Frankfurt nach Stuttgart', 'schnell', ['Frankfurt', 'Stuttgart'], 'schnell', { allowMotorway: true }),
  route('s-muc-ibk', 'München nach Innsbruck', 'schnell', ['München', 'Innsbruck'], 'schnell', { allowMotorway: true }),
  route('s-zh-mi', 'Zürich nach Mailand', 'schnell', ['Zürich', 'Mailand'], 'schnell', { allowMotorway: true }),
  route('s-koeln-ffm', 'Köln nach Frankfurt', 'schnell', ['Köln', 'Frankfurt'], 'schnell', { allowMotorway: true }),
  // Pässe, kurz und lang
  route('p-arabba-cortina', 'Arabba nach Cortina', 'paesse', ['Arabba', 'Cortina'], 'kurvig', { expectPasses: ['Falzarego'], minCurated: 40 }),
  route('p-brixen-cortina', 'Brixen nach Cortina', 'paesse', ['Brixen', 'Cortina'], 'kurvig', { minCurated: 25 }),
  route('p-sellaronda', 'Sellaronda', 'paesse', ['Corvara', 'Grödner Joch', 'Sellajoch', 'Pordoijoch', 'Campolongopass', 'Corvara'], 'kurvig', { expectPasses: ['Grödner', 'Sella', 'Pordoi', 'Campolongo'], minCurated: 50 }),
  route('p-fuenf-dolomiten', 'Fünf Pässe Dolomiten', 'viele', ['Corvara', 'Grödner Joch', 'Sellajoch', 'Pordoijoch', 'Falzarego', 'Giau', 'Cortina'], 'kurvig', { expectPasses: ['Grödner', 'Sella', 'Pordoi', 'Falzarego', 'Giau'], minCurated: 50 }),
  route('p-stelvio-gavia', 'Stilfser Joch und Gavia', 'paesse', ['Bormio', 'Stilfser Joch', 'Bormio', 'Gavia', 'Ponte di Legno'], 'kurvig', { expectPasses: ['Stilfser', 'Gavia'], maxDetour: 4 }),
  route('p-livigno', 'Bormio nach Livigno', 'paesse', ['Bormio', 'Livigno'], 'kurvig', { expectPasses: ['Foscagno'] }),
  route('p-gfs', 'Grimsel Furka Susten', 'paesse', ['Andermatt', 'Furkapass', 'Grimselpass', 'Sustenpass', 'Andermatt'], 'kurvig', { expectPasses: ['Furka', 'Grimsel', 'Susten'], minCurated: 50 }),
  route('p-galibier', 'Valloire nach Briançon', 'paesse', ['Valloire', 'Briançon'], 'kurvig', { expectPasses: ['Galibier'] }),
  route('p-iseran', 'Bourg Saint Maurice nach Bonneval', 'paesse', ['Bourg-Saint-Maurice', 'Bonneval'], 'kurvig', { expectPasses: ['Iseran'] }),
  route('p-glockner', 'Großglockner', 'paesse', ['Bruck', 'Heiligenblut'], 'kurvig', { minCurated: 50 }),
  route('p-timmelsjoch', 'Sölden nach Meran', 'paesse', ['Sölden', 'Meran'], 'kurvig', { expectPasses: ['Timmelsjoch'] }),
  route('p-vrsic', 'Vršič', 'paesse', ['Kranjska', 'Bovec'], 'kurvig', { expectPasses: ['Vršič'] }),
  route('p-klausen', 'Klausenpass', 'paesse', ['Altdorf', 'Linthal'], 'kurvig', { expectPasses: ['Klausen'] }),
  route('p-st-bernhard', 'Großer St. Bernhard', 'paesse', ['Martigny', 'Aosta'], 'kurvig', { expectPasses: ['Bernhard'] }),
  // Traumstrecken ohne Pass
  route('t-schwarzwald', 'Schwarzwaldhochstraße', 'strecke', ['Baden-Baden', 'Freudenstadt'], 'kurvig', { minCurated: 40 }),
  route('t-vogesen', 'Route des Crêtes', 'strecke', ['Munster', 'Thann'], 'kurvig', { minCurated: 30 }),
  // Anfahrt schnell, dann kurvig
  { ...route('m-muc-tirol', 'München schnell, dann kurvig nach Tirol', 'gemischt', ['München', 'Garmisch', 'Innsbruck'], 'kurvig'), profiles: ['schnell', 'kurvig'], allowMotorway: true } as Case,
  // Rundtouren, kurz und lang
  { kind: 'runde', id: 'r-bensheim-120', name: 'Rundtour Bensheim 120 km', group: 'runde', profile: 'kurvig', start: O('Bensheim'), km: 120, direction: 'O', seed: 1, minCurated: 15 },
  { kind: 'runde', id: 'r-corvara-100', name: 'Rundtour Corvara 100 km', group: 'runde', profile: 'kurvig', start: O('Corvara'), km: 100, direction: 'S', seed: 1, minCurated: 30 },
  { kind: 'runde', id: 'r-garmisch-150', name: 'Rundtour Garmisch 150 km', group: 'runde', profile: 'kurvig', start: O('Garmisch'), km: 150, direction: 'SW', seed: 1 },
  { kind: 'runde', id: 'r-freiburg-60', name: 'Rundtour Freiburg 60 km', group: 'runde', profile: 'kurvig', start: O('Freiburg'), km: 60, direction: 'O', seed: 1, allowCities: ['Freiburg im Breisgau', 'Freiburg'] },
  { kind: 'runde', id: 'r-bozen-200', name: 'Rundtour Bozen 200 km', group: 'runde', profile: 'kurvig', start: O('Bozen'), km: 200, direction: 'zufall', seed: 1, minCurated: 20 },
  { kind: 'runde', id: 'r-annecy-120', name: 'Rundtour Annecy 120 km', group: 'runde', profile: 'kurvig', start: O('Annecy'), km: 120, direction: 'SO', seed: 1 },
  { kind: 'runde', id: 'r-chur-150', name: 'Rundtour Chur 150 km', group: 'runde', profile: 'kurvig', start: O('Chur'), km: 150, direction: 'S', seed: 1 },
  { kind: 'runde', id: 'r-lugano-80', name: 'Rundtour Lugano 80 km', group: 'runde', profile: 'kurvig', start: O('Lugano'), km: 80, direction: 'N', seed: 1 },
  { kind: 'runde', id: 'r-badenbaden-250', name: 'Rundtour Baden-Baden 250 km', group: 'runde', profile: 'kurvig', start: O('Baden-Baden'), km: 250, direction: 'S', seed: 1, minCurated: 15 },
];

/** Zufallszahlen aus dem Seed, gleich für denselben Tag */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** 20 wechselnde Fälle: 12 Rundtouren, 8 Strecken zwischen zwei nahen Pässen */
export function buildCases(seed: number): Case[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const starts = Object.keys(ORTE).filter((n) => !['Frankfurt', 'Stuttgart', 'München', 'Köln', 'Mailand', 'Zürich'].includes(n));
  const dirs: Direction[] = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW', 'zufall'];
  const out: Case[] = [...FIXED];
  for (let i = 0; i < 12; i++) {
    const s = pick(starts);
    const km = Math.round((40 + r() * 230) / 10) * 10;
    out.push({ kind: 'runde', id: `z-runde-${i}`, name: `Rundtour ${s.replace('_', ' ')} ${km} km`, group: 'zufall', profile: 'kurvig', start: O(s), km, direction: pick(dirs), seed: 1 + Math.floor(r() * 999) });
  }
  const big = PASSES.filter((p) => p.tier !== 'mittel');
  let tries = 0;
  for (let i = 0; i < 8 && tries < 500; tries++) {
    const a = pick(big);
    const b = pick(big);
    const d = Math.hypot(a.lat - b.lat, (a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) * 111;
    if (a === b || d < 15 || d > 90) continue;
    out.push(route(`z-paesse-${i}`, `${a.name} nach ${b.name}`, 'zufall', [[a.lat, a.lon], [b.lat, b.lon]], 'kurvig', { expectPasses: [a.name, b.name], maxDetour: 3 }));
    i++;
  }
  return out;
}
