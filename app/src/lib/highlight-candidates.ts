/**
 * Highlights für ein neues Zwischenziel (Koray 8.11.): Pässe und kuratierte Strecken, aber nur, wenn sie einen Bogen
 * ergeben. Ein Punkt, zu dem man hoch und auf demselben Weg wieder runter fährt, fliegt raus; eine Strecke wird in
 * Fahrtrichtung durchfahren, Einstieg zuerst. Rechnet mit Luftlinie und einem Faktor für Straßen.
 */
import { HIGHLIGHT_ROADS, type HighlightRoad } from './highlight-roads';
import { PASSES, passPoint, type Pass } from './passes';
import { haversine, type LatLon } from './tour';

export type Leg = { a: LatLon; b: LatLon };
export type HighlightCandidate = {
  key: string;
  name: string;
  detail: string;
  /** Punkt (Pass) oder Einstieg der Strecke */
  p: LatLon;
  /** nur Strecken: Ausstieg */
  exit?: LatLon;
  /** grober Umweg in Minuten gegenüber der Etappe */
  extraMin: number;
  pass?: Pass;
  road?: HighlightRoad;
};

/** Faktor Luftlinie zu Straße und Tempo auf Umwegen */
const ROAD = 1.3;
const KMH = 50;

/** Winkel bei p zwischen den Richtungen zu a und zu b, in Grad (flach gerechnet) */
function angleAt(a: LatLon, p: LatLon, b: LatLon): number {
  const k = Math.cos((p[0] * Math.PI) / 180);
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0];
  const bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (!la || !lb) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180) / Math.PI;
}

/** Abstand eines Punkts zur Strecke a b in Metern (flach gerechnet) */
function offLeg(a: LatLon, b: LatLon, p: LatLon): number {
  const k = Math.cos((a[0] * Math.PI) / 180) * 111320;
  const bx = (b[1] - a[1]) * k, by = (b[0] - a[0]) * 111320;
  const px = (p[1] - a[1]) * k, py = (p[0] - a[0]) * 111320;
  const l2 = bx * bx + by * by;
  const t = l2 ? Math.max(0, Math.min(1, (px * bx + py * by) / l2)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

const minutes = (km: number) => Math.max(0, Math.round((km * ROAD * 60) / KMH));

/** Mindestwinkel: darunter fährt man hin und auf demselben Weg zurück */
const MIN_ANGLE = 100;

export function highlightsForLeg(leg: Leg, corridorM: number): HighlightCandidate[] {
  const { a, b } = leg;
  const direct = haversine(a, b);
  // breiter Korridor bei langen Etappen, damit ein schöner Bogen möglich ist
  const reach = Math.max(corridorM, direct * 0.35);
  const out: HighlightCandidate[] = [];
  for (const ps of PASSES) {
    const p = passPoint(ps);
    if (offLeg(a, b, p) > reach) continue;
    if (angleAt(a, p, b) < MIN_ANGLE) continue;
    const extra = (haversine(a, p) + haversine(p, b) - direct) / 1000;
    out.push({ key: ps.id, name: ps.name, detail: `${ps.ele.toLocaleString('de-DE')} m, ${ps.region}`, p, extraMin: minutes(extra), pass: ps });
  }
  for (const r of HIGHLIGHT_ROADS) {
    if (r.line.length < 2) continue;
    const e1 = r.line[0];
    const e2 = r.line[r.line.length - 1];
    // Einstieg ist das Ende, das zur Fahrtrichtung passt
    const fwd = haversine(a, e1) + haversine(e2, b) <= haversine(a, e2) + haversine(e1, b);
    const entry = fwd ? e1 : e2;
    const exit = fwd ? e2 : e1;
    if (offLeg(a, b, entry) > reach || offLeg(a, b, exit) > reach) continue;
    // keine Kehrtwende vor oder nach der Strecke
    if (angleAt(a, entry, exit) < MIN_ANGLE || angleAt(entry, exit, b) < MIN_ANGLE) continue;
    let len = 0;
    for (let i = 1; i < r.line.length; i++) len += haversine(r.line[i - 1], r.line[i]);
    const extra = (haversine(a, entry) + len / ROAD + haversine(exit, b) - direct) / 1000;
    out.push({ key: r.id, name: r.name, detail: `${r.note}, ${Math.round(len / 1000)} km`, p: entry, exit, extraMin: minutes(extra), road: r });
  }
  // gleicher Name als Pass und als Strecke (etwa Juhöhe): die Strecke behalten
  const roads = new Set(out.filter((c) => c.road).map((c) => c.name));
  return out.filter((c) => c.road || !roads.has(c.name)).sort((x, y) => x.extraMin - y.extraMin);
}
