/**
 * Tour kompakt verpacken (Linie als Polyline mit 6 Stellen): für Übergabe Codes und die Ablage im Konto.
 * Ohne Netz und ohne Supabase, damit es auch in Tests läuft.
 */
import { decodePolyline6 } from './valhalla';
import type { CheckClass, LatLon, Profile, Tour } from './tour';
import type { Avoid } from './valhalla';

export type Packed = {
  v: 2;
  profile: Profile;
  avoid?: Avoid;
  minutes?: number;
  tour: Omit<Tour, 'linie'> & { linie: { c: CheckClass; s: string }[] };
};

function encodePolyline6(points: LatLon[]): string {
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
    const a = Math.round(la * 1e6);
    const b = Math.round(lo * 1e6);
    out += enc(a - pLat) + enc(b - pLon);
    pLat = a;
    pLon = b;
  }
  return out;
}

/** Tour kompakt verpacken (Linie als Polyline), für Übergabe Codes und die Ablage in Supabase. */
export function packTour(tour: Tour & { minutes?: number }, profile: Profile, avoid?: Avoid): Packed {
  const { linie, minutes, ...rest } = tour;
  return { v: 2, profile, avoid, minutes, tour: { ...rest, linie: linie.map((l) => ({ c: l.c, s: encodePolyline6(l.p) })) } };
}

export function unpackTour(p: Packed): { tour: Tour & { minutes?: number }; profile: Profile; avoid?: Avoid } {
  return {
    profile: p.profile,
    avoid: p.avoid,
    tour: { ...p.tour, minutes: p.minutes, linie: p.tour.linie.map((l) => ({ c: l.c, p: decodePolyline6(l.s) })) },
  };
}
