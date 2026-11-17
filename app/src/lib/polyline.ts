/**
 * Kodierte Linien (Google Polyline Verfahren), wie sie Valhalla (Faktor 1e6) und unser GraphHopper liefern
 * (points_encoded, seit 17.11. mit Faktor 1e6, Performance Punkt 2: Antworten rund 70 % kleiner, gepackt gut ein Drittel).
 * Ergebnis als [lat, lon].
 */
import type { LatLon } from './tour';

export function decodePolyline(str: string, factor = 1e5): LatLon[] {
  const out: LatLon[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const n = str.length;
  while (index < n) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result += (b & 0x1f) * 2 ** shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result % 2 ? -(result + 1) / 2 : result / 2;
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result += (b & 0x1f) * 2 ** shift;
      shift += 5;
    } while (b >= 0x20);
    lon += result % 2 ? -(result + 1) / 2 : result / 2;
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

export function encodePolyline(points: LatLon[], factor = 1e5): string {
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let x = v < 0 ? -2 * v - 1 : 2 * v;
    let s = '';
    while (x >= 0x20) {
      s += String.fromCharCode((0x20 | (x % 32)) + 63);
      x = Math.floor(x / 32);
    }
    return s + String.fromCharCode(x + 63);
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
