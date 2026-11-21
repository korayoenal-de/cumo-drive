/**
 * Tour als kurzer Code (für QR Codes): Name, Profil und Stützpunkte entlang der Linie.
 * Die App plant aus den Stützpunkten dieselbe Strecke nach und prüft sie erneut.
 * Format: "cumo1:" + base64url(JSON), Stützpunkte als Polyline mit 5 Nachkommastellen.
 */
import { flatten, haversine, type LatLon, type Profile, type Tour } from './tour';
import { tr } from '@/i18n';
import { decodePolyline } from './polyline';

const PREFIX = 'cumo1:';

export type SharedTour = {
  name: string;
  profile: Profile;
  /** Stützpunkte entlang der Linie: daraus plant die App dieselbe Strecke nach */
  points: LatLon[];
  /** Start, Zwischenziele und Ziel mit Namen und Profil je Etappe (nur Links, nicht im QR Code) */
  waypoints?: LatLon[];
  names?: string[];
  legs?: (Profile | null)[];
  /** Die Original Linie (importierte Touren, Weg A von Koray 21.11.): die App öffnet sie unverändert, ohne Neuplanung */
  line?: LatLon[];
};

/**
 * Touren, die nicht aus unserem Planer kommen (Import aus GPX oder KML, gefahrene Strecken): Ihre Wegpunkte tragen die
 * Strecke nicht, oft nur Start und Ziel. Aus den Stützpunkten nachgeplant kam eine calimoto Runde ab Heppenheim nur
 * ähnlich an, und jede Änderung ließ sie auf Heppenheim nach Heppenheim zusammenfallen (Koray 21.11.).
 */
export function keepsLine(tour: Tour & { folder?: string }): boolean {
  return tour.geprueft === false || tour.folder === 'Importiert';
}

/** Linie ausdünnen (Douglas Peucker, Toleranz in Metern), damit sie in einen kurzen Link passt */
export function simplifyLine(line: LatLon[], tolM: number): LatLon[] {
  if (line.length < 3) return line;
  const k = Math.cos((line[0][0] * Math.PI) / 180);
  const xy = line.map(([la, lo]) => [lo * k * 111320, la * 111320]);
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let bestD = tolM;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      const d = len ? Math.abs(dy * (px - ax) - dx * (py - ay)) / len : Math.hypot(px - ax, py - ay);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Platz für die Linie: Der Server nimmt Codes bis 20.000 Zeichen, Base64 macht aus 3 Zeichen 4 */
const LINE_BUDGET = 12000;

function encodeLine(tour: Tour): string | null {
  const line = flatten(tour).map((x) => x.p);
  for (const tol of [4, 8, 15, 30, 60]) {
    const enc = encodePolyline(simplifyLine(line, tol), 1e5);
    if (enc.length <= LINE_BUDGET) return enc;
  }
  return null;
}

function encodePolyline(points: LatLon[], factor = 1e5): string {
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [la, lo] of points) {
    const a = Math.round(la * factor);
    const b = Math.round(lo * factor);
    out += enc(a - pLat) + enc(b - pLon);
    pLat = a;
    pLon = b;
  }
  return out;
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Stützpunkte: alle Wegpunkte plus etwa alle stepKm ein Punkt der Linie, damit das
 * Nachplanen dieselbe Strecke trifft. Höchstens maxPoints, damit der QR Code lesbar bleibt.
 */
export function supportPoints(tour: Tour, stepKm = 6, maxPoints = 26): LatLon[] {
  const pts = flatten(tour);
  if (pts.length < 2) return tour.wegpunkte;
  const total = pts[pts.length - 1].km;
  // kurze Runden (Start gleich Ziel) brauchen trotzdem Stützpunkte, sonst bleibt nur ein Punkt übrig
  // und der Link ist nicht lesbar (Stresstest 6.11.)
  const step = Math.min(Math.max(stepKm, total / maxPoints), Math.max(total / 3, 0.05));
  const out: LatLon[] = [pts[0].p];
  let next = step;
  for (const x of pts) {
    if (x.km >= next) {
      out.push(x.p);
      next += step;
    }
  }
  const end = pts[pts.length - 1].p;
  if (haversine(out[out.length - 1], end) > 50 || out.length < 2) out.push(end);
  else out[out.length - 1] = end;
  return out;
}

export function encodeTour(tour: Tour, profile: Profile, opts?: { full?: boolean; line?: boolean }): string {
  // 4 Nachkommastellen (etwa 10 m) und höchstens 26 Stützpunkte halten den QR Code grob,
  // damit die iPhone Kamera ihn auch vom Bildschirm sicher liest. Die App plant ohnehin neu.
  // full (geteilter Link, Koray 10.11.): dazu die echten Punkte mit Namen, sonst kamen beim Empfänger
  // die Stützpunkte als viele Punkte mit Koordinaten an
  const extra =
    opts?.full && tour.wegpunkte.length >= 2
      ? {
          w: encodePolyline(tour.wegpunkte, 1e5),
          m: tour.wegpunkte.map((_, i) => (tour.namen?.[i] ?? '').slice(0, 40)),
          ...(tour.etappen && tour.etappen.length === tour.wegpunkte.length - 1 ? { e: tour.etappen } : {}),
        }
      : {};
  const l = opts?.line ? encodeLine(tour) : null;
  const payload = { n: tour.name.slice(0, 40), p: profile, q: 4, v: encodePolyline(supportPoints(tour), 1e4), ...extra, ...(l ? { l } : {}) };
  return PREFIX + b64urlEncode(JSON.stringify(payload));
}

/** Web Adresse für den QR Code: Die iPhone Kamera erkennt sie als Link. Der Code steht hinter #, geht also nicht an den Server. */
export const SHARE_BASE = 'https://cumodrive.de/t';

export function shareUrl(code: string): string {
  return `${SHARE_BASE}#${code}`;
}

/** Öffnet die installierte App (TestFlight) und übernimmt die Tour in den Planer. */
export function appLink(code: string): string {
  return `cumodrive://scan?code=${encodeURIComponent(code)}`;
}

/** Holt den Code aus einem reinen Code, einer Web Adresse mit # oder einem Link mit ?code= */
export function extractCode(text: string): string {
  const t = text.trim();
  const hash = t.indexOf('#');
  if (hash >= 0) return decodeURIComponent(t.slice(hash + 1));
  const m = /[?&]code=([^&]+)/.exec(t);
  if (m) return decodeURIComponent(m[1]);
  return t;
}

export function decodeTour(code: string): SharedTour | null {
  const raw = extractCode(code);
  if (!raw.startsWith(PREFIX)) return null;
  try {
    const d = JSON.parse(b64urlDecode(raw.slice(PREFIX.length))) as { n?: string; p?: Profile; q?: number; v?: string; w?: string; m?: string[]; e?: (Profile | null)[]; l?: string };
    if (!d.v) return null;
    const points = decodePolyline(d.v, d.q === 4 ? 1e4 : 1e5);
    if (points.length < 2) return null;
    const waypoints = d.w ? decodePolyline(d.w, 1e5) : undefined;
    const line = d.l ? decodePolyline(d.l, 1e5) : undefined;
    return {
      name: d.n || tr('Tour vom Planer'),
      profile: d.p ?? 'kurvig',
      points,
      ...(waypoints && waypoints.length >= 2 ? { waypoints, names: d.m, legs: d.e } : {}),
      ...(line && line.length >= 2 ? { line } : {}),
    };
  } catch {
    return null;
  }
}
