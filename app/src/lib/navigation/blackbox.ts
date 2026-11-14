/**
 * Blackbox je Fahrt (Koray 12.11.): Was die Navigation wann gesehen, gesagt und entschieden hat. Bisher ließen
 * sich Fehler von Testern nur aus Screenshots und Serverprotokollen rekonstruieren. Jetzt liegt zu jeder Fahrt
 * ein Protokoll im Konto (drives.nav_log), und "Problem melden" schickt die letzten Minuten sofort mit.
 *
 * Kompakt gehalten: Positionen höchstens alle 3 s oder bei 20 Grad Richtungswechsel, Ereignisse vollständig.
 * Ein Eintrag ist [Sekunden seit Start, Art, Daten]. Höchstens 12.000 Einträge (etwa vier Stunden).
 * Reine Datenhaltung ohne React, damit testbar und von überall aufrufbar.
 */
import type { LatLon } from '../tour';
import type { NavRoute } from './types';

export type BbKind =
  /** Position: [lat, lon, kmh, Kurs, Genauigkeit, Abstand zur Route, km auf der Route, fortgeschrieben 1/0] */
  | 'gps'
  /** Ansage, Text */
  | 'say'
  /** neue Route: km, Zahl der Manöver, Rückweg Index, Quelle, Linie (Polyline 1e5), Manöver [km, Art, Text, Ansage, Ausfahrt] */
  | 'route'
  /** Neuberechnung: Art (auto, rejoin, fresh), Ergebnis oder Fehler, Dauer in ms */
  | 'reroute'
  /** angezeigtes Tempolimit: Wert, geschätzt 1/0 */
  | 'limit'
  /** Ergänzung im Hintergrund: Ort, Kreisverkehr, Gabelung */
  | 'enrich'
  /** Tunnel: Fortschreibung an oder aus */
  | 'dr'
  /** nächstes Manöver gewechselt: Text, Abstand */
  | 'next'
  /** Meldung "Problem melden" */
  | 'report'
  /** Start, Pause, Ende */
  | 'state'
  /** Funk: Zustand und Fehlertext (Koray 14.11.: Funk verband sich nie, Ursache unklar) */
  | 'funk';

export type BbEntry = [number, BbKind, unknown];
export type BbLog = { v: 1; start: string; entries: BbEntry[] };

const MAX = 12000;
const GPS_EVERY_MS = 3000;
const GPS_TURN_DEG = 20;

let startAt = 0;
let entries: BbEntry[] = [];
let lastGps: { at: number; heading: number | null } | null = null;

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const r1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);

export function bbStart(now = Date.now()) {
  startAt = now;
  entries = [];
  lastGps = null;
  bbLog('state', 'start', now);
}

export function bbLog(kind: BbKind, data: unknown, now = Date.now()) {
  if (!startAt) return;
  entries.push([Math.round((now - startAt) / 100) / 10, kind, data]);
  // zu lang: die ältesten Positionen zuerst opfern, Ereignisse bleiben
  if (entries.length > MAX) {
    const i = entries.findIndex((e) => e[1] === 'gps');
    entries.splice(i >= 0 ? i : 0, 1);
  }
}

/** Position, ausgedünnt: alle 3 s oder bei deutlichem Richtungswechsel, fortgeschriebene immer */
export function bbGps(
  p: LatLon,
  o: { kmh: number | null; heading: number | null; accuracy?: number | null; offM: number; km: number; virtual?: boolean },
  now = Date.now(),
) {
  if (!startAt) return;
  const turn =
    lastGps?.heading != null && o.heading != null ? Math.abs(((((o.heading - lastGps.heading) % 360) + 540) % 360) - 180) : 0;
  if (lastGps && !o.virtual && now - lastGps.at < GPS_EVERY_MS && turn < GPS_TURN_DEG) return;
  lastGps = { at: now, heading: o.heading };
  bbLog('gps', [r5(p[0]), r5(p[1]), r1(o.kmh), o.heading == null ? null : Math.round(o.heading), o.accuracy == null ? null : Math.round(o.accuracy), Math.round(o.offM), Math.round(o.km * 1000) / 1000, o.virtual ? 1 : 0], now);
}

/** Protokoll seit Start, oder nur die letzten lastS Sekunden */
export function bbSnapshot(lastS?: number): BbLog | null {
  if (!startAt) return null;
  const now = (Date.now() - startAt) / 1000;
  const list = lastS != null ? entries.filter((e) => e[0] >= now - lastS) : entries.slice();
  return { v: 1, start: new Date(startAt).toISOString(), entries: list };
}

export function bbStop() {
  bbLog('state', 'ende');
}

/** Linie als Polyline (Faktor 1e5), wie die Spur der Fahrten */
export function encodeLine(points: LatLon[]): string {
  let out = '';
  let pla = 0;
  let plo = 0;
  const enc = (v: number) => {
    let x = v < 0 ? ~(v << 1) : v << 1;
    while (x >= 0x20) {
      out += String.fromCharCode((0x20 | (x & 0x1f)) + 63);
      x >>= 5;
    }
    out += String.fromCharCode(x + 63);
  };
  for (const [la, lo] of points) {
    const a = Math.round(la * 1e5);
    const b = Math.round(lo * 1e5);
    enc(a - pla);
    enc(b - plo);
    pla = a;
    plo = b;
  }
  return out;
}

export function decodeLine(str: string): LatLon[] {
  const out: LatLon[] = [];
  let i = 0;
  let la = 0;
  let lo = 0;
  const next = () => {
    let shift = 0;
    let res = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      res |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return res & 1 ? ~(res >> 1) : res >> 1;
  };
  while (i < str.length) {
    la += next();
    lo += next();
    out.push([la / 1e5, lo / 1e5]);
  }
  return out;
}

/** Route für die Blackbox: so viel, dass sich die Fahrt am Schreibtisch nachspielen lässt */
export function bbRoute(route: NavRoute, now = Date.now()) {
  bbLog('route', {
    km: Math.round(route.km * 1000) / 1000,
    rejoin: route.rejoinIndex ?? null,
    source: route.source,
    minutes: Math.round(route.minutes * 10) / 10,
    line: encodeLine(route.shape),
    man: route.maneuvers.map((m) => [Math.round(m.km * 1000) / 1000, m.kind, m.text, m.speech, m.exit ?? null, m.index]),
  }, now);
}
