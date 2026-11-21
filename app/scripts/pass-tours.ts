/**
 * Runden für die Passseiten (Koray 21.11.2026): keine Touren von Hand, sondern beim Bauen der Webseite geplant.
 *
 * Je Pass: Startpunkte in sechs Richtungen in zwei Abständen um die Passhöhe (kurze und lange Runde). Geplant wird
 * Start, Passhöhe und zurück über einen Nachbarpass oder einen Wendepunkt quer zur Anfahrt, im Profil kurvig. Nur
 * echte Rundtouren: höchstens 8 % doppelt gefahren. Behalten
 * werden Runden, die wirklich über die Passhöhe führen, mit Fahrspaß ab 60; davon die drei besten mit verschiedenen
 * Startorten. Auf der Seite steht nur die gezeichnete Form (0 bis 100, ohne Koordinaten), Strecke,
 * Fahrzeit, Fahrspaß und der Name.
 *
 * Aufruf (braucht ROUTING_QA_KEY): npx tsx --tsconfig scripts/replay/tsconfig.json scripts/pass-tours.ts [ikone|bekannt] [ausgabe.json]
 */
import { writeFileSync } from 'node:fs';

import { tourFun } from '../src/lib/fun-score';
import { cumoPlan } from '../src/lib/cumo-routing';
import { doubledStretch } from '../src/lib/doubled';
import { photonFetch } from '../src/lib/photon';
import { PASSES, passesAlong, type Pass } from '../src/lib/passes';
import { flatten, haversine, type LatLon } from '../src/lib/tour';
import { routingHeaders } from '../src/lib/routing-auth';
import { DEFAULT_AVOID } from '../src/lib/valhalla';

/**
 * Start und Wendepunkt an echte Orte legen (erster Lauf 21.11.: geometrisch gesetzte Punkte lagen oft auf Gletschern
 * oder Seen, „Cannot find point“; Grimsel, Susten, Nufenen und Tourmalet ohne eine Runde). Tankstellen aus unseren
 * POI Kacheln stehen an Straßen in Orten; die nächste im Umkreis von 10 km ersetzt den Punkt.
 */
const POI_BASE = 'https://r1.cumodrive.de';
const tiles = new Map<string, Promise<{ la: number; lo: number }[]>>();
function tile(x: number, y: number) {
  const k = `${x}_${y}`;
  if (!tiles.has(k))
    tiles.set(
      k,
      fetch(`${POI_BASE}/poi/v1/tank/${k}.json`, { headers: routingHeaders() })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    );
  return tiles.get(k)!;
}
async function snapToPlace(p: LatLon): Promise<LatLon | null> {
  const x = Math.floor(p[1] * 10);
  const y = Math.floor(p[0] * 10);
  const rows = (await Promise.all([-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => tile(x + dx, y + dy))))).flat();
  let best: LatLon | null = null;
  let bestD = 10;
  for (const r of rows) {
    const d = Math.hypot(r.la - p[0], (r.lo - p[1]) * Math.cos((p[0] * Math.PI) / 180)) * 111.2;
    if (d < bestD) {
      bestD = d;
      best = [r.la, r.lo];
    }
  }
  return best;
}

async function nameIn(p: LatLon, lang: string): Promise<string> {
  try {
    const r = await photonFetch(`/reverse?lat=${p[0]}&lon=${p[1]}&lang=${lang}`);
    const pr = ((await r.json()) as { features: { properties: Record<string, string> }[] }).features[0]?.properties ?? {};
    return pr.city ?? pr.name ?? pr.district ?? 'Tal';
  } catch {
    return 'Tal';
  }
}

/**
 * Ortsname wie auf den Schildern (lang=default, sonst „Worms im Veltlin“ statt Bormio, Lauf 2 am 21.11.). Zweisprachige
 * Orte („Badia - Abtei“) auf Deutsch, ohne Kantonskürzel („Münster VS“).
 */
async function localName(p: LatLon): Promise<string> {
  const d = await nameIn(p, 'default');
  const n = d.includes(' - ') ? await nameIn(p, 'de') : d;
  return n.replace(/\s[A-Z]{2}$/, '');
}

/** Kurzer Passname für Rundennamen: ohne Klammer, bei langen Namen der bekannte Kurzname (Großglockner) */
function shortName(p: Pass): string {
  const base = p.name.replace(/\s*\(.*\)\s*/, '').trim();
  if (base.length <= 18) return base;
  return p.names.find((n) => !n.includes('(') && n.length <= 18 && base.includes(n)) ?? base.split(' ')[0];
}

const tier = (process.argv[2] ?? 'ikone') as Pass['tier'];
const outFile = process.argv[3] ?? 'pass-tours.json';
const MIN_FUN = 60;
/**
 * Nur echte Rundtouren (Koray 21.11.): höchstens so viel doppelt gefahren, sonst ist es Hin und zurück. Lauf 2 fuhr bei
 * 40 von 52 Runden mehr als die Hälfte doppelt, weil Start und Wendepunkt auf verschiedenen Seiten des Passes lagen.
 */
const MAX_DOUBLED = 0.08;
const BEARINGS = [0, 60, 120, 180, 240, 300];
const SIZES = [
  { id: 'kurz', km: 12 },
  { id: 'lang', km: 26 },
] as const;
const TIER_RANK: Record<string, number> = { ikone: 0, bekannt: 1, mittel: 2 };

const offset = (p: LatLon, deg: number, km: number): LatLon => {
  const r = (deg * Math.PI) / 180;
  return [p[0] + (km / 111.2) * Math.cos(r), p[1] + (km / (111.2 * Math.cos((p[0] * Math.PI) / 180))) * Math.sin(r)];
};

/** Form ohne Koordinaten: auf 0 bis 100 gestreckt, gleiche Seitenverhältnisse, etwa 60 Punkte */
function shapeOf(line: LatLon[]): [number, number][] {
  const step = Math.max(1, Math.floor(line.length / 60));
  const s = line.filter((_, i) => i % step === 0 || i === line.length - 1);
  const k = Math.cos((s[0][0] * Math.PI) / 180);
  const la = s.map((p) => p[0]);
  const lo = s.map((p) => p[1]);
  const w = (Math.max(...lo) - Math.min(...lo)) * k;
  const h = Math.max(...la) - Math.min(...la);
  const m = Math.max(w, h) || 1;
  return s.map((p) => [+(((p[1] - Math.min(...lo)) * k) / m * 100 + (100 - (w / m) * 100) / 2).toFixed(1), +(((Math.max(...la) - p[0]) / m) * 100 + (100 - (h / m) * 100) / 2).toFixed(1)]);
}

type Candidate = { size: string; start: LatLon; via: LatLon; km: number; minutes: number; fun: number; others: Pass[]; form: [number, number][] };

/**
 * Rückweg über einen zweiten Pass: Start auf einer Seite, über die Passhöhe, über einen bekannten Pass in der Nähe zurück.
 * Dazu die freie Runde (Start, Passhöhe, Wendepunkt, Start), die der Planer gegen doppelte Stücke nachbessert.
 */
const NEAR_KM = 45;
async function candidatesFor(pass: Pass): Promise<Candidate[]> {
  const top: LatLon = [pass.lat, pass.lon];
  const neighbours = PASSES.filter((q) => q.id !== pass.id && q.tier !== 'mittel' && haversine(top, [q.lat, q.lon]) / 1000 < NEAR_KM);
  const out: Candidate[] = [];
  const plan = async (size: string, start: LatLon, mid: LatLon[]) => {
    try {
      const t = await cumoPlan(pass.name, [start, top, ...mid, start], 'kurvig', DEFAULT_AVOID, undefined, [], false);
      const line = flatten(t).map((x) => x.p);
      const along = passesAlong(PASSES, line).map((x) => x.pass);
      if (!along.some((q) => q.id === pass.id)) return;
      if (doubledStretch(line).km > t.laenge_km * MAX_DOUBLED) return;
      const fun = tourFun(line)?.score ?? 0;
      if (fun < MIN_FUN || t.laenge_km < 40 || t.laenge_km > 220) return;
      const others = along.filter((q) => q.id !== pass.id).sort((x, y) => TIER_RANK[x.tier] - TIER_RANK[y.tier]);
      out.push({ size, start: line[0], via: mid[mid.length - 1], km: Math.round(t.laenge_km), minutes: Math.round(t.minutes), fun, others, form: shapeOf(line) });
    } catch {
      /* kein Weg */
    }
  };
  for (const size of SIZES) {
    const jobs: Promise<void>[] = [];
    for (const a of BEARINGS) {
      jobs.push(
        (async () => {
          const start = await snapToPlace(offset(top, a, size.km));
          if (!start) return;
          // über einen Nachbarpass zurück
          for (const q of neighbours) await plan(size.id, start, [[q.lat, q.lon]]);
          // frei: Wendepunkt quer zur Anfahrt, damit der Rückweg eine andere Straße nehmen kann
          for (const d of [90, 270]) {
            const via = await snapToPlace(offset(top, (a + d) % 360, size.km));
            if (via) await plan(size.id, start, [via]);
          }
        })(),
      );
    }
    await Promise.all(jobs);
  }
  return out;
}

const far = (a: LatLon, b: LatLon) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 0.7) > 0.05;

(async () => {
  const list = PASSES.filter((p) => p.tier === tier);
  const result: Record<string, unknown> = {};
  for (const pass of list) {
    const c = (await candidatesFor(pass)).sort((a, b) => b.fun - a.fun);
    // die drei besten mit verschiedenen Startorten (nicht zweimal derselbe Ort, Lauf 2 am 21.11.)
    const pick: (Candidate & { from: string })[] = [];
    for (const x of c) {
      if (pick.length >= 3) break;
      if (!pick.every((p) => far(p.start, x.start))) continue;
      const from = await localName(x.start);
      if (pick.some((p) => p.from === from)) continue;
      pick.push({ ...x, from });
    }
    const tours = [];
    for (const t of pick.sort((a, b) => a.km - b.km)) {
      const from = t.from;
      const also = t.others[0];
      tours.push({
        name: also ? `Runde ab ${from} über ${shortName(pass)} und ${shortName(t.others[0])}` : `Runde ab ${from} über ${shortName(pass)}`,
        km: t.km,
        minutes: t.minutes,
        fun: t.fun,
        form: t.form,
        // zum Öffnen im Planer: nur Start, Pass und Wendepunkt, die Strecke rechnet der Planer neu
        open: { start: t.start.map((v) => +v.toFixed(3)), via: [[pass.lat, pass.lon], t.via.map((v) => +v.toFixed(3))] },
      });
    }
    result[pass.id] = { name: pass.name, candidates: c.length, tours };
    console.log(`${pass.name}: ${c.length} Kandidaten, ${tours.map((t) => `${t.name} (${t.km} km, ${t.fun})`).join(' | ')}`);
  }
  writeFileSync(outFile, JSON.stringify(result, null, 1));
})();
