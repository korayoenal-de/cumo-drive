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

/** Gesamtnote 0 bis 100 (stufenlos, Koray 8.11.): Wörter für den Regler, Gründe unter 40 */
export const SCORE_WEAK = 40;
export function scoreWord(v: number): string {
  if (v < 15) return 'Enttäuschend';
  if (v < SCORE_WEAK) return 'Nicht gut';
  if (v < 60) return 'Okay';
  if (v < 80) return 'Gut';
  if (v < 95) return 'Richtig gut';
  return 'Sensationell';
}

/** Daumen je gefahrenem Highlight: 1 hoch, −1 runter, null ohne Angabe */
export type HighlightVote = { key: string; name: string; vote: 1 | -1 | null };

export async function rateDriveScore(id: string, score: number, reasons: string[], note: string, highlights: HighlightVote[]) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const weak = s < SCORE_WEAK;
  const { error } = await supabase.rpc('rate_drive_v2', {
    p_id: id,
    p_score: s,
    p_reasons: weak && reasons.length ? reasons : null,
    p_note: weak ? note || null : null,
    p_highlights: highlights.map((h) => ({ key: h.key, name: h.name, vote: h.vote })),
  });
  // Datenbank noch ohne rate_drive_v2 (Migration läuft nach): wenigstens die alte Bewertung speichern
  if (error && /rate_drive_v2|PGRST202/.test(`${error.code ?? ''} ${error.message}`)) {
    return rateDrive(id, weak ? 1 : s < 80 ? 2 : 3, reasons, note);
  }
  if (error) throw new Error(error.message);
}

function decode(str: string): LatLon[] {
  const out: LatLon[] = [];
  let i = 0;
  let la = 0;
  let lo = 0;
  const next = () => {
    let r = 0;
    let s = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << s;
      s += 5;
    } while (b >= 0x20 && i < str.length);
    return r & 1 ? ~(r >> 1) : r >> 1;
  };
  while (i < str.length) {
    la += next();
    lo += next();
    out.push([la / 1e5, lo / 1e5]);
  }
  return out;
}

/** Spuren der letzten Fahrten für die Karte, jede auf höchstens 400 Punkte ausgedünnt. */
export async function listDriveTracks(limit = 60): Promise<{ id: string; p: LatLon[] }[]> {
  const { data, error } = await supabase.from('drives').select('id,track').order('started_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; track: string | null }[])
    .filter((d) => d.track)
    .map((d) => {
      const p = decode(d.track!);
      const step = Math.ceil(p.length / 400);
      return { id: d.id, p: step > 1 ? p.filter((_, k) => k % step === 0 || k === p.length - 1) : p };
    })
    .filter((d) => d.p.length > 1);
}

/**
 * Spuren bestimmter Fahrten in voller Auflösung (Tester Gregor 12.11.: nach der Fahrt sehen, wo man wirklich
 * gefahren ist, oft anders als geplant). Für die sichtbaren Karten in Meine Touren, nicht für alle auf einmal.
 */
export async function getDriveTracks(ids: string[]): Promise<Record<string, LatLon[]>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('drives').select('id,track').in('id', ids);
  if (error) throw new Error(error.message);
  const out: Record<string, LatLon[]> = {};
  for (const d of (data ?? []) as { id: string; track: string | null }[]) {
    if (!d.track) continue;
    const p = decode(d.track);
    if (p.length > 1) out[d.id] = p;
  }
  return out;
}
