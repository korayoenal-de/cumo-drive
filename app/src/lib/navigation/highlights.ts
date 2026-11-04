/**
 * Highlights entlang der Route (zunächst Pässe): wo der Abschnitt beginnt, wie lang er ist und wie
 * viele Kehren er hat. Die Navigation kündigt sie kurz vorher mit Overlay und Ansage an.
 *
 * Abschnitt eines Passes: vom Talpunkt vor der Passhöhe bis zum Talpunkt danach (Höhenprofil).
 * Ohne Höhendaten zählt die Kette von Kehren rund um die Passhöhe.
 */
import { PASSES, passesAlong, type Pass } from '../passes';
import { resample, type ElevationProfile } from '../stats';
import { haversine, type LatLon } from '../tour';

export type Highlight = {
  id: string;
  kind: 'pass';
  name: string;
  /** km ab Routenstart, an dem der Abschnitt beginnt und endet */
  startKm: number;
  endKm: number;
  /** km der Passhöhe */
  topKm: number;
  hairpins: number;
  ele: number | null;
  climbM: number | null;
};

function heading(a: LatLon, b: LatLon) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2(b[0] - a[0], (b[1] - a[1]) * k) * 180) / Math.PI;
}

const STEP = 15;

/** Kehren: Richtungswechsel von mindestens 150 Grad in dieselbe Richtung auf höchstens 200 m. Liefert die km jeder Kehre. */
export function hairpinKms(line: LatLon[], offsetKm = 0): number[] {
  const pts = resample(line, STEP);
  const turns: number[] = [];
  for (let i = 2; i < pts.length; i++) {
    let d = heading(pts[i - 1], pts[i]) - heading(pts[i - 2], pts[i - 1]);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turns.push(d);
  }
  const win = Math.round(200 / STEP);
  const out: number[] = [];
  for (let i = 0; i < turns.length; i++) {
    let sum = 0;
    for (let j = i; j < Math.min(turns.length, i + win); j++) {
      sum += turns[j];
      if (Math.abs(sum) >= 150) {
        out.push(offsetKm + ((i + j) / 2 + 1) * (STEP / 1000));
        i = j + 2;
        break;
      }
    }
  }
  return out;
}

function sliceKm(shape: LatLon[], cumKm: number[], a: number, b: number): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 0; i < shape.length; i++) if (cumKm[i] >= a && cumKm[i] <= b) out.push(shape[i]);
  return out;
}

function smooth(m: number[], r = 2): number[] {
  return m.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(m.length - 1, i + r); j++) {
      s += m[j];
      n++;
    }
    return s / n;
  });
}

/** Talpunkte vor und nach der Passhöhe aus dem Höhenprofil. */
function valleyBounds(e: ElevationProfile, topKm: number, maxKm = 45): { start: number; end: number; top: number; climb: number } | null {
  if (e.km.length < 5) return null;
  const m = smooth(e.m);
  // echte Passhöhe: höchster Punkt im Umkreis von 4 km um die Koordinate aus der Passliste
  let top = -1;
  for (let i = 0; i < e.km.length; i++) if (Math.abs(e.km[i] - topKm) <= 4 && (top < 0 || m[i] > m[top])) top = i;
  if (top < 0) return null;
  const walk = (dir: 1 | -1) => {
    let min = top;
    for (let i = top + dir; i >= 0 && i < m.length; i += dir) {
      if (Math.abs(e.km[i] - e.km[top]) > maxKm) break;
      if (m[i] < m[min]) min = i;
      // wieder deutlich bergauf: Tal ist durchfahren
      else if (m[i] - m[min] > 120) break;
    }
    // flachen Talboden abschneiden: Abschnitt beginnt, wo die Straße 40 m über dem Tal ist
    let i = min;
    while (i !== top && m[i] - m[min] < 40) i -= dir;
    return { valley: min, edge: i };
  };
  const a = walk(-1);
  const b = walk(1);
  const up = m[top] - m[a.valley];
  const down = m[top] - m[b.valley];
  if (Math.max(up, down) < 150) return null;
  return { start: e.km[a.edge], end: e.km[b.edge], top: e.km[top], climb: Math.round(Math.max(up, down)) };
}

/** Ohne Höhendaten: Kehren rund um die Passhöhe, bis eine Lücke von mehr als 4 km kommt. */
function hairpinBounds(pins: number[], topKm: number): { start: number; end: number } {
  let start = topKm;
  let end = topKm;
  const before = pins.filter((k) => k <= topKm).reverse();
  const after = pins.filter((k) => k > topKm);
  for (const k of before) {
    if (start - k > 4) break;
    start = k;
  }
  for (const k of after) {
    if (k - end > 4) break;
    end = k;
  }
  return { start: Math.max(0, start - 1), end: end + 1 };
}

export function findHighlights(shape: LatLon[], cumKm: number[], elev: ElevationProfile | null, list: Pass[] = PASSES): Highlight[] {
  if (shape.length < 2) return [];
  const total = cumKm[cumKm.length - 1];
  const pins = hairpinKms(shape);
  // km der Kehren auf die Routen km umrechnen (resample nutzt dieselbe Haversine Länge)
  const out: Highlight[] = [];
  for (const { pass, km } of passesAlong(list, shape)) {
    const v = elev ? valleyBounds(elev, km) : null;
    const b = v ?? hairpinBounds(pins, km);
    const startKm = Math.max(0, Math.min(b.start, km - 0.5));
    const endKm = Math.min(total, Math.max(b.end, km + 0.5));
    const n = pins.filter((k) => k >= startKm && k <= endKm).length;
    out.push({
      id: pass.id,
      kind: 'pass',
      name: pass.name,
      startKm,
      endKm,
      topKm: v?.top ?? km,
      hairpins: n || 0,
      ele: pass.ele || null,
      climbM: v?.climb ?? null,
    });
  }
  // Zwei Passhöhen auf einer Bergstraße (Stilfser Joch und Umbrail): nur die höhere ankündigen
  const keep: Highlight[] = [];
  for (const h of out) {
    const clash = keep.findIndex((k) => (h.topKm >= k.startKm && h.topKm <= k.endKm) || (k.topKm >= h.startKm && k.topKm <= h.endKm));
    if (clash < 0) keep.push(h);
    else if ((h.ele ?? 0) > (keep[clash].ele ?? 0)) keep[clash] = h;
  }
  return keep.sort((a, b) => a.startKm - b.startKm);
}

/** Text unter dem Namen: Länge, Kehren, Höhe. */
export function highlightFacts(h: Highlight): string {
  const len = Math.round(h.endKm - h.startKm);
  return [`${len} km`, h.hairpins >= 3 ? `${h.hairpins} Kehren` : null, h.ele ? `${h.ele.toLocaleString('de-DE')} m` : null].filter(Boolean).join(', ');
}

export function highlightSpeech(h: Highlight, distM: number): string {
  const len = Math.round(h.endKm - h.startKm);
  const where = distM > 150 ? `In ${distM >= 950 ? 'einem Kilometer' : `${Math.round(distM / 100) * 100} Metern`} beginnt` : 'Jetzt beginnt';
  const pins = h.hairpins >= 3 ? `, ${h.hairpins} Kehren` : '';
  return `${where} ${h.name}. ${len} Kilometer${pins}.`;
}

/** Nur für Tests: Länge der Linie in km. */
export function lineKm(line: LatLon[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversine(line[i - 1], line[i]);
  return s / 1000;
}

export { sliceKm };
