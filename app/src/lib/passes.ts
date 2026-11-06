/**
 * Pässe: eigene, geprüfte Datenbank (DE, AT, CH, IT, FR, SI) mit Stufe, Höhe, Kehren, Wintersperre.
 * calimoto findet Pässe nicht in der Suche und zeigt nur die Höhe; hier sind sie Kern der Planung.
 */
import passData from '@/data/passes.json';

import { bearingTo, destination } from './roundtrip';
import { haversine, type LatLon } from './tour';

export type PassTier = 'ikone' | 'bekannt' | 'mittel';

export type Pass = {
  id: string;
  name: string;
  names: string[];
  country: string[];
  region: string;
  lat: number;
  lon: number;
  ele: number;
  tier: PassTier;
  hairpins: number | null;
  winter_closed: boolean;
  closed_months: string | null;
  toll: boolean;
  car_note: string | null;
  source: string;
};

export const TIER_LABEL: Record<PassTier, string> = { ikone: 'Ikone', bekannt: 'Bekannt', mittel: 'Geheimtipp' };
export const TIER_WEIGHT: Record<PassTier, number> = { ikone: 3, bekannt: 2, mittel: 1 };

export const passPoint = (p: Pass): LatLon => [p.lat, p.lon];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(passo|pass|joch|col|sella|forcella|hohe|höhe|strasse|straße)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Suche über alle Namen; Ikonen zuerst, dann nach Treffergüte. */
export function searchPasses(list: Pass[], q: string, limit = 5): Pass[] {
  const n = norm(q);
  if (n.length < 2) return [];
  const scored: { p: Pass; s: number }[] = [];
  for (const p of list) {
    let best = 0;
    for (const name of [p.name, ...p.names]) {
      const m = norm(name);
      if (!m) continue;
      if (m === n) best = Math.max(best, 100);
      else if (m.startsWith(n)) best = Math.max(best, 70);
      else if (m.includes(n)) best = Math.max(best, 40);
    }
    if (best) scored.push({ p, s: best + TIER_WEIGHT[p.tier] * 5 });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p);
}

/** Pässe, die eine Linie überquert (Abstand höchstens maxM), mit km Position. */
export function passesAlong(list: Pass[], line: LatLon[], maxM = 250): { pass: Pass; km: number }[] {
  if (line.length < 2) return [];
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of line) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  const cand = list.filter((p) => p.lat > s - 0.01 && p.lat < n + 0.01 && p.lon > w - 0.01 && p.lon < e + 0.01);
  if (!cand.length) return [];
  const kms: number[] = [0];
  for (let i = 1; i < line.length; i++) kms.push(kms[i - 1] + haversine(line[i - 1], line[i]) / 1000);
  // Raster der Linienpunkte (Zellen größer als maxM): je Pass nur die Nachbarzellen prüfen statt der
  // ganzen Linie. Vorher 4,7 s für 4.000 km im Stresstest vom 6.11., jetzt wenige Millisekunden.
  const cell = Math.max(0.007, (maxM / 111320) * 2);
  const grid = new Map<string, number[]>();
  const key = (la: number, lo: number) => `${Math.floor(la / cell)}:${Math.floor(lo / cell)}`;
  for (let i = 0; i < line.length; i++) {
    const k = key(line[i][0], line[i][1]);
    const b = grid.get(k);
    if (b) b.push(i);
    else grid.set(k, [i]);
  }
  const out: { pass: Pass; km: number }[] = [];
  for (const p of cand) {
    const gy = Math.floor(p.lat / cell);
    const gx = Math.floor(p.lon / cell);
    let bd = Infinity;
    let bi = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const i of grid.get(`${gy + dy}:${gx + dx}`) ?? []) {
          const d = haversine(passPoint(p), line[i]);
          if (d < bd || (d === bd && i < bi)) {
            bd = d;
            bi = i;
          }
        }
      }
    }
    if (bi >= 0 && bd <= maxM) out.push({ pass: p, km: kms[bi] });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** Pässe im Umkreis, beste zuerst (Stufe, dann Nähe). */
export function passesNear(list: Pass[], p: LatLon, radiusKm: number): { pass: Pass; km: number }[] {
  return list
    .map((x) => ({ pass: x, km: haversine(p, passPoint(x)) / 1000 }))
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => TIER_WEIGHT[b.pass.tier] - TIER_WEIGHT[a.pass.tier] || a.km - b.km);
}

const MONTHS: [RegExp, number][] = [
  [/^jan/, 1], [/^feb/, 2], [/^m(ä|ae|a)r/, 3], [/^apr/, 4], [/^mai/, 5], [/^jun/, 6],
  [/^jul/, 7], [/^aug/, 8], [/^sep/, 9], [/^okt/, 10], [/^nov/, 11], [/^dez/, 12],
];

function monthOf(word: string): number | null {
  const w = word.toLowerCase();
  for (const [re, m] of MONTHS) if (re.test(w)) return m;
  return null;
}

/** "Nov bis Mai" zu [11, 5]; null, wenn sich nichts lesen lässt. */
export function closedRange(text: string | null): [number, number] | null {
  if (!text) return null;
  const found = text.split(/[^A-Za-zÄÖÜäöü]+/).map(monthOf).filter((m): m is number => m !== null);
  return found.length >= 2 ? [found[0], found[found.length - 1]] : null;
}

/**
 * Ist ein Pass in diesem Monat (1 bis 12) wahrscheinlich gesperrt?
 * Mit Monatsangabe gilt die Angabe. Ohne Angabe sind Pässe mit bekannter Wintersperre und alle
 * ab 2000 m vorsichtshalber von November bis Mai zu, weil die Quellen dort oft schweigen.
 */
export function likelyClosed(p: Pass, month: number): boolean {
  const range = closedRange(p.closed_months);
  if (range) {
    const [a, b] = range;
    return a <= b ? month >= a && month <= b : month >= a || month <= b;
  }
  if (!p.winter_closed && p.ele < 2000) return false;
  return month >= 11 || month <= 5;
}

/** Pässe auf einer Linie, die im Monat wahrscheinlich gesperrt sind (nur als Hinweis). */
export function closedAlong(list: Pass[], line: LatLon[], month: number): Pass[] {
  return passesAlong(list, line)
    .map((x) => x.pass)
    .filter((p) => likelyClosed(p, month));
}

/** Text für den Hinweis, zum Beispiel "Stilfser Joch (Nov bis Mai) und Gavia". */
export function closedNote(closed: Pass[]): string {
  const names = closed.map((p) => (p.closed_months ? `${p.name} (${p.closed_months})` : p.name));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0] ?? '';
}

/** Übersicht mit aktuellem Status, bis wir eine eigene Live Quelle haben. */
export const PASS_STATUS_URL = 'https://www.ace.de/reisen/reiseinformationen/alpenpaesse';

/** Alle geprüften Pässe (DE, AT, CH, IT und Grenzpässe). */
export const PASSES = passData as Pass[];

/** Kurzbeschreibung für Listen und Karten, zum Beispiel "2757 m, Ikone, 82 Kehren". */
export function passSummary(p: Pass, month?: number, stateNote?: string): string {
  const parts = [`${p.ele.toLocaleString('de-DE')} m`, TIER_LABEL[p.tier]];
  if (p.hairpins) parts.push(`${p.hairpins} Kehren`);
  if (p.toll) parts.push('Maut');
  if (stateNote !== undefined) {
    if (stateNote) parts.push(stateNote);
  } else if (month !== undefined && likelyClosed(p, month)) parts.push(p.closed_months ? `gesperrt ${p.closed_months}` : 'im Winter wohl gesperrt');
  return parts.join(', ');
}

/** GeoJSON für die Kartenebene. */
export function passesGeoJson(list: Pass[], month: number, isClosed: (p: Pass) => boolean = (p) => likelyClosed(p, month)) {
  return {
    type: 'FeatureCollection',
    features: list.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name, ele: p.ele, tier: p.tier, closed: isClosed(p) },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

/**
 * Via Punkte für eine Pässe Runde: bis zu zwei Pässe in Reichweite, bevorzugt in der
 * gewünschten Richtung, so angeordnet, dass eine Schleife entsteht.
 */
export function passLoopVia(
  list: Pass[],
  start: LatLon,
  km: number,
  bearing: number | null,
  month: number,
): { via: LatLon[]; passes: Pass[] } | null {
  // Ein Pass in Luftlinie r erzeugt im Gebirge grob eine Runde von 3 bis 3,5 mal r Straßen km
  const reach = km / 3.3;
  // Wintersperren verhindern keine Planung (Touren werden oft im Winter für den Sommer geplant).
  // Bei gleicher Eignung gewinnt der offene Pass knapp, die Tour zeigt Sperren als Hinweis.
  const open = passesNear(list, start, reach).filter((x) => x.km > 3);
  if (!open.length) return null;
  const score = (x: { pass: Pass; km: number }) => {
    const dirFit = bearing === null ? 1 : Math.cos(((bearingTo(start, passPoint(x.pass)) - bearing) * Math.PI) / 180) * 0.5 + 0.5;
    return TIER_WEIGHT[x.pass.tier] * 2 + dirFit * 3 + (x.km / reach) * 1.5 - (likelyClosed(x.pass, month) ? 0.5 : 0);
  };
  const ranked = [...open].sort((a, b) => score(b) - score(a));
  const first = ranked[0];
  const chosen = [first];
  // zweiter Pass: nicht zu nah am ersten, passt mit in die Länge
  for (const x of ranked.slice(1)) {
    const gap = haversine(passPoint(first.pass), passPoint(x.pass)) / 1000;
    if (gap > 8 && first.km + gap + x.km <= km / 1.7) {
      chosen.push(x);
      break;
    }
  }
  // Reihenfolge im Uhrzeigersinn ab Start, damit es eine Schleife wird
  chosen.sort((a, b) => bearingTo(start, passPoint(a.pass)) - bearingTo(start, passPoint(b.pass)));
  const via = chosen.map((x) => passPoint(x.pass));
  if (chosen.length === 1) {
    // Rückweg über einen Punkt seitlich, damit nicht derselbe Weg zurück
    const b = bearingTo(start, via[0]);
    via.push(destination(start, first.km * 0.6, b + 55));
  }
  return { via, passes: chosen.map((x) => x.pass) };
}
