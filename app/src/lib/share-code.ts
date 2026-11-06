/**
 * Tour als kurzer Code (für QR Codes): Name, Profil und Stützpunkte entlang der Linie.
 * Die App plant aus den Stützpunkten dieselbe Strecke nach und prüft sie erneut.
 * Format: "cumo1:" + base64url(JSON), Stützpunkte als Polyline mit 5 Nachkommastellen.
 */
import { flatten, haversine, type LatLon, type Profile, type Tour } from './tour';

const PREFIX = 'cumo1:';

export type SharedTour = { name: string; profile: Profile; points: LatLon[] };

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

function decodePolyline(str: string, factor = 1e5): LatLon[] {
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
    out.push([lat / factor, lon / factor]);
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

export function encodeTour(tour: Tour, profile: Profile): string {
  // 4 Nachkommastellen (etwa 10 m) und höchstens 26 Stützpunkte halten den QR Code grob,
  // damit die iPhone Kamera ihn auch vom Bildschirm sicher liest. Die App plant ohnehin neu.
  const payload = { n: tour.name.slice(0, 40), p: profile, q: 4, v: encodePolyline(supportPoints(tour), 1e4) };
  return PREFIX + b64urlEncode(JSON.stringify(payload));
}

/** Web Adresse für den QR Code: Die iPhone Kamera erkennt sie als Link. Der Code steht hinter #, geht also nicht an den Server. */
export const SHARE_BASE = 'https://drive.rallycumo.de/t';

export function shareUrl(code: string): string {
  return `${SHARE_BASE}#${code}`;
}

/** Öffnet die installierte App (TestFlight) und übernimmt die Tour in den Planer. */
export function appLink(code: string): string {
  return `cumodrive://scan?code=${encodeURIComponent(code)}`;
}

/** Link, der die App in Expo Go öffnet und die Tour direkt übernimmt (bis es eine eigene App gibt). */
export function expoGoLink(code: string): string {
  return `exp://u.expo.dev/44e0d073-6f59-455d-8a50-0f11f6fef4b7/--/scan?runtime-version=exposdk%3A58.0.0&channel-name=preview&code=${encodeURIComponent(code)}`;
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
    const d = JSON.parse(b64urlDecode(raw.slice(PREFIX.length))) as { n?: string; p?: Profile; q?: number; v?: string };
    if (!d.v) return null;
    const points = decodePolyline(d.v, d.q === 4 ? 1e4 : 1e5);
    if (points.length < 2) return null;
    return { name: d.n || 'Tour vom Planer', profile: d.p ?? 'kurvig', points };
  } catch {
    return null;
  }
}
