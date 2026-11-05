/**
 * Highlights entlang der Route: Pässe und kuratierte Strecken (alte Rallyeprüfungen, Bergrennstrecken,
 * Kurven und Panoramastraßen). Wo der Abschnitt beginnt, wie lang er ist und wie viele Kehren er hat.
 * Die Navigation kündigt sie kurz vorher mit Overlay und Ansage an.
 *
 * Abschnitt eines Passes: vom Talpunkt vor der Passhöhe bis zum Talpunkt danach (Höhenprofil).
 * Ohne Höhendaten zählt die Kette von Kehren rund um die Passhöhe.
 * Abschnitt einer Strecke: von der Projektion ihres ersten bis zu der ihres letzten Punkts auf die Route.
 */
import { HIGHLIGHT_ROADS, type HighlightRoad } from '../highlight-roads';
import { PASSES, passesAlong, type Pass } from '../passes';
import { resample, type ElevationProfile } from '../stats';
import { haversine, type LatLon } from '../tour';

/** pass oder die Art der kuratierten Strecke: rallye, strecke, aussicht, bergrennen */
export type HighlightKind = 'pass' | HighlightRoad['kind'];

export type Highlight = {
  id: string;
  kind: HighlightKind;
  name: string;
  /** Unterzeile bei Strecken, zum Beispiel "alte Rallyestrecke" oder "ehemalige Bergrennstrecke" */
  note?: string;
  /** gesprochener Teil nach "beginnt" bei Strecken */
  say?: string;
  /** km ab Routenstart, an dem der Abschnitt beginnt und endet */
  startKm: number;
  endKm: number;
  /** km der Passhöhe, bei Strecken der höchste Punkt (ohne Höhendaten der Anfang) */
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

export function findHighlights(
  shape: LatLon[],
  cumKm: number[],
  elev: ElevationProfile | null,
  list: Pass[] = PASSES,
  roads: HighlightRoad[] = HIGHLIGHT_ROADS,
): Highlight[] {
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
  // Strecken: liegt eine Passhöhe auf der Strecke, gewinnt die Strecke (genauer benannt),
  // außer der Pass ist eine Ikone. So gibt es pro Abschnitt nur eine Ankündigung.
  const tier = new Map(list.map((p) => [p.id, p.tier]));
  let passes = keep;
  const found: Highlight[] = [];
  for (const r of roadsAlong(shape, cumKm, roads, elev, pins)) {
    // Pass auf der Strecke, oder Passanstieg beginnt fast gleichzeitig (Gurnigel: Ziel 3 km vor der Passhöhe)
    const onRoad = (p: Highlight) => (p.topKm >= r.startKm - 0.5 && p.topKm <= r.endKm + 0.5) || Math.abs(p.startKm - r.startKm) < 1;
    if (passes.some((p) => onRoad(p) && tier.get(p.id) === 'ikone')) continue;
    passes = passes.filter((p) => !onRoad(p));
    found.push(r);
  }
  return [...passes, ...found].sort((a, b) => a.startKm - b.startKm);
}

/** Nächste Stellen der Route zu einem Punkt (höchstens maxM entfernt), je Durchfahrt eine. */
function projections(shape: LatLon[], cumKm: number[], p: LatLon, maxM: number, from = 0, to = shape.length - 1): { km: number; i: number; d: number }[] {
  const k = Math.cos((p[0] * Math.PI) / 180) * 111320;
  const out: { km: number; i: number; d: number }[] = [];
  let last = -10;
  for (let i = Math.max(0, from); i < Math.min(to, shape.length - 1); i++) {
    const ax = (shape[i][1] - p[1]) * k;
    const ay = (shape[i][0] - p[0]) * 110540;
    const bx = (shape[i + 1][1] - p[1]) * k;
    const by = (shape[i + 1][0] - p[0]) * 110540;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d > maxM) continue;
    const km = cumKm[i] + t * (cumKm[i + 1] - cumKm[i]);
    // direkt anschließende Segmente gehören zur selben Durchfahrt: nur die nächste Stelle behalten
    if (i - last <= 2 && out.length) {
      if (d < out[out.length - 1].d) out[out.length - 1] = { km, i, d };
    } else out.push({ km, i, d });
    last = i;
  }
  return out;
}

const ROAD_MAX_M = 120;
const ROAD_MIN_SHARE = 0.7;

/**
 * Kuratierte Strecken, die die Route befährt: Anfang und Ende der Strecke liegen höchstens 120 m
 * neben der Route (in beliebiger Richtung), und mindestens 70 % der Strecke liegen auf dem Stück dazwischen.
 */
export function roadsAlong(
  shape: LatLon[],
  cumKm: number[],
  roads: HighlightRoad[] = HIGHLIGHT_ROADS,
  elev: ElevationProfile | null = null,
  pins: number[] = hairpinKms(shape),
): Highlight[] {
  if (shape.length < 2) return [];
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of shape) {
    s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo);
  }
  const out: Highlight[] = [];
  for (const road of roads) {
    if (road.line.length < 2) continue;
    if (!road.line.some(([la, lo]) => la > s - 0.01 && la < n + 0.01 && lo > w - 0.01 && lo < e + 0.01)) continue;
    const L = lineKm(road.line);
    const A = projections(shape, cumKm, road.line[0], ROAD_MAX_M);
    const B = projections(shape, cumKm, road.line[road.line.length - 1], ROAD_MAX_M);
    if (!A.length || !B.length) continue;
    const probe = resample(road.line, 100);
    const taken: [number, number][] = [];
    for (const a of A) {
      let best: { lo: number; hi: number; share: number } | null = null;
      for (const b of B) {
        const lo = Math.min(a.km, b.km);
        const hi = Math.max(a.km, b.km);
        const span = hi - lo;
        if (span < ROAD_MIN_SHARE * L || span > 1.5 * L + 1) continue;
        // Anteil der Strecke, der auf diesem Stück der Route liegt
        const i0 = Math.min(a.i, b.i);
        const i1 = Math.max(a.i, b.i) + 1;
        let hit = 0;
        for (const q of probe) if (projections(shape, cumKm, q, ROAD_MAX_M, i0, i1).length) hit++;
        const share = hit / probe.length;
        if (share < ROAD_MIN_SHARE) continue;
        if (!best || share > best.share) best = { lo, hi, share };
      }
      if (!best || taken.some(([x, y]) => best!.lo < y && best!.hi > x)) continue;
      taken.push([best.lo, best.hi]);
      const top = elev ? highest(elev, best.lo, best.hi) : null;
      out.push({
        id: taken.length > 1 ? `road:${road.id}:${taken.length}` : `road:${road.id}`,
        kind: road.kind,
        name: road.name,
        note: road.note,
        say: road.say,
        startKm: best.lo,
        endKm: best.hi,
        topKm: top?.km ?? best.lo,
        hairpins: pins.filter((k) => k >= best!.lo && k <= best!.hi).length,
        ele: null,
        climbM: top?.climb ?? null,
      });
    }
  }
  out.sort((a, b) => a.startKm - b.startKm);
  // Lange Strecken in mehreren Teilen (Schwarzwaldhochstraße Nord und Süd): direkt hintereinander gefahren nur eine Ankündigung
  const merged: Highlight[] = [];
  for (const h of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.name === h.name && h.startKm - prev.endKm < 1) {
      prev.endKm = Math.max(prev.endKm, h.endKm);
      prev.hairpins = pins.filter((k) => k >= prev.startKm && k <= prev.endKm).length;
      const top = elev ? highest(elev, prev.startKm, prev.endKm) : null;
      prev.topKm = top?.km ?? prev.startKm;
      prev.climbM = top?.climb ?? null;
    } else merged.push({ ...h });
  }
  return merged;
}

/** Höchster Punkt und Höhenunterschied zwischen zwei Routen km. */
function highest(e: ElevationProfile, a: number, b: number): { km: number; climb: number } | null {
  let top = -1;
  let low = Infinity;
  for (let i = 0; i < e.km.length; i++) {
    if (e.km[i] < a || e.km[i] > b) continue;
    if (top < 0 || e.m[i] > e.m[top]) top = i;
    low = Math.min(low, e.m[i]);
  }
  return top < 0 ? null : { km: e.km[top], climb: Math.round(e.m[top] - low) };
}

/** Text unter dem Namen: Länge, Kehren, Höhe; bei Strecken zuerst die Unterzeile. */
export function highlightFacts(h: Highlight): string {
  const len = Math.max(1, Math.round(h.endKm - h.startKm));
  if (h.kind !== 'pass') return [h.note ?? null, `${len} km`, h.hairpins >= 3 ? `${h.hairpins} Kehren` : null].filter(Boolean).join(', ');
  return [`${len} km`, h.hairpins >= 3 ? `${h.hairpins} Kehren` : null, h.ele ? `${h.ele.toLocaleString('de-DE')} m` : null].filter(Boolean).join(', ');
}

export function highlightSpeech(h: Highlight, distM: number): string {
  const len = Math.max(1, Math.round(h.endKm - h.startKm));
  const where = distM > 150 ? `In ${distM >= 950 ? 'einem Kilometer' : `${Math.round(distM / 100) * 100} Metern`} beginnt` : 'Jetzt beginnt';
  const pins = h.hairpins >= 3 ? `, ${h.hairpins} Kehren` : '';
  const what = h.kind === 'pass' ? h.name : (h.say ?? (h.note ? `die ${h.note} ${h.name}` : h.name));
  return `${where} ${what}. ${len} Kilometer${pins}.`;
}

/** Nur für Tests: Länge der Linie in km. */
export function lineKm(line: LatLon[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += haversine(line[i - 1], line[i]);
  return s / 1000;
}

export { sliceKm };
