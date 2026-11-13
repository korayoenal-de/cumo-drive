/**
 * Prüfskript (13.11.): Abbiegehinweise vom eigenen GraphHopper gegen Valhalla.
 *
 * Heute plant GraphHopper die Linie, die Wegbeschreibung kommt aber von Valhalla (trace_route über dieselbe
 * Linie, wie in lib/navigation/route.ts). Frage: Reichen die Anweisungen von GraphHopper, damit wir Valhalla
 * für die Navigation nicht mehr brauchen? Das Skript plant Testrouten auf dem eigenen Server (Profil kurvig),
 * gleicht dieselbe Linie bei Valhalla ab und vergleicht die echten Manöver (ohne "weiter geradeaus"):
 *   gleich       beide melden an derselben Stelle (60 m) dieselbe Richtung
 *   anders       beide melden etwas, aber verschieden (links gegen leicht links, Ausfahrt 2 gegen 3)
 *   nur GH       Valhalla schweigt dort
 *   nur Valhalla GraphHopper schweigt dort
 * Starten (Ordner app): npx tsx scripts/compare-instructions.ts [bericht.md]
 * Ohne Ziel landet der Bericht in scripts/compare-instructions.md. Valhalla ist der öffentliche FOSSGIS
 * Server (eine Anfrage je Sekunde), später der eigene: VALHALLA=https://… npx tsx …
 */
import { writeFileSync } from 'node:fs';

const GH = process.env.GH ?? 'https://13-140-213-164.sslip.io';
const VALHALLA = process.env.VALHALLA ?? 'https://valhalla1.openstreetmap.de';
const NEAR_M = 60;

type P = [number, number]; // lat, lon
type Case = { name: string; pts: P[] };

/** Testrouten quer durch das Gebiet: Mittelgebirge, Alpenpässe, Orte mit Kreisverkehren, Autobahnnähe */
const CASES: Case[] = [
  { name: 'Weinstraße Pfalz', pts: [[49.3255, 8.1366], [49.2135, 7.9932]] },
  { name: 'Schwarzwaldhochstraße', pts: [[48.7606, 8.2391], [48.5408, 8.1952]] },
  { name: 'Allgäu Oberjoch', pts: [[47.5615, 10.4130], [47.5129, 10.3964], [47.4915, 10.2829]] },
  { name: 'Timmelsjoch', pts: [[46.9417, 11.0245], [46.8306, 11.1673]] },
  { name: 'Stilfser Joch', pts: [[46.6266, 10.4339], [46.5288, 10.4527], [46.4673, 10.3692]] },
  { name: 'Furka und Grimsel', pts: [[46.6340, 8.5946], [46.5726, 8.4152], [46.5615, 8.3364]] },
  { name: 'Vogesen Route des Crêtes', pts: [[48.0590, 7.0270], [47.9013, 7.0991]] },
  { name: 'Gardasee Westufer', pts: [[45.6303, 10.5607], [45.8857, 10.8418]] },
  { name: 'Kreisverkehre Elsass', pts: [[48.5734, 7.7521], [48.4060, 7.4500]] },
  { name: 'Slowenien Vršič', pts: [[46.4848, 13.7814], [46.3365, 13.6526]] },
];

type Turn = { at: P; cls: string; exit?: number; text: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dist(a: P, b: P): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 111195 * k);
}

/** GraphHopper sign: -3 scharf links … 3 scharf rechts, 6 Kreisverkehr, ±7 halten, -8 wenden, 4 Ziel, 5 Zwischenziel */
function ghClass(sign: number): string | null {
  const m: Record<number, string> = { [-3]: 'scharf links', [-2]: 'links', [-1]: 'leicht links', 1: 'leicht rechts', 2: 'rechts', 3: 'scharf rechts', 6: 'kreisverkehr', [-7]: 'links halten', 7: 'rechts halten', [-8]: 'wenden', 8: 'wenden' };
  return m[sign] ?? null;
}

/** Valhalla maneuver type, siehe Valhalla API Dokumentation */
function vClass(type: number): string | null {
  const m: Record<number, string> = {
    9: 'leicht rechts', 10: 'rechts', 11: 'scharf rechts', 12: 'wenden', 13: 'wenden', 14: 'scharf links', 15: 'links', 16: 'leicht links',
    18: 'rechts halten', 19: 'links halten', 20: 'rechts halten', 21: 'links halten', 23: 'rechts halten', 24: 'links halten', 26: 'kreisverkehr',
  };
  return m[type] ?? null;
}

function decode6(s: string): P[] {
  const out: P[] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < s.length) {
    for (const k of [0, 1]) {
      let shift = 0, res = 0, b: number;
      do {
        b = s.charCodeAt(i++) - 63;
        res |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d;
      else lon += d;
    }
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}

async function ghRoute(c: Case): Promise<{ line: P[]; turns: Turn[]; km: number }> {
  const r = await fetch(`${GH}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: c.pts.map(([la, lo]) => [lo, la]), profile: 'kurvig', instructions: true, locale: 'de', points_encoded: false }),
  });
  const j = (await r.json()) as { paths?: { distance: number; points: { coordinates: [number, number][] }; instructions: { sign: number; text: string; interval: [number, number]; exit_number?: number }[] }[]; message?: string };
  if (!j.paths?.[0]) throw new Error(`GraphHopper: ${j.message ?? r.status}`);
  const p = j.paths[0];
  const line = p.points.coordinates.map(([lo, la]) => [la, lo] as P);
  const turns: Turn[] = [];
  for (const ins of p.instructions) {
    const cls = ghClass(ins.sign);
    if (cls) turns.push({ at: line[ins.interval[0]], cls, exit: ins.exit_number, text: ins.text });
  }
  return { line, turns, km: p.distance / 1000 };
}

async function valhallaTurns(line: P[]): Promise<Turn[]> {
  // höchstens etwa 2000 Punkte, gleichmäßig ausgedünnt
  const step = Math.max(1, Math.ceil(line.length / 2000));
  const shape = line.filter((_, i) => i % step === 0 || i === line.length - 1).map(([lat, lon]) => ({ lat, lon }));
  const r = await fetch(`${VALHALLA}/trace_route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shape, costing: 'auto', shape_match: 'map_snap', directions_options: { language: 'de-DE', units: 'kilometers' } }),
  });
  const j = (await r.json()) as { trip?: { legs: { shape: string; maneuvers: { type: number; instruction: string; begin_shape_index: number; roundabout_exit_count?: number }[] }[] }; error?: string };
  if (!j.trip) throw new Error(`Valhalla: ${j.error ?? r.status}`);
  const turns: Turn[] = [];
  for (const leg of j.trip.legs) {
    const pts = decode6(leg.shape);
    for (const m of leg.maneuvers) {
      const cls = vClass(m.type);
      if (cls) turns.push({ at: pts[m.begin_shape_index], cls, exit: m.roundabout_exit_count, text: m.instruction });
    }
  }
  return turns;
}

/** grob: links und leicht links zählen als "ähnlich", nur Seitenwechsel oder Kreisverkehr gegen Abbiegen als "anders" */
function side(cls: string): string {
  if (cls.includes('links')) return 'L';
  if (cls.includes('rechts')) return 'R';
  return cls;
}

type Row = { name: string; km: number; gh: number; v: number; same: number; similar: number; diff: number; ghOnly: number; vOnly: number; notes: string[] };

function compare(name: string, km: number, gh: Turn[], v: Turn[]): Row {
  const used = new Set<number>();
  const row: Row = { name, km, gh: gh.length, v: v.length, same: 0, similar: 0, diff: 0, ghOnly: 0, vOnly: 0, notes: [] };
  const where = (p: P) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  for (const g of gh) {
    let best = -1;
    let bestD = NEAR_M;
    v.forEach((t, i) => {
      if (used.has(i)) return;
      const d = dist(g.at, t.at);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) {
      row.ghOnly++;
      row.notes.push(`nur GH ${where(g.at)}: ${g.text}`);
      continue;
    }
    used.add(best);
    const t = v[best];
    if (g.cls === t.cls && (g.cls !== 'kreisverkehr' || !g.exit || !t.exit || g.exit === t.exit)) row.same++;
    else if (side(g.cls) === side(t.cls) && g.cls !== 'kreisverkehr') row.similar++;
    else {
      row.diff++;
      row.notes.push(`anders ${where(g.at)}: GH "${g.text}" / Valhalla "${t.text}"`);
    }
  }
  v.forEach((t, i) => {
    if (used.has(i)) return;
    row.vOnly++;
    row.notes.push(`nur Valhalla ${where(t.at)}: ${t.text}`);
  });
  return row;
}

async function main() {
  const out = process.argv[2] ?? 'scripts/compare-instructions.md';
  const rows: Row[] = [];
  for (const c of CASES) {
    try {
      const g = await ghRoute(c);
      await sleep(1100);
      const v = await valhallaTurns(g.line);
      await sleep(1100);
      const row = compare(c.name, g.km, g.turns, v);
      rows.push(row);
      console.log(`${c.name}: ${row.km.toFixed(0)} km, gleich ${row.same}, ähnlich ${row.similar}, anders ${row.diff}, nur GH ${row.ghOnly}, nur Valhalla ${row.vOnly}`);
    } catch (e) {
      console.log(`${c.name}: übersprungen (${(e as Error).message})`);
    }
  }
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const lines = [
    '# Abbiegehinweise: GraphHopper gegen Valhalla',
    '',
    `Stand ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, ${rows.length} Testrouten, Profil kurvig, Abstand für "dieselbe Stelle" ${NEAR_M} m.`,
    '',
    '| Route | km | GH | Valhalla | gleich | ähnlich | anders | nur GH | nur Valhalla |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.km.toFixed(0)} | ${r.gh} | ${r.v} | ${r.same} | ${r.similar} | ${r.diff} | ${r.ghOnly} | ${r.vOnly} |`),
    `| **Summe** | ${sum('km').toFixed(0)} | ${sum('gh')} | ${sum('v')} | ${sum('same')} | ${sum('similar')} | ${sum('diff')} | ${sum('ghOnly')} | ${sum('vOnly')} |`,
    '',
    '## Abweichungen im Einzelnen',
    '',
    ...rows.flatMap((r) => (r.notes.length ? [`### ${r.name}`, '', ...r.notes.map((n) => `* ${n}`), ''] : [])),
  ];
  writeFileSync(out, lines.join('\n'));
  console.log(`Bericht: ${out}`);
}

void main();
