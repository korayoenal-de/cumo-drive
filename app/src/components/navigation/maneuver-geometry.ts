/**
 * Geometrie aller Navigationssymbole, ohne React, damit App und Design System dieselben Formen nutzen
 * (scripts/nav-icons.mts erzeugt daraus die SVG Dateien fürs Design System).
 *
 * Pfeile werden wie mit einem Stift gefahren: geradeaus, Bogen, geradeaus, Spitze. Die Spitze ist ein
 * schlankes gleichschenkliges Dreieck (16 lang, 20 breit, Schaft 6). Der Schaft läuft unter die Spitze,
 * damit keine Lücke entsteht. Jeder Pfeil wird mit seiner Umgebung (schwache Straßen) im 64er Feld
 * zentriert, so wirken alle gleich groß. Varianten für links entstehen durch Spiegeln.
 */
import type { ManeuverKind } from '../../lib/navigation/types';

export type { ManeuverKind };

/** Alle Symbole: die Manöver aus dem Routing plus Varianten und Hinweise auf der Strecke. */
export type NavSymbol =
  | ManeuverKind
  | 'rechts_halten'
  | 'links_halten'
  | 'einfaedeln_rechts'
  | 'einfaedeln_links'
  | 'auffahrt_rechts'
  | 'auffahrt_links'
  | 'abfahrt_rechts'
  | 'abfahrt_links'
  | 'wenden_links'
  | 'wenden_rechts'
  | 'kreisverkehr_1'
  | 'kreisverkehr_2'
  | 'kreisverkehr_3'
  | 'kreisverkehr_4'
  | 'kreisverkehr_5'
  | 'kreisverkehr_verlassen'
  | 'faehre_an_bord'
  | 'faehre_verlassen'
  | 'ziel_links'
  | 'ziel_rechts'
  | 'kehre'
  | 'passhoehe'
  | 'sperrung'
  | 'engstelle'
  | 'tankstelle'
  | 'aussicht'
  | 'sammelpunkt'
  | 'blitzer';

export const SYMBOL_NAMES: Record<NavSymbol, string> = {
  start: 'Start',
  ziel: 'Ziel',
  zwischenziel: 'Zwischenziel',
  geradeaus: 'Geradeaus',
  leicht_links: 'Leicht links',
  links: 'Links',
  scharf_links: 'Scharf links',
  leicht_rechts: 'Leicht rechts',
  rechts: 'Rechts',
  scharf_rechts: 'Scharf rechts',
  wenden: 'Wenden',
  kreisverkehr: 'Kreisverkehr',
  auffahrt: 'Auffahrt',
  abfahrt: 'Abfahrt',
  rechts_halten: 'Rechts halten',
  links_halten: 'Links halten',
  einfaedeln_rechts: 'Einfädeln rechts',
  einfaedeln_links: 'Einfädeln links',
  auffahrt_rechts: 'Auffahrt rechts',
  auffahrt_links: 'Auffahrt links',
  abfahrt_rechts: 'Abfahrt rechts',
  abfahrt_links: 'Abfahrt links',
  wenden_links: 'Wenden links',
  wenden_rechts: 'Wenden rechts',
  kreisverkehr_1: 'Kreisverkehr 1. Ausfahrt',
  kreisverkehr_2: 'Kreisverkehr 2. Ausfahrt',
  kreisverkehr_3: 'Kreisverkehr 3. Ausfahrt',
  kreisverkehr_4: 'Kreisverkehr 4. Ausfahrt',
  kreisverkehr_5: 'Kreisverkehr 5. Ausfahrt',
  kreisverkehr_verlassen: 'Kreisverkehr verlassen',
  faehre_an_bord: 'Fähre an Bord',
  faehre_verlassen: 'Fähre verlassen',
  ziel_links: 'Ziel links',
  ziel_rechts: 'Ziel rechts',
  kehre: 'Kehre',
  passhoehe: 'Passhöhe',
  sperrung: 'Sperrung',
  engstelle: 'Engstelle',
  tankstelle: 'Tankstelle Super Plus',
  aussicht: 'Aussichtspunkt',
  sammelpunkt: 'Sammelpunkt',
  blitzer: 'Blitzer',
};

/** ink: Hauptfarbe, faint: Hauptfarbe schwach (Umgebung), ground: Untergrund, signal: Akzent */
export type Paint = 'ink' | 'faint' | 'ground' | 'signal';
export type Shape =
  | { t: 'stroke'; d: string; w: number; paint: Paint; len?: number }
  | { t: 'fill'; d: string; paint: Paint; evenodd?: boolean; round?: boolean };

export type IconGeometry = {
  shapes: Shape[];
  /** Spiegeln an der senkrechten Mitte (Varianten für links) */
  mirror?: boolean;
  /** Richtung auf dem Bildschirm (nach dem Spiegeln), in die das Symbol beim Näherkommen anstupst (Einheitsvektor, y nach unten). null: nur pulsieren */
  nudge: { x: number; y: number } | null;
};

export const STROKE = 6;
const HEAD_LEN = 16;
const HEAD_HALF = 10;
const UNDER = HEAD_LEN * 0.6;
const SIZE = 64;

type Pt = { x: number; y: number };
const f = (v: number) => {
  const s = (Math.round(v * 100) / 100).toString();
  return s === '-0' ? '0' : s;
};
/** Einheitsvektor zu einer Richtung in Grad (0 nach oben, positiv im Uhrzeigersinn) */
const unit = (deg: number): Pt => ({ x: Math.sin((deg * Math.PI) / 180), y: -Math.cos((deg * Math.PI) / 180) });
const add = (p: Pt, v: Pt, k = 1): Pt => ({ x: p.x + v.x * k, y: p.y + v.y * k });

/** Spitze mit Spitze bei tip in Richtung heading. */
function headPts(tip: Pt, heading: number, len = HEAD_LEN, half = HEAD_HALF): Pt[] {
  const d = unit(heading);
  const n = unit(heading + 90);
  const base = add(tip, d, -len);
  return [tip, add(base, n, half), add(base, n, -half)];
}

/**
 * Stift: zeichnet eine Linie aus Geraden und Bögen und merkt sich alle Punkte für die Begrenzung.
 */
class Pen {
  p: Pt;
  h: number;
  d: string;
  pts: Pt[];
  len = 0;
  constructor(start: Pt, heading = 0) {
    this.p = start;
    this.h = heading;
    this.d = `M ${f(start.x)} ${f(start.y)}`;
    this.pts = [start];
  }
  fwd(len: number) {
    this.p = add(this.p, unit(this.h), len);
    this.len += Math.abs(len);
    this.d += ` L ${f(this.p.x)} ${f(this.p.y)}`;
    this.pts.push(this.p);
    return this;
  }
  /** Bogen mit Radius r, Drehung a in Grad (positiv nach rechts) */
  arc(r: number, a: number) {
    const s = Math.sign(a);
    const c = add(this.p, unit(this.h + 90 * s), r);
    const at = (h: number) => add(c, unit(h - 90 * s), r);
    for (let i = 1; i <= 8; i++) this.pts.push(at(this.h + (a * i) / 8));
    const end = at(this.h + a);
    this.d += ` A ${f(r)} ${f(r)} 0 ${Math.abs(a) > 180 ? 1 : 0} ${s > 0 ? 1 : 0} ${f(end.x)} ${f(end.y)}`;
    this.p = end;
    this.len += (Math.abs(a) * Math.PI * r) / 180;
    this.h += a;
    return this;
  }
}

type Part = { pts: Pt[]; emit: (o: Pt) => Shape };

/** Pfeil aus einem Stift: Schaft bis unter die Spitze, dann die Spitze. */
function arrow(pen: Pen, post = 0, paint: Paint = 'ink'): Part[] {
  pen.fwd(post + HEAD_LEN - UNDER);
  const tip = add(pen.p, unit(pen.h), UNDER);
  const head = headPts(tip, pen.h);
  const shaftD = pen.d;
  const len = pen.len;
  return [
    { pts: pen.pts, emit: (o) => ({ t: 'stroke', d: shift(shaftD, o), w: STROKE, paint, len }) },
    { pts: head, emit: (o) => ({ t: 'fill', d: poly(head, o), paint, round: true }) },
  ];
}

function line(pen: Pen, paint: Paint = 'faint', w = STROKE): Part {
  const d = pen.d;
  return { pts: pen.pts, emit: (o) => ({ t: 'stroke', d: shift(d, o), w, paint }) };
}

const poly = (pts: Pt[], o: Pt) => 'M ' + pts.map((p) => `${f(p.x + o.x)} ${f(p.y + o.y)}`).join(' L ') + ' Z';

/** Verschiebt alle Koordinaten einer Pfadbeschreibung (nur M, L, A mit absoluten Werten). */
function shift(d: string, o: Pt): string {
  const tok = d.split(' ');
  const out: string[] = [];
  let cmd = '';
  let i = 0;
  while (i < tok.length) {
    const t = tok[i];
    if (/^[MLA]$/.test(t)) {
      cmd = t;
      out.push(t);
      i++;
      continue;
    }
    if (cmd === 'A') {
      out.push(tok[i], tok[i + 1], tok[i + 2], tok[i + 3], tok[i + 4], f(+tok[i + 5] + o.x), f(+tok[i + 6] + o.y));
      i += 7;
    } else {
      out.push(f(+tok[i] + o.x), f(+tok[i + 1] + o.y));
      i += 2;
    }
  }
  return out.join(' ');
}

/** Setzt Teile mittig ins Feld. */
function compose(parts: Part[], extra = 0): Shape[] {
  const all = parts.flatMap((p) => p.pts);
  const half = STROKE / 2 + extra;
  const minX = Math.min(...all.map((p) => p.x)) - half;
  const maxX = Math.max(...all.map((p) => p.x)) + half;
  const minY = Math.min(...all.map((p) => p.y)) - half;
  const maxY = Math.max(...all.map((p) => p.y)) + half;
  const o = { x: SIZE / 2 - (minX + maxX) / 2, y: SIZE / 2 - (minY + maxY) / 2 };
  return parts.map((p) => p.emit(o));
}

const O = { x: 0, y: 0 };

/** Abbiegen um angle Grad (positiv rechts). */
function turn(angle: number): Shape[] {
  const a = Math.abs(angle);
  const pen = new Pen(O);
  if (a === 0) return compose(arrow(pen.fwd(24)));
  // Länge vor dem Bogen, Radius, Stück nach dem Bogen
  const [pre, r, post] = a <= 50 ? [20, 14, 6] : a <= 100 ? [18, 9, 6] : [24, 8, 3];
  return compose(arrow(pen.fwd(pre).arc(r, angle), post));
}

/** Gabel: gewählter Ast nach rechts, anderer Ast schwach nach links. */
function fork(): Shape[] {
  const other = new Pen(O).fwd(18).arc(16, -32).fwd(16);
  return compose([line(other), ...arrow(new Pen(O).fwd(18).arc(16, 32), 6)]);
}

/** Auffahrt rechts: von der Landstraße (schmal, schwach) rechts auf die Rampe. */
function rampOn(): Shape[] {
  const road = new Pen(O).fwd(50);
  return compose([line(road), ...arrow(new Pen(O).fwd(16).arc(18, 45), 4)]);
}

/** Abfahrt rechts: von der Autobahn (breites Band, schwach) rechts ab. */
function rampOff(): Shape[] {
  const road = new Pen(O).fwd(50);
  return compose([line(road, 'faint', 16), ...arrow(new Pen(O).fwd(16).arc(18, 45), 4)], 5);
}

/** Einfädeln rechts: aus der endenden Spur links hinüber ins breite Band. */
function merge(): Shape[] {
  const band = new Pen({ x: 14, y: 0 }).fwd(50);
  const ending = new Pen({ x: -6, y: 0 }).fwd(16);
  const r = 14;
  const a = 40;
  const k = (20 - 2 * r * (1 - Math.cos((a * Math.PI) / 180))) / Math.sin((a * Math.PI) / 180);
  const pen = new Pen({ x: -6, y: 0 }).fwd(8).arc(r, a).fwd(k).arc(r, -a);
  return compose([line(band, 'faint', 16), line(ending, 'faint'), ...arrow(pen, 4)], 5);
}

/** Wenden über links: hoch, Bogen, wieder runter. */
function uTurn(): Shape[] {
  return compose(arrow(new Pen(O).fwd(22).arc(11, -180).fwd(4), 4));
}

/** Kreisverkehr (Rechtsverkehr, gegen den Uhrzeigersinn), Ausfahrt in Richtung exit Grad. */
function roundabout(exit: number | null, withEntry = true): Shape[] {
  const R = 11;
  const c = { x: 0, y: -14 - R };
  const ring = new Pen(add(c, unit(180), R), 90).arc(R, -180).arc(R, -180);
  const parts: Part[] = [line(ring)];
  if (exit != null) {
    if (withEntry) {
      const pen = new Pen(O).fwd(14);
      // dem Ring folgen: von unten (180) gegen den Uhrzeigersinn bis zur Ausfahrt
      let sweep = 180 - exit;
      if (sweep <= 0) sweep += 360;
      pen.h = 90;
      pen.arc(R, -sweep);
      parts.push(...arrowFrom(pen, add(c, unit(exit), R), exit));
    } else {
      // nur das letzte Stück auf dem Ring, dann hinaus
      const pen = new Pen(add(c, unit(exit + 100), R), exit + 100 - 90);
      pen.arc(R, -100);
      parts.push(...arrowFrom(pen, add(c, unit(exit), R), exit));
    }
  }
  return compose(parts);
}

/** Ring Abschnitt plus Ausfahrt: Bogen als eigener Strich, Ausfahrt als Pfeil. */
function arrowFrom(pen: Pen, exitPt: Pt, exit: number): Part[] {
  const ringPart: Part = { pts: pen.pts, emit: lineEmit(pen.d, pen.len) };
  const out = new Pen(exitPt, exit).fwd(4);
  return [ringPart, ...arrow(out, 2)];
}
const lineEmit = (d: string, len: number) => (o: Pt): Shape => ({ t: 'stroke', d: shift(d, o), w: STROKE, paint: 'ink', len });

/** Kehre: schräg hoch, enge Kehre, schräg zurück hoch. */
function hairpin(): Shape[] {
  return compose(arrow(new Pen(O, 62).fwd(20).arc(7, -124).fwd(16), 2));
}

const circle = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

/** Kleine Stecknadel mit Spitze bei (x, y). */
const pin = (x: number, y: number, s: number): Shape => ({
  t: 'fill',
  evenodd: true,
  paint: 'ink',
  d: `M ${x} ${y} C ${x} ${y} ${x - 18 * s} ${y - 20 * s} ${x - 18 * s} ${y - 32 * s} A ${18 * s} ${18 * s} 0 0 1 ${x + 18 * s} ${y - 32 * s} C ${x + 18 * s} ${y - 20 * s} ${x} ${y} ${x} ${y} Z ${circle(x, y - 32 * s, 7 * s)}`,
});

function ferry(up: boolean): Shape[] {
  const arrowPen = up ? new Pen({ x: 32, y: 28 }, 0).fwd(1) : new Pen({ x: 32, y: 4 }, 180).fwd(1);
  arrowPen.fwd(10 - UNDER * 0.5);
  const tip = add(arrowPen.p, unit(arrowPen.h), 6);
  return [
    { t: 'fill', paint: 'ink', d: 'M 8 38 H 56 L 49 50 H 15 Z' },
    { t: 'fill', paint: 'ink', d: 'M 20 30 H 44 V 38 H 20 Z' },
    { t: 'stroke', paint: 'faint', w: 3, d: 'M 8 57 Q 14 53 20 57 Q 26 61 32 57 Q 38 53 44 57 Q 50 61 56 57' },
    { t: 'stroke', paint: 'ink', w: 4, d: arrowPen.d },
    { t: 'fill', paint: 'ink', round: true, d: poly(headPts(tip, arrowPen.h, 10, 7), O) },
  ];
}

function sideDestination(): Shape[] {
  return [{ t: 'stroke', d: 'M 22 60 L 22 4', w: STROKE, paint: 'faint' }, pin(44, 46, 0.95)];
}

export function symbolGeometry(sym: NavSymbol): IconGeometry {
  switch (sym) {
    case 'geradeaus':
      return { shapes: turn(0), nudge: unit(0) };
    case 'leicht_rechts':
    case 'leicht_links':
      return { shapes: turn(45), mirror: sym === 'leicht_links', nudge: unit(sym === 'leicht_links' ? -45 : 45) };
    case 'rechts':
    case 'links':
      return { shapes: turn(90), mirror: sym === 'links', nudge: unit(sym === 'links' ? -90 : 90) };
    case 'scharf_rechts':
    case 'scharf_links':
      return { shapes: turn(135), mirror: sym === 'scharf_links', nudge: unit(sym === 'scharf_links' ? -135 : 135) };
    case 'rechts_halten':
    case 'links_halten':
      return { shapes: fork(), mirror: sym === 'links_halten', nudge: unit(sym === 'links_halten' ? -32 : 32) };
    case 'auffahrt':
    case 'auffahrt_rechts':
    case 'auffahrt_links':
      return { shapes: rampOn(), mirror: sym === 'auffahrt_links', nudge: unit(sym === 'auffahrt_links' ? -45 : 45) };
    case 'abfahrt':
    case 'abfahrt_rechts':
    case 'abfahrt_links':
      return { shapes: rampOff(), mirror: sym === 'abfahrt_links', nudge: unit(sym === 'abfahrt_links' ? -45 : 45) };
    case 'einfaedeln_rechts':
    case 'einfaedeln_links':
      return { shapes: merge(), mirror: sym === 'einfaedeln_links', nudge: unit(0) };
    case 'wenden':
    case 'wenden_links':
    case 'wenden_rechts':
      return { shapes: uTurn(), mirror: sym === 'wenden_rechts', nudge: unit(180) };
    case 'kreisverkehr':
      return { shapes: roundabout(30), nudge: unit(30) };
    case 'kreisverkehr_1':
    case 'kreisverkehr_2':
    case 'kreisverkehr_3':
    case 'kreisverkehr_4':
    case 'kreisverkehr_5': {
      const exit = ROUNDABOUT_EXITS[Number(sym.slice(-1)) - 1];
      return { shapes: roundabout(exit), nudge: unit(exit) };
    }
    case 'kreisverkehr_verlassen':
      return { shapes: roundabout(0, false), nudge: unit(0) };
    case 'kehre':
      return { shapes: hairpin(), nudge: unit(-62) };
    case 'faehre_an_bord':
      return { shapes: ferry(false), nudge: unit(180) };
    case 'faehre_verlassen':
      return { shapes: ferry(true), nudge: unit(0) };
    case 'ziel_rechts':
    case 'ziel_links':
      return { shapes: sideDestination(), mirror: sym === 'ziel_links', nudge: null };
    case 'ziel': {
      const cells = [[21, 8], [35, 8], [28, 13.5], [42, 13.5], [21, 19], [35, 19], [28, 24.5], [42, 24.5]];
      return {
        shapes: [
          { t: 'stroke', d: 'M 18 58 L 18 8', w: STROKE, paint: 'ink' },
          { t: 'fill', d: 'M 21 8 H 49 V 30 H 21 Z', paint: 'ground' },
          { t: 'stroke', d: 'M 21 8 H 49 V 30 H 21 Z', w: 3, paint: 'ink' },
          { t: 'fill', d: cells.map(([x, y]) => `M ${x} ${y} h 7 v 5.5 h -7 Z`).join(' '), paint: 'ink' },
        ],
        nudge: null,
      };
    }
    case 'zwischenziel':
      return { shapes: [pin(32, 58, 1)], nudge: null };
    case 'passhoehe':
      return {
        shapes: [
          { t: 'fill', paint: 'ink', d: 'M 4 56 L 22 28 L 30 38 L 42 18 L 60 56 Z' },
          { t: 'stroke', paint: 'ink', w: 3, d: 'M 42 19 L 42 4' },
          { t: 'fill', paint: 'ink', d: 'M 42 4 L 54 8 L 42 12 Z' },
        ],
        nudge: null,
      };
    case 'sperrung':
      return {
        shapes: [
          { t: 'stroke', paint: 'ink', w: 5, d: 'M 16 34 L 16 58 M 48 34 L 48 58' },
          { t: 'fill', paint: 'ink', d: 'M 6 18 H 58 V 34 H 6 Z' },
          { t: 'fill', paint: 'ground', d: 'M 12 34 L 20 18 H 27 L 19 34 Z M 28 34 L 36 18 H 43 L 35 34 Z M 44 34 L 52 18 H 58 V 19 L 51 34 Z' },
        ],
        nudge: null,
      };
    case 'engstelle':
      return {
        shapes: [{ t: 'stroke', paint: 'ink', w: STROKE, d: 'M 14 60 L 14 42 L 24 26 L 24 4 M 50 60 L 50 42 L 40 26 L 40 4' }],
        nudge: null,
      };
    case 'tankstelle':
      return {
        shapes: [
          { t: 'fill', paint: 'ink', evenodd: true, d: 'M 10 14 A 5 5 0 0 1 15 9 H 33 A 5 5 0 0 1 38 14 V 54 H 10 Z M 15 15 H 33 V 27 H 15 Z' },
          { t: 'stroke', paint: 'ink', w: 4, d: 'M 6 56 H 42 M 38 26 H 44 V 44 A 4 4 0 0 0 52 44 V 22 L 46 15' },
          { t: 'stroke', paint: 'ink', w: 4, d: 'M 54 3 V 15 M 48 9 H 60' },
        ],
        nudge: null,
      };
    case 'aussicht':
      return {
        shapes: [
          { t: 'fill', paint: 'ink', evenodd: true, d: `${circle(18, 40, 12)} ${circle(18, 40, 6)} ${circle(46, 40, 12)} ${circle(46, 40, 6)}` },
          { t: 'fill', paint: 'ink', d: 'M 9 32 L 12 16 H 24 L 27 32 Z M 37 32 L 40 16 H 52 L 55 32 Z M 26 24 H 38 V 36 H 26 Z' },
        ],
        nudge: null,
      };
    case 'sammelpunkt':
      return {
        shapes: [
          { t: 'fill', paint: 'faint', d: `${circle(13, 25, 6)} M 2 50 A 11 11 0 0 1 24 50 Z ${circle(51, 25, 6)} M 40 50 A 11 11 0 0 1 62 50 Z` },
          { t: 'stroke', paint: 'ground', w: 4, d: `${circle(32, 21, 8)} M 17 56 A 15 15 0 0 1 47 56 Z` },
          { t: 'fill', paint: 'ink', d: `${circle(32, 21, 8)} M 17 56 A 15 15 0 0 1 47 56 Z` },
        ],
        nudge: null,
      };
    case 'blitzer':
      return {
        shapes: [
          { t: 'stroke', paint: 'ink', w: STROKE, d: 'M 24 38 L 24 60' },
          { t: 'fill', paint: 'ink', evenodd: true, d: `M 6 18 A 4 4 0 0 1 10 14 H 38 A 4 4 0 0 1 42 18 V 34 A 4 4 0 0 1 38 38 H 10 A 4 4 0 0 1 6 34 Z ${circle(20, 26, 7)}` },
          { t: 'fill', paint: 'ink', d: circle(20, 26, 3) },
          { t: 'stroke', paint: 'ink', w: 3.5, d: 'M 48 18 L 58 13 M 48 26 H 60 M 48 34 L 58 39' },
        ],
        nudge: null,
      };
    default:
      // start
      return {
        shapes: [
          { t: 'stroke', d: `M 10 32 A 22 22 0 1 0 54 32 A 22 22 0 1 0 10 32`, w: STROKE, paint: 'ink' },
          { t: 'fill', d: 'M 32 18 L 44 44 L 32 37 L 20 44 Z', paint: 'signal' },
        ],
        nudge: null,
      };
  }
}

/** Ausfahrtrichtung je Nummer, gegen den Uhrzeigersinn: rechts, schräg geradeaus, schräg links, links, fast zurück */
export const ROUNDABOUT_EXITS = [90, 30, -30, -90, -140];

/** Symbol für ein Manöver, im Kreisverkehr mit Ausfahrt Nummer. */
export function symbolFor(kind: ManeuverKind, exit?: number): NavSymbol {
  if (kind === 'kreisverkehr' && exit != null && exit >= 1 && exit <= 5) return `kreisverkehr_${exit}` as NavSymbol;
  return kind;
}

/** Abstand, ab dem das Symbol animiert: 150 m, bei schneller Fahrt etwa 8 Sekunden vorher. */
export function soonThresholdM(speedKmh: number | null): number {
  if (speedKmh == null) return 150;
  return Math.max(150, Math.min(400, (speedKmh / 3.6) * 8));
}
