/**
 * Übergabe einer fertig geplanten Tour vom Web Planer an die App über einen kurzen Code.
 * Der Planer legt die komplette Tour in Supabase ab (7 Tage gültig), der QR Code enthält nur
 * den Code. Die App bekommt so exakt die geplante Strecke samt Etappen Check.
 */
import { decodePolyline6 } from './valhalla';
import { supabase } from './supabase';
import type { CheckClass, LatLon, Profile, Tour } from './tour';
import type { Avoid } from './valhalla';

export const HANDOFF_PREFIX = 'h:';

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

export async function createHandoff(tour: Tour & { minutes?: number }, profile: Profile, avoid?: Avoid): Promise<string> {
  const packed = packTour(tour, profile, avoid);
  const { data, error } = await supabase.rpc('create_handoff', { payload: packed });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Übergabe fehlgeschlagen');
  return HANDOFF_PREFIX + data;
}

export function isHandoffCode(code: string): boolean {
  return code.startsWith(HANDOFF_PREFIX) && /^h:[a-z0-9]{8}$/.test(code);
}

export async function fetchHandoff(code: string): Promise<{ tour: Tour & { minutes?: number }; profile: Profile; avoid?: Avoid } | null> {
  const { data, error } = await supabase.rpc('get_handoff', { code: code.slice(HANDOFF_PREFIX.length) });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return unpackTour(data as Packed);
}
