/**
 * Melden, Blockieren und Prüfen (Koray 12.11., Stufe 1 gegen Missbrauch der Chats).
 * Server: supabase/migrations/20261112080000_melden_blockieren.sql.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

import { supabase } from './supabase';

export type ReportKind = 'direct_message' | 'ride_message' | 'profile' | 'tour' | 'ausfahrt';
/** Im Prüfbereich zusätzlich: stille Hinweise des Servers (Stufe 2, 13.11.), nicht zum Melden */
export type AdminKind = ReportKind | 'hinweis';
export type ReportReason = 'illegal' | 'spam' | 'belaestigung' | 'betrug' | 'anderes';

export const REASONS: { v: ReportReason; label: string }[] = [
  { v: 'illegal', label: 'Illegales, etwa Drogen' },
  { v: 'spam', label: 'Spam oder Werbung' },
  { v: 'belaestigung', label: 'Belästigung' },
  { v: 'betrug', label: 'Betrug' },
  { v: 'anderes', label: 'Anderes' },
];
export const reasonLabel = (r: string) => (r === 'automatisch' ? 'Hinweis vom Server' : (REASONS.find((x) => x.v === r)?.label ?? r));

const msg = (e: { message: string }) => (/function|relation|column|JWT|permission/i.test(e.message) ? 'Das hat nicht geklappt. Bitte nochmal versuchen.' : e.message);

export async function reportContent(kind: ReportKind, ref: string, reason: ReportReason, note?: string) {
  const { error } = await supabase.rpc('report_content', { kind, ref, reason, note: note?.trim() || null });
  if (error) throw new Error(msg(error));
}

// Blockieren --------------------------------------------------------------------------------------

export type Blocked = { userId: string; name: string; since: Date };
let blockedIds = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export async function listBlocks(): Promise<Blocked[]> {
  const { data, error } = await supabase.rpc('my_blocks');
  if (error) throw new Error(msg(error));
  const l = ((data ?? []) as { user_id: string; display_name: string | null; created_at: string }[]).map((r) => ({
    userId: r.user_id,
    name: r.display_name ?? 'Fahrer',
    since: new Date(r.created_at),
  }));
  blockedIds = new Set(l.map((b) => b.userId));
  emit();
  return l;
}

export async function blockUser(id: string) {
  const { error } = await supabase.from('blocks').insert({ blocked: id });
  if (error && !/duplicate/i.test(error.message)) throw new Error(msg(error));
  blockedIds = new Set(blockedIds).add(id);
  emit();
}

export async function unblockUser(id: string) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('blocks').delete().eq('blocker', u.user?.id ?? '').eq('blocked', id);
  if (error) throw new Error(msg(error));
  const n = new Set(blockedIds);
  n.delete(id);
  blockedIds = n;
  emit();
}

export function useIsBlocked(id: string | undefined) {
  return useSyncExternalStore(subscribe, () => (id ? blockedIds.has(id) : false));
}

// Eigener Stand und Hinweise -------------------------------------------------------------------------

export type Moderation = { banned: boolean; banReason: string | null; admin: boolean; openReports: number };
export type Notice = { id: number; body: string; createdAt: Date };

export async function myModeration(): Promise<Moderation> {
  const { data, error } = await supabase.rpc('my_moderation');
  if (error) throw new Error(msg(error));
  const r = (Array.isArray(data) ? data[0] : data) as { banned: boolean; ban_reason: string | null; admin: boolean; open_reports: number } | null;
  return { banned: !!r?.banned, banReason: r?.ban_reason ?? null, admin: !!r?.admin, openReports: r?.open_reports ?? 0 };
}

export async function myNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.from('moderation_notices').select('id,body,created_at').is('seen_at', null).order('created_at', { ascending: false }).limit(5);
  if (error) return [];
  return ((data ?? []) as { id: number; body: string; created_at: string }[]).map((n) => ({ id: n.id, body: n.body, createdAt: new Date(n.created_at) }));
}

export async function noticeSeen(id: number) {
  await supabase.rpc('notice_seen', { n: id });
}

/** Stand für die Einstellungen: Admin, offene Meldungen, Sperre, ungelesene Hinweise */
export function useModeration(signedIn: boolean) {
  const [state, setState] = useState<{ mod: Moderation | null; notices: Notice[] }>({ mod: null, notices: [] });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    Promise.all([myModeration().catch(() => null), myNotices()]).then(([mod, notices]) => live && setState({ mod, notices }));
    return () => {
      live = false;
    };
  }, [signedIn, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

// Prüfbereich ------------------------------------------------------------------------------------------

export type AdminReport = {
  id: number; kind: AdminKind; ref: string; reason: ReportReason | 'automatisch'; note: string | null; snapshot: string | null; createdAt: Date;
  reporterName: string | null; target: string | null; targetName: string | null; targetReports: number; targetBanned: boolean;
};

export async function adminReports(): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_reports');
  if (error) throw new Error(msg(error));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    kind: r.kind as AdminKind,
    ref: String(r.ref),
    reason: r.reason as AdminReport['reason'],
    note: (r.note as string | null) ?? null,
    snapshot: (r.snapshot as string | null) ?? null,
    createdAt: new Date(String(r.created_at)),
    reporterName: (r.reporter_name as string | null) ?? null,
    target: (r.target as string | null) ?? null,
    targetName: (r.target_name as string | null) ?? null,
    targetReports: Number(r.target_reports ?? 0),
    targetBanned: !!r.target_banned,
  }));
}

export async function adminResolve(id: number, action: 'ok' | 'entfernt' | 'gesperrt', why?: string) {
  const { error } = await supabase.rpc('admin_resolve', { report: id, action, why: why?.trim() || null });
  if (error) throw new Error(msg(error));
}

export const KIND_LABEL: Record<AdminKind, string> = {
  direct_message: 'Private Nachricht',
  ride_message: 'Nachricht im Chat einer Ausfahrt',
  profile: 'Profil',
  tour: 'Tour in der Community',
  ausfahrt: 'Ausfahrt',
  hinweis: 'Auffälliges Verhalten',
};
