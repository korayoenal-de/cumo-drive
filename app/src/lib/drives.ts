/**
 * Gefahrene Touren im Konto (Supabase Tabelle public.drives): Fahrtstatistik plus ausgedünnte Spur.
 */
import type { RideStats, Sample } from './ride-stats';
import { supabase } from './supabase';
import { haversine, type LatLon } from './tour';

export type Drive = {
  id: string;
  name: string;
  started_at: string;
  km: number;
  moving_min: number;
  avg_kmh: number | null;
  max_kmh: number | null;
  max_lat_g: number | null;
  max_brake_g: number | null;
  curves: number | null;
  vehicle_id: string | null;
  vehicle_name: string | null;
};

function encode(points: LatLon[]): string {
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

/** Spur ausdünnen: ein Punkt je 25 m, höchstens 4000 Punkte. */
function thin(samples: Sample[]): LatLon[] {
  const out: LatLon[] = [];
  for (const s of samples) {
    if (!out.length || haversine(out[out.length - 1], s.p) >= 25) out.push(s.p);
  }
  const step = Math.ceil(out.length / 4000);
  return step > 1 ? out.filter((_, i) => i % step === 0) : out;
}

const r1 = (v: number | undefined | null) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v: number | undefined | null) => (v == null ? null : Math.round(v * 100) / 100);

export async function saveDrive(name: string, stats: RideStats, samples: Sample[], vehicle?: { id: string; model: string } | null): Promise<string> {
  const row = {
    name: name.slice(0, 120) || 'Fahrt',
    started_at: new Date(samples[0]?.t ?? Date.now()).toISOString(),
    km: Math.round(stats.km * 10) / 10,
    moving_min: Math.round(stats.movingMin),
    avg_kmh: r1(stats.avgKmh),
    max_kmh: r1(stats.maxKmh?.value),
    max_lat_g: r2(stats.maxLatG?.value),
    max_brake_g: r2(stats.maxBrakeG?.value),
    max_accel_g: r2(stats.maxAccelG?.value),
    curves: stats.curves,
    track: encode(thin(samples)),
    ...(vehicle ? { vehicle_id: vehicle.id, vehicle_name: vehicle.model.slice(0, 80) || null } : {}),
  };
  const { data, error } = await supabase.from('drives').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function listDrives(limit = 200): Promise<Drive[]> {
  const { data, error } = await supabase
    .from('drives')
    .select('id,name,started_at,km,moving_min,avg_kmh,max_kmh,max_lat_g,max_brake_g,curves,vehicle_id,vehicle_name')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Drive[];
}

export async function deleteDrive(id: string) {
  const { error } = await supabase.from('drives').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Bewertung nach der Fahrt: 1 nicht gut, 2 gut, 3 sensationell */
export type DriveRating = 1 | 2 | 3;

/** Gründe bei "nicht gut", gespeichert als Kennung */
export const BAD_REASONS = [
  { id: 'verkehr', label: 'Viel Verkehr' },
  { id: 'orte', label: 'Zu viele Orte' },
  { id: 'belag', label: 'Schlechter Belag' },
  { id: 'langweilig', label: 'Zu wenig Kurven' },
  { id: 'eng', label: 'Zu eng' },
  { id: 'sperrung', label: 'Baustelle oder Sperrung' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'anderes', label: 'Anderes' },
] as const;

export async function rateDrive(id: string, rating: DriveRating, reasons?: string[], note?: string) {
  const { error } = await supabase.rpc('rate_drive', { p_id: id, p_rating: rating, p_reasons: rating === 1 && reasons?.length ? reasons : null, p_note: rating === 1 ? (note ?? null) : null });
  if (error) throw new Error(error.message);
}
