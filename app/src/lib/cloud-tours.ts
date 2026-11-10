/**
 * Touren im Konto (Supabase Tabelle public.tours, nur für den Besitzer sichtbar).
 * Die Linie liegt verpackt als Polyline in data, damit auch lange Touren klein bleiben.
 */
import { packTour, unpackTour, type Packed } from './handoff';
import { supabase } from './supabase';
import type { Profile, Tour } from './tour';
import type { Avoid } from './valhalla';

export type CloudTour = {
  id: string;
  name: string;
  folder: string;
  profile: Profile;
  km: number;
  minutes: number | null;
  curves: number | null;
  updated_at: string;
};

export async function listCloudTours(): Promise<CloudTour[]> {
  // nur eigene Touren: veröffentlichte Touren anderer sind seit der Community ebenfalls lesbar
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data, error } = await supabase
    .from('tours')
    .select('id,name,folder,profile,km,minutes,curves,updated_at')
    .eq('owner', u.user.id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CloudTour[];
}

export async function loadCloudTour(id: string): Promise<{ tour: Tour & { minutes?: number }; profile: Profile; avoid?: Avoid }> {
  const { data, error } = await supabase.from('tours').select('data').eq('id', id).single();
  if (error) throw new Error(error.message);
  return unpackTour((data as { data: Packed }).data);
}

/** Tour anlegen oder aktualisieren; liefert die ID im Konto. */
export async function saveCloudTour(
  t: Tour & { minutes?: number; curves?: number },
  opts: { id?: string; folder?: string; profile?: Profile; avoid?: Avoid },
): Promise<string> {
  const row = {
    name: t.name.slice(0, 120) || 'Tour',
    folder: (opts.folder ?? '').slice(0, 80),
    profile: opts.profile ?? 'kurvig',
    avoid: opts.avoid ?? {},
    km: Math.round(t.laenge_km * 10) / 10,
    minutes: t.minutes != null ? Math.round(t.minutes) : null,
    curves: t.curves ?? null,
    data: packTour(t, opts.profile ?? 'kurvig', opts.avoid),
  };
  if (opts.id) {
    // Ohne Treffer (fremde oder gelöschte Tour) meldet Supabase keinen Fehler, dann neu anlegen.
    // Bei einem Fehler nie neu anlegen: sonst entsteht bei jedem Abgleich eine weitere Kopie (Koray 10.11.).
    const { data, error } = await supabase.from('tours').update(row).eq('id', opts.id).select('id');
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return opts.id;
    const { data: u } = await supabase.auth.getUser();
    const { data: own } = await supabase.from('tours').select('id').eq('id', opts.id).eq('owner', u.user?.id ?? '').maybeSingle();
    if (own) return opts.id;
  }
  const { data, error } = await supabase.from('tours').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteCloudTour(id: string) {
  const { error } = await supabase.from('tours').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
