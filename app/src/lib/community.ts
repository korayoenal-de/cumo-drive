/**
 * Community Touren: veröffentlichte Touren aus public.tours (published = true). Jeder kann sie
 * ansehen und fahren; veröffentlichen kann man nur eigene Touren mit Konto.
 */
import { loadCloudTour, saveCloudTour } from './cloud-tours';
import { dropLocalTour, fromCommunity, markUnpublished, patchTour, saveTour, syncLibrary, type SavedTour } from './library';
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
/** Fester Zusatz, wenn eine abgewandelte Community Route veröffentlicht wird: die Herkunft bleibt sichtbar */
export function creditLine(t: Pick<SavedTour, 'author' | 'folder' | 'published'>): string | null {
  if (!fromCommunity(t)) return null;
  return t.author ? `Nach einer Route von ${t.author}.` : 'Nach einer Route aus der Community.';
}

export async function publishTour(t: SavedTour, author: string, description: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Zum Veröffentlichen brauchst du ein Konto (Einstellungen).');
  const cloudId = await saveCloudTour(t, { id: t.cloudId, folder: t.folder, profile: t.profile });
  const { error } = await supabase
    .from('tours')
    .update({ published: true, published_at: new Date().toISOString(), author: author.trim().slice(0, 60) || null, description: [creditLine(t), description.trim()].filter(Boolean).join(' ').slice(0, 500) || null })
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
  const saved = saveTour({ ...full.tour, name: c.name, curves: c.curves ?? undefined, profile: full.profile, author: c.author?.trim() || undefined, communityId: c.id }, 'Community');
  void syncLibrary();
  return saved;
}

/**
 * Ältere übernommene Touren haben keinen Absender gespeichert: einmal über den Namen in der Community nachtragen,
 * damit die Plakette „Von Timo“ statt „Aus der Community“ zeigt (Koray 10.11.).
 */
export async function backfillAuthors(list: SavedTour[]) {
  const open = list.filter((t) => t.folder === 'Community' && !t.author && !t.published);
  if (!open.length) return;
  try {
    const byName = new Map((await listCommunity()).filter((c) => c.author).map((c) => [c.name, c.author!]));
    for (const t of open) {
      const a = byName.get(t.name);
      if (a) patchTour(t.id, { author: a });
    }
  } catch {
    // ohne Netz bleibt die allgemeine Plakette
  }
}
