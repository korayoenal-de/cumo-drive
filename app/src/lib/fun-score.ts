/**
 * Fahrspaß Wert einer ganzen Tour (Konzept "Tour Fahrspaß Wert", 7.11.2026): 0 bis 100 aus vier Teilen.
 * Kurven 40 %, Traumstrecken 25 %, Pässe 20 %, Fluss 15 %; ohne Pässe Kurven 50 %, Traumstrecken 30 %, Fluss 20 %. Dargestellt mit dem Logo als Pegel in fünf
 * Stufen mit eigenen Namen (die Highlights behalten Nett bis Legende).
 *
 * Fluss misst heute lange Geraden; Ortsdurchfahrten kommen dazu, sobald der Server die Ortsdichte liefert.
 */
import { HIGHLIGHT_ROADS, PREFER_ROADS } from './highlight-roads';
import { hairpinKms, roadsAlong } from './navigation/highlights';
import { passesAlong, PASSES, TIER_WEIGHT } from './passes';
import { resample } from './stats';
import { haversine, type LatLon } from './tour';

/** Stand der Rechnung; gespeicherte Werte älterer Stände werden neu gerechnet */
export const TOUR_FUN_VERSION = 2;

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

/**
 * Wie stark die Strecke kurvt: Richtungswechsel in Grad je km (Schritte ab 3 Grad) und der Anteil
 * der 500 m Stücke mit mindestens 60 Grad. Misst auch flüssige Mittelgebirgskurven, nicht nur Kehren
 * (Koray 8.11.: Odenwald lag vorher bei 0,1 Kurven je km). Autobahn etwa 30, Odenwald etwa 220,
 * Pfälzer Wald etwa 340, Stilfser Joch etwa 460 Grad je km.
 */
function winding(line: LatLon[]): { degKm: number; curvyShare: number } {
  const pts = resample(line, 60);
  if (pts.length < 3) return { degKm: 0, curvyShare: 0 };
  let total = 0;
  let acc = 0;
  let n = 0;
  let curvy = 0;
  let windows = 0;
  for (let i = 2; i < pts.length; i++) {
    let d = bearing(pts[i - 1], pts[i]) - bearing(pts[i - 2], pts[i - 1]);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const a = Math.abs(d) >= 3 ? Math.abs(d) : 0;
    total += a;
    acc += a;
    if (++n === 8) {
      windows++;
      if (acc >= 60) curvy++;
      acc = 0;
      n = 0;
    }
  }
  const km = (pts.length * 60) / 1000;
  return { degKm: total / km, curvyShare: windows ? curvy / windows : 0 };
}

export function tourFun(line: LatLon[]): TourFun | null {
  if (line.length < 2) return null;
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]) / 1000);
  const km = cum[cum.length - 1];
  if (km < 3) return null;

  const { degKm, curvyShare } = winding(line);
  const hairpins = hairpinKms(line).length;
  const kurven = clamp((degKm - 40) / 280 + (hairpins / km) * 1.2);

  const roads = roadsAlong(line, cum, [...HIGHLIGHT_ROADS, ...PREFER_ROADS], null, []);
  const roadKm = roads.reduce((s, r) => s + (r.endKm - r.startKm), 0);
  const roadShare = clamp(roadKm / km);
  const traum = clamp(roadShare / 0.5);

  const passes = passesAlong(PASSES, line);
  const passWeight = passes.reduce((s, x) => s + TIER_WEIGHT[x.pass.tier], 0);
  const paesse = clamp(passWeight / 4);

  const straight = straightShare(line);
  const fluss = clamp(1 - straight * 1.5);

  const facet = {
    kurven: { id: 'kurven', label: 'Kurven', share: kurven, value: `kurvig auf ${Math.round(curvyShare * 100)} %`, text: 'Wie viel und wie eng die Straße kurvt, Kehren zählen mehr.' },
    traum: { id: 'traum', label: 'Traumstrecken', share: traum, value: `${Math.round(roadShare * 100)} % der Tour`, text: 'Anteil auf kuratierten Strecken aus unserer Datenbank.' },
    paesse: { id: 'paesse', label: 'Pässe', share: paesse, value: passes.length === 1 ? '1 Pass' : `${passes.length} Pässe`, text: 'Pässe an der Strecke, Ikonen zählen mehr als Geheimtipps.' },
    fluss: { id: 'fluss', label: 'Fluss', share: fluss, value: `${Math.round(straight * 100)} % Geraden`, text: 'Abzug für lange Geraden ohne Kurven.' },
  } as const;
  // Pässe sind ein Bonus: Mittelgebirge wie Odenwald, Pfälzer Wald oder Schwarzwald haben keine richtigen
  // Pässe und machen trotzdem Spaß (Koray 8.11.). Ohne Pässe zählen nur die übrigen drei Teile, mit Pässen
  // gilt die bessere der beiden Rechnungen, damit ein kleiner Pass den Wert nie senkt.
  const withPasses: FunFacet[] = [
    { ...facet.kurven, weight: 0.4 },
    { ...facet.traum, weight: 0.25 },
    { ...facet.paesse, weight: 0.2 },
    { ...facet.fluss, weight: 0.15 },
  ];
  const without: FunFacet[] = [
    { ...facet.kurven, weight: 0.5 },
    { ...facet.traum, weight: 0.3 },
    { ...facet.fluss, weight: 0.2 },
  ];
  const sum = (fs: FunFacet[]) => Math.round(100 * fs.reduce((s, f) => s + f.weight * f.share, 0));
  const a = sum(withPasses);
  const b = sum(without);
  const usePasses = passes.length > 0 && a >= b;
  const facets = usePasses ? withPasses : without;
  const score = usePasses ? a : b;
  return { score, level: tourFunLevel(score), facets };
}
