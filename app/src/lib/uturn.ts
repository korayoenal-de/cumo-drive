/**
 * Wendeschleifen (Tester Matthias 15.11., Speyer): Die Route fährt an ein Kreuz, wendet über eine Rampe und
 * fährt dieselbe Straße zurück. Meist liegt ein Punkt auf der Gegenfahrbahn einer Straße mit getrennten
 * Fahrbahnen, und der Planer muss zum Wenden bis zum nächsten Kreuz.
 *
 * Erkannt wird ein Hin und Zurück: zwei Stellen der Linie, 200 bis 1500 m Strecke auseinander, liegen dicht
 * beieinander, laufen entgegengesetzt, und das bleibt mindestens 400 m so (die Wendeschleife selbst ist die
 * Rampe dazwischen). Spitzkehren am Pass laufen nicht so lange so dicht nebeneinander.
 * Liegt ein Punkt der Tour an der Spitze, ist das Hin und Zurück gewollt (Stich zum Café, zur Passhöhe).
 *
 * Reine Rechnung ohne Netz, damit testbar.
 */
import { haversine, type LatLon } from './tour';

const STEP = 25;
/** so dicht liegen Hin und Rückweg (getrennte Fahrbahnen 20 bis 35 m) */
const TOL_M = 40;
/** Strecke der Wende selbst (Rampe, Kreisel): von hier bis hier */
const LOOP_MIN_M = 200;
const LOOP_MAX_M = 1500;
/** so lange müssen Hin und Rückweg nebeneinander laufen */
const MIN_FOLD_M = 400;
const MAX_FOLD_M = 5000;
/** ein Punkt der Tour so nah an der Spitze: gewollt */
const WANTED_M = 300;
/** ein Punkt so nah am Hin oder Rückweg: er hat die Wende ausgelöst */
const CAUSE_M = 60;

export type UTurn = {
  /** Spitze der Wende (Mitte der Rampe) */
  tip: LatLon;
  /** km auf der Linie bis zum Beginn des Hinwegs */
  startKm: number;
  /** doppelt gefahrene km (Hin und Rückweg zusammen, mit Rampe) */
  km: number;
  /** abgetastete Linie: Hinweg und Rückweg, gleich lang, Rückweg in Fahrtrichtung */
  out: LatLon[];
  back: LatLon[];
};

function resample(line: LatLon[]): LatLon[] {
  if (line.length < 2) return line.slice();
  const out: LatLon[] = [line[0]];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const d = haversine(a, b);
    if (d === 0) continue;
    let t = STEP - carry;
    while (t <= d) {
      const f = t / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      t += STEP;
    }
    carry = d - (t - STEP);
  }
  return out;
}

function bearing(a: LatLon, b: LatLon): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
}

const angle = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180);

/** Alle Hin und Zurück Stellen der Linie (gewollt oder nicht) */
export function findUTurns(line: LatLon[]): UTurn[] {
  const s = resample(line);
  const n = s.length;
  if (n < 10) return [];
  const brg = s.map((p, i) => bearing(s[Math.max(0, i - 1)], s[Math.min(n - 1, i + 1)]));
  const minGap = LOOP_MIN_M / STEP;
  const maxGap = LOOP_MAX_M / STEP;
  const minFold = MIN_FOLD_M / STEP;
  const maxFold = MAX_FOLD_M / STEP;
  const found: UTurn[] = [];
  let i = 0;
  while (i < n) {
    let hit = -1;
    for (let j = i + minGap; j <= Math.min(n - 1, i + maxGap); j++) {
      if (haversine(s[i], s[j]) <= TOL_M && angle(brg[i], brg[j]) >= 135) {
        hit = j;
        break;
      }
    }
    if (hit < 0) {
      i++;
      continue;
    }
    // Nach außen verlängern: s[i-k] und s[hit+k] bleiben dicht beieinander
    let k = 0;
    while (k < maxFold && i - k - 1 >= 0 && hit + k + 1 < n && haversine(s[i - k - 1], s[hit + k + 1]) <= TOL_M) k++;
    if (k < minFold) {
      i++;
      continue;
    }
    const a = i - k;
    const b = hit + k;
    found.push({
      tip: s[Math.round((i + hit) / 2)],
      startKm: (a * STEP) / 1000,
      km: ((b - a) * STEP) / 1000,
      out: s.slice(a, i + 1),
      back: s.slice(hit, b + 1),
    });
    i = b + 1;
  }
  return found;
}

/** Wendeschleifen, die kein Punkt der Tour erklärt (kein Punkt an der Spitze) */
export function unwantedUTurns(line: LatLon[], points: LatLon[]): UTurn[] {
  return findUTurns(line).filter((u) => !points.some((p) => haversine(p, u.tip) <= WANTED_M));
}

/**
 * Punkte, die eine Wende auslösen, auf die andere Fahrbahn legen: Liegt ein Zwischenpunkt dicht am Rückweg
 * einer Wende, kommt er auf die nächste Stelle des Hinwegs. Start und Ziel bleiben, wie sie sind.
 * Liefert die neuen Punkte oder null, wenn nichts zu verschieben ist.
 */
export function movePointsOffUTurns(points: LatLon[], turns: UTurn[]): LatLon[] | null {
  if (points.length < 3 || !turns.length) return null;
  let changed = false;
  const out = points.map((p, idx) => {
    if (idx === 0 || idx === points.length - 1) return p;
    for (const u of turns) {
      const near = (leg: LatLon[]) => {
        let best: LatLon | null = null;
        let bd = Infinity;
        for (const q of leg) {
          const d = haversine(p, q);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        return { best, bd };
      };
      const o = near(u.out);
      const b = near(u.back);
      if (Math.min(o.bd, b.bd) > CAUSE_M) continue;
      // Nur ein Punkt auf dem Rückweg erzwingt die Wende (man muss zurück, um ihn zu erreichen).
      // Dann auf den Hinweg damit: die Route kommt dort ohnehin vorbei.
      if (o.bd <= b.bd || !o.best || o.bd > CAUSE_M + TOL_M) continue;
      changed = true;
      return o.best;
    }
    return p;
  });
  return changed ? out : null;
}
