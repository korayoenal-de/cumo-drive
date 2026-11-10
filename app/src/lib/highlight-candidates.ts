/**
 * Highlights für ein neues Zwischenziel (Koray 8.11.): Pässe und kuratierte Strecken, aber nur, wenn sie einen Bogen
 * ergeben. Ein Punkt, zu dem man hoch und auf demselben Weg wieder runter fährt, fliegt raus; eine Strecke wird in
 * Fahrtrichtung durchfahren, Einstieg zuerst. Rechnet mit Luftlinie und einem Faktor für Straßen.
 */
import { learnedLevel } from './highlight-feedback';
import { defaultLevel, HIGHLIGHT_ROADS, type HighlightRoad } from './highlight-roads';
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
  /** nur Strecken: Linie in Fahrtrichtung, an den Enden um 250 m gekürzt, damit Ein und Ausstieg nicht in einer Schlaufe liegen */
  line?: LatLon[];
  /** grober Umweg in Minuten gegenüber der Etappe */
  extraMin: number;
  pass?: Pass;
  road?: HighlightRoad;
  /** Fahrspaß Pegel 1 bis 5, wie in der Ansage (Koray 10.11.: in der Liste statt Berg Symbol) */
  level: number;
};

/** Pegel der Pässe nach Stufe: Ikone Legende, bekannt Traumstraße, Geheimtipp Stark */
export const PASS_TIER_LEVEL: Record<Pass['tier'], number> = { ikone: 5, bekannt: 4, mittel: 3 };
export const passLevel = (ps: Pass) => learnedLevel(ps.id, PASS_TIER_LEVEL[ps.tier]);

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

/** Linie an beiden Enden um m Meter kürzen (bleibt bei kurzen Linien unverändert) */
function trimEnds(line: LatLon[], m: number): LatLon[] {
  let len = 0;
  for (let i = 1; i < line.length; i++) len += haversine(line[i - 1], line[i]);
  if (len < m * 4) return line;
  const cut = (l: LatLon[]) => {
    let d = 0;
    let i = 1;
    while (i < l.length - 1 && d < m) d += haversine(l[i - 1], l[i++]);
    return l.slice(i - 1);
  };
  return cut([...cut(line)].reverse()).reverse();
}

/** Rahmen je Strecke, einmal berechnet: schließt fast alle Strecken ohne Abstandsrechnung aus */
let roadBoxes: { s: number; n: number; w: number; e: number }[] | null = null;
function boxes() {
  if (!roadBoxes) {
    roadBoxes = HIGHLIGHT_ROADS.map((r) => {
      let s = 90, n = -90, w = 180, e = -180;
      for (const [la, lo] of r.line) {
        if (la < s) s = la;
        if (la > n) n = la;
        if (lo < w) w = lo;
        if (lo > e) e = lo;
      }
      return { s, n, w, e };
    });
  }
  return roadBoxes;
}

function snapToRoad(p: LatLon): LatLon {
  let best: LatLon = p;
  let bd = 300;
  // 300 m sind etwa 0,0027 Grad Breite; in der Länge großzügig
  const dLat = 0.003;
  const dLon = 0.005;
  const bx = boxes();
  for (let k = 0; k < HIGHLIGHT_ROADS.length; k++) {
    const b = bx[k];
    if (p[0] < b.s - dLat || p[0] > b.n + dLat || p[1] < b.w - dLon || p[1] > b.e + dLon) continue;
    for (const q of HIGHLIGHT_ROADS[k].line) {
      const d = haversine(p, q);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}

const minutes = (km: number) => Math.max(0, Math.round((km * ROAD * 60) / KMH));

/** Mindestwinkel am Pass: darunter fährt man hin und auf demselben Weg zurück */
const MIN_ANGLE = 100;
/** An Ein und Ausstieg einer Strecke reicht weniger: die Strecke selbst ist schon der Bogen, nur kehrtmachen darf man nicht */
const ROAD_ANGLE = 60;

export function highlightsForLeg(leg: Leg, corridorM: number): HighlightCandidate[] {
  const { a, b } = leg;
  const direct = haversine(a, b);
  // breiter Korridor bei langen Etappen, damit ein schöner Bogen möglich ist
  const reach = Math.max(corridorM, direct * 0.35);
  const out: HighlightCandidate[] = [];
  for (const ps of PASSES) {
    // Passpunkt auf unsere Strecke ziehen, wenn eine durch ihn führt: der Punkt aus der Passdatenbank liegt
    // manchmal auf einem Waldweg daneben, dann umfährt die Prüfung ihn und man fährt zurück (Juhöhe, 8.11.)
    // erst grob mit dem Punkt aus der Datenbank prüfen, das Einrasten kostet Rechenzeit (Plus öffnete verzögert, 10.11.)
    const raw = passPoint(ps);
    if (offLeg(a, b, raw) > reach + 400) continue;
    const p = snapToRoad(raw);
    if (offLeg(a, b, p) > reach) continue;
    if (angleAt(a, p, b) < MIN_ANGLE) continue;
    const extra = (haversine(a, p) + haversine(p, b) - direct) / 1000;
    out.push({ key: ps.id, name: ps.name, detail: `${ps.ele.toLocaleString('de-DE')} m, ${ps.region}`, p, extraMin: minutes(extra), pass: ps, level: passLevel(ps) });
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
    if (angleAt(a, entry, exit) < ROAD_ANGLE || angleAt(entry, exit, b) < ROAD_ANGLE) continue;
    let len = 0;
    for (let i = 1; i < r.line.length; i++) len += haversine(r.line[i - 1], r.line[i]);
    const extra = (haversine(a, entry) + len / ROAD + haversine(exit, b) - direct) / 1000;
    const dir = fwd ? r.line : [...r.line].reverse();
    const line = trimEnds(dir, 250);
    out.push({ key: r.id, name: r.name, detail: `Strecke, ${Math.round(len / 1000)} km`, p: line[0], exit: line[line.length - 1], line, extraMin: minutes(extra), road: r, level: learnedLevel(`road:${r.id}`, r.level ?? defaultLevel(r.kind)) });
  }
  // gleicher Name als Pass und als Strecke (etwa Juhöhe): die Strecke behalten
  const roads = new Set(out.filter((c) => c.road).map((c) => c.name));
  return out.filter((c) => c.road || !roads.has(c.name)).sort((x, y) => x.extraMin - y.extraMin);
}
