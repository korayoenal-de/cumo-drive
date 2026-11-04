/**
 * Tour als kurzer Code (für QR Codes): Name, Profil und Stützpunkte entlang der Linie.
 * Die App plant aus den Stützpunkten dieselbe Strecke nach und prüft sie erneut.
 * Format: "cumo1:" + base64url(JSON), Stützpunkte als Polyline mit 5 Nachkommastellen.
 */
import { flatten, haversine, type LatLon, type Profile, type Tour } from './tour';

const PREFIX = 'cumo1:';

export type SharedTour = { name: string; profile: Profile; points: LatLon[] };

function encodePolyline(points: LatLon[]): string {
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
    const a = Math.round(la * 1e5);
    const b = Math.round(lo * 1e5);
    out += enc(a - pLat) + enc(b - pLon);
    pLat = a;
    pLon = b;
  }
  return out;
}

function decodePolyline(str: string): LatLon[] {
  const out: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < str.length) {
    const vals: number[] = [];
    for (let k = 0; k < 2; k++) {
      let r = 0;
      let sh = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        r |= (b & 0x1f) << sh;
        sh += 5;
      } while (b >= 0x20);
      vals.push(r & 1 ? ~(r >> 1) : r >> 1);
    }
    lat += vals[0];
    lon += vals[1];
    out.push([lat / 1e5, lon / 1e5]);
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
export function supportPoints(tour: Tour, stepKm = 3, maxPoints = 60): LatLon[] {
  const pts = flatten(tour);
  if (pts.length < 2) return tour.wegpunkte;
  const total = pts[pts.length - 1].km;
  const step = Math.max(stepKm, total / maxPoints);
  const out: LatLon[] = [pts[0].p];
  let next = step;
  for (const x of pts) {
    if (x.km >= next) {
      out.push(x.p);
      next += step;
    }
  }
  const end = pts[pts.length - 1].p;
  if (haversine(out[out.length - 1], end) > 50) out.push(end);
  else out[out.length - 1] = end;
  return out;
}

export function encodeTour(tour: Tour, profile: Profile): string {
  const payload = { n: tour.name.slice(0, 60), p: profile, v: encodePolyline(supportPoints(tour)) };
  return PREFIX + b64urlEncode(JSON.stringify(payload));
}

export function decodeTour(code: string): SharedTour | null {
  const raw = code.trim();
  if (!raw.startsWith(PREFIX)) return null;
  try {
    const d = JSON.parse(b64urlDecode(raw.slice(PREFIX.length))) as { n?: string; p?: Profile; v?: string };
    if (!d.v) return null;
    const points = decodePolyline(d.v);
    if (points.length < 2) return null;
    return { name: d.n || 'Tour vom Planer', profile: d.p ?? 'kurvig', points };
  } catch {
    return null;
  }
}
