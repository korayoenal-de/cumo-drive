/**
 * Fahrspaß Wert einer ganzen Tour (Konzept "Tour Fahrspaß Wert", 7.11.2026): 0 bis 100 aus vier Teilen.
 * Kurven 40 %, Traumstrecken 25 %, Pässe 20 %, Fluss 15 %. Dargestellt mit dem Logo als Pegel in fünf
 * Stufen mit eigenen Namen (die Highlights behalten Nett bis Legende).
 *
 * Fluss misst heute lange Geraden; Ortsdurchfahrten kommen dazu, sobald der Server die Ortsdichte liefert.
 */
import { HIGHLIGHT_ROADS, PREFER_ROADS } from './highlight-roads';
import { hairpinKms, roadsAlong } from './navigation/highlights';
import { passesAlong, PASSES, TIER_WEIGHT } from './passes';
import { countCurves, resample } from './stats';
import { haversine, type LatLon } from './tour';

export type TourFunLevel = 1 | 2 | 3 | 4 | 5;

export const TOUR_FUN_NAMES: Record<TourFunLevel, string> = {
  1: 'Gemütlich',
  2: 'Schwungvoll',
  3: 'Kurvenreich',
  4: 'Spektakulär',
  5: 'Legendär',
};

/** Untergrenzen der Stufen 2 bis 5 */
export const TOUR_FUN_STEPS = [35, 55, 70, 85];

export const tourFunLevel = (score: number): TourFunLevel =>
  (1 + TOUR_FUN_STEPS.filter((s) => score >= s).length) as TourFunLevel;

export type FunFacet = { id: 'kurven' | 'traum' | 'paesse' | 'fluss'; label: string; weight: number; share: number; value: string; text: string };
export type TourFun = { score: number; level: TourFunLevel; facets: FunFacet[] };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const fmt1 = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function bearing(a: LatLon, b: LatLon) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI;
}

/** Anteil der Strecke in langen Geraden: Fenster von 1 km, in denen sich die Richtung kaum ändert */
function straightShare(line: LatLon[]): number {
  const pts = resample(line, 100);
  if (pts.length < 12) return 0;
  const turn: number[] = [0];
  for (let i = 2; i < pts.length; i++) {
    let d = bearing(pts[i - 1], pts[i]) - bearing(pts[i - 2], pts[i - 1]);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turn.push(Math.abs(d));
  }
  let straight = 0;
  let total = 0;
  for (let i = 0; i + 10 <= turn.length; i += 10) {
    let s = 0;
    for (let j = i; j < i + 10; j++) s += turn[j];
    total++;
    if (s < 45) straight++;
  }
  return total ? straight / total : 0;
}

export function tourFun(line: LatLon[]): TourFun | null {
  if (line.length < 2) return null;
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]) / 1000);
  const km = cum[cum.length - 1];
  if (km < 3) return null;

  const curves = countCurves(line);
  const hairpins = hairpinKms(line).length;
  const perKm = curves / km;
  const kurven = clamp(perKm / 1.6 + (hairpins / km) * 1.2);

  const roads = roadsAlong(line, cum, [...HIGHLIGHT_ROADS, ...PREFER_ROADS], null, []);
  const roadKm = roads.reduce((s, r) => s + (r.endKm - r.startKm), 0);
  const roadShare = clamp(roadKm / km);
  const traum = clamp(roadShare / 0.6);

  const passes = passesAlong(PASSES, line);
  const passWeight = passes.reduce((s, x) => s + TIER_WEIGHT[x.pass.tier], 0);
  const paesse = clamp(passWeight / 6);

  const straight = straightShare(line);
  const fluss = clamp(1 - straight * 1.5);

  const facets: FunFacet[] = [
    { id: 'kurven', label: 'Kurven', weight: 0.4, share: kurven, value: `${fmt1(perKm)} je km`, text: 'Wie dicht und wie flüssig die Kurven kommen, Kehren zählen mehr.' },
    { id: 'traum', label: 'Traumstrecken', weight: 0.25, share: traum, value: `${Math.round(roadShare * 100)} % der Tour`, text: 'Anteil auf kuratierten Strecken aus unserer Datenbank.' },
    { id: 'paesse', label: 'Pässe', weight: 0.2, share: paesse, value: passes.length === 1 ? '1 Pass' : `${passes.length} Pässe`, text: 'Pässe an der Strecke, Ikonen zählen mehr als Geheimtipps.' },
    { id: 'fluss', label: 'Fluss', weight: 0.15, share: fluss, value: `${Math.round(straight * 100)} % Geraden`, text: 'Abzug für lange Geraden ohne Kurven.' },
  ];
  const score = Math.round(100 * facets.reduce((s, f) => s + f.weight * f.share, 0));
  return { score, level: tourFunLevel(score), facets };
}
