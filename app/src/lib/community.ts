/**
 * Community Touren: veröffentlichte Touren aus public.tours (published = true). Jeder kann sie
 * ansehen und fahren; veröffentlichen kann man nur eigene Touren mit Konto.
 */
import { loadCloudTour, saveCloudTour } from './cloud-tours';
import { dropLocalTour, markUnpublished, patchTour, saveTour, syncLibrary, type SavedTour } from './library';
import { logSignal } from './signals';
import { supabase } from './supabase';
import type { Profile } from './tour';

export type CommunityTour = {
  id: string;
  name: string;
  km: number;
  minutes: number | null;
  curves: number | null;
  profile: Profile;
  author: string | null;
  description: string | null;
  published_at: string;
  owner: string;
  /** Start der Tour für den Pin auf der Community Karte */
  start_lat: number | null;
  start_lon: number | null;
};

export async function listCommunity(limit = 100): Promise<CommunityTour[]> {
  const { data, error } = await supabase
    .from('tours')
    .select('id,name,km,minutes,curves,profile,author,description,published_at,owner,start_lat,start_lon')
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CommunityTour[];
}

export const loadCommunityTour = loadCloudTour;

/** Eigene Tour veröffentlichen: erst ins Konto laden (falls noch nicht), dann freigeben. */
export async function publishTour(t: SavedTour, author: string, description: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Zum Veröffentlichen brauchst du ein Konto (Einstellungen).');
  const cloudId = await saveCloudTour(t, { id: t.cloudId, folder: t.folder, profile: t.profile });
  const { error } = await supabase
    .from('tours')
    .update({ published: true, published_at: new Date().toISOString(), author: author.trim().slice(0, 60) || null, description: description.trim().slice(0, 500) || null })
    .eq('id', cloudId);
  if (error) throw new Error(error.message);
  const now = new Date().toISOString();
  patchTour(t.id, { published: true, cloudId, syncedAt: now });
  logSignal('veroeffentlicht', t, { profile: t.profile });
  return cloudId;
}

/**
 * Veröffentlichte Tour nur aus Meine Touren entfernen (Koray 10.11.): Sie bleibt in der Community.
 * Erst im Konto markieren, dann auf dem Gerät entfernen, sonst lädt der Abgleich sie wieder herunter.
 */
export async function removeKeepPublished(t: SavedTour) {
  if (t.cloudId) {
    const { error } = await supabase.from('tours').update({ in_library: false }).eq('id', t.cloudId);
    if (error) throw new Error('Das hat nicht geklappt. Bitte nochmal versuchen.');
  }
  dropLocalTour(t.id);
}

/**
 * Eigene Tour aus der Community nehmen, auch wenn sie nicht mehr in Meine Touren liegt:
 * dann wird sie ganz gelöscht, sonst nur zurückgezogen.
 */
export async function withdrawCommunityTour(cloudId: string) {
  const { data } = await supabase.from('tours').select('in_library').eq('id', cloudId).maybeSingle();
  if ((data as { in_library?: boolean } | null)?.in_library === false) {
    const { error } = await supabase.from('tours').delete().eq('id', cloudId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from('tours').update({ published: false }).eq('id', cloudId);
  if (error) throw new Error(error.message);
  markUnpublished(cloudId);
}

export async function unpublishTour(t: SavedTour) {
  if (!t.cloudId) return;
  const { error } = await supabase.from('tours').update({ published: false }).eq('id', t.cloudId);
  if (error) throw new Error(error.message);
  patchTour(t.id, { published: false });
}

/** Community Tour in Meine Touren übernehmen (als eigene Kopie). */
export async function copyCommunityTour(c: CommunityTour): Promise<SavedTour> {
  const full = await loadCommunityTour(c.id);
  const saved = saveTour({ ...full.tour, name: c.name, curves: c.curves ?? undefined, profile: full.profile }, 'Community');
  void syncLibrary();
  return saved;
}
