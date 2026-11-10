/**
 * Drivers und Nachrichten (Koray 10.11.): Mitglieder stehen mit ihrem Wohnort (auf etwa 1 km
 * gerundet) auf der Community Karte. Im Profil: Wohnort, ob man angeschrieben werden darf und ob
 * andere den Fuhrpark sehen. Private Nachrichten zwischen zwei Fahrern, live über Realtime.
 * Tabellen und Funktionen aus supabase/migrations/20261110080000_drivers_nachrichten.sql.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { CarLook } from '@/components/map/car-sprite';

import { supabase } from './supabase';
import type { LatLon } from './tour';

export type GarageCar = { name: string; look: CarLook | null };

export type Driver = {
  id: string;
  name: string;
  car: string | null;
  homeName: string | null;
  home: LatLon | null;
  allowMessages: boolean;
  /** null, wenn der Fahrer seinen Fuhrpark nicht zeigt */
  garage: GarageCar[] | null;
  memberSince: Date | null;
  isMe: boolean;
};

export type Conversation = {
  partner: string;
  name: string;
  car: string | null;
  lastBody: string;
  lastAt: Date;
  lastFromMe: boolean;
  unread: number;
  canReply: boolean;
};

export type DirectMessage = { id: number; sender: string; recipient: string; body: string; createdAt: Date; readAt: Date | null };

export type Privacy = { homeName: string | null; home: LatLon | null; allowMessages: boolean; showGarage: boolean };

function fail(message: string): never {
  throw new Error(/permission|violat|row-level/i.test(message) ? 'Dieser Fahrer möchte gerade keine Nachrichten bekommen.' : /function|relation|column|JWT/i.test(message) ? 'Das hat nicht geklappt. Bitte nochmal versuchen.' : message);
}

type DriverRow = {
  id: string; display_name: string; car: string | null; home_name: string | null; home_lat: number | null; home_lon: number | null;
  allow_messages: boolean; garage: { brand?: string | null; model?: string | null; look?: CarLook | null }[] | null; member_since: string | null; is_me: boolean;
};

export async function listDrivers(): Promise<Driver[]> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return [];
  const { data, error } = await supabase.rpc('community_drivers');
  if (error) fail(error.message);
  return ((data ?? []) as DriverRow[]).map((r) => ({
    id: r.id,
    name: r.display_name,
    car: r.car,
    homeName: r.home_name,
    home: r.home_lat != null && r.home_lon != null ? [r.home_lat, r.home_lon] : null,
    allowMessages: r.allow_messages,
    garage: r.garage
      ? r.garage
          .map((g) => {
            const b = (g.brand ?? '').trim();
            const m = (g.model ?? '').trim();
            return { name: b && !m.toLowerCase().startsWith(b.toLowerCase()) ? `${b} ${m}`.trim() : m || b, look: g.look ?? null };
          })
          .filter((g) => g.name)
      : null,
    memberSince: r.member_since ? new Date(r.member_since) : null,
    isMe: r.is_me,
  }));
}

// Eigene Einstellungen ------------------------------------------------------------------------

export async function loadPrivacy(): Promise<Privacy | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase.from('profiles').select('home_name,home_lat,home_lon,allow_messages,show_garage').eq('id', u.user.id).maybeSingle();
  if (error) fail(error.message);
  const r = data as { home_name: string | null; home_lat: number | null; home_lon: number | null; allow_messages: boolean; show_garage: boolean } | null;
  return {
    homeName: r?.home_name ?? null,
    home: r?.home_lat != null && r?.home_lon != null ? [r.home_lat, r.home_lon] : null,
    allowMessages: r?.allow_messages ?? true,
    showGarage: r?.show_garage ?? true,
  };
}

export async function savePrivacy(p: Partial<Privacy>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Bitte anmelden.');
  const row: Record<string, unknown> = { id: u.user.id };
  if ('homeName' in p || 'home' in p) {
    row.home_name = p.homeName?.trim().slice(0, 80) || null;
    row.home_lat = p.home ? p.home[0] : null;
    row.home_lon = p.home ? p.home[1] : null;
  }
  if (p.allowMessages != null) row.allow_messages = p.allowMessages;
  if (p.showGarage != null) row.show_garage = p.showGarage;
  const { error } = await supabase.from('profiles').upsert(row);
  if (error) fail(error.message);
}

// Nachrichten ---------------------------------------------------------------------------------

export async function listConversations(): Promise<Conversation[]> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return [];
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) fail(error.message);
  return ((data ?? []) as { partner: string; display_name: string | null; car: string | null; last_body: string; last_at: string; last_from_me: boolean; unread: number; can_reply: boolean }[]).map((r) => ({
    partner: r.partner,
    name: r.display_name ?? 'Fahrer',
    car: r.car,
    lastBody: r.last_body,
    lastAt: new Date(r.last_at),
    lastFromMe: r.last_from_me,
    unread: r.unread ?? 0,
    canReply: r.can_reply,
  }));
}

export async function sendDirect(partner: string, body: string) {
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  const { error } = await supabase.from('direct_messages').insert({ recipient: partner, body: text });
  if (error) fail(error.message);
  void refreshUnread();
}

export async function markRead(partner: string) {
  await supabase.rpc('mark_read', { partner });
  void refreshUnread();
}

const toMsg = (r: { id: number; sender: string; recipient: string; body: string; created_at: string; read_at: string | null }): DirectMessage => ({
  id: r.id,
  sender: r.sender,
  recipient: r.recipient,
  body: r.body,
  createdAt: new Date(r.created_at),
  readAt: r.read_at ? new Date(r.read_at) : null,
});

/** Unterhaltung mit einem Fahrer laden und live halten; neue Nachrichten an mich gelten als gelesen. */
export function useDirectChat(me: string | undefined, partner: string | undefined) {
  const [list, setList] = useState<DirectMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!me || !partner) return;
    let alive = true;
    const load = async () => {
      const { data, error: e } = await supabase
        .from('direct_messages')
        .select('id,sender,recipient,body,created_at,read_at')
        .or(`and(sender.eq.${me},recipient.eq.${partner}),and(sender.eq.${partner},recipient.eq.${me})`)
        .order('created_at')
        .limit(500);
      if (!alive) return;
      if (e) {
        setError('Nachrichten konnten nicht geladen werden.');
        return;
      }
      setList((data ?? []).map(toMsg));
      setError(null);
      void markRead(partner);
    };
    void load();
    const ch = supabase
      .channel(`dm:${me}:${partner}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (p) => {
        const m = toMsg(p.new as Parameters<typeof toMsg>[0]);
        const mine = (m.sender === me && m.recipient === partner) || (m.sender === partner && m.recipient === me);
        if (!mine) return;
        setList((l) => (l && !l.some((x) => x.id === m.id) ? [...l, m] : l));
        if (m.sender === partner) void markRead(partner);
      })
      .subscribe();
    const t = setInterval(() => void load(), 20000);
    return () => {
      alive = false;
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [me, partner]);
  return { list, error };
}

// Ungelesen (für Plaketten) -------------------------------------------------------------------

let unread = 0;
const listeners = new Set<() => void>();

export async function refreshUnread() {
  try {
    const { data: s } = await supabase.auth.getSession();
    const n = s.session ? (((await supabase.rpc('unread_messages')).data as number | null) ?? 0) : 0;
    if (n !== unread) {
      unread = n;
      for (const l of listeners) l();
    }
  } catch {
    // ohne Netz bleibt der letzte Stand
  }
}

export function useUnreadMessages(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unread,
  );
}

/** Abstand in km zwischen zwei Orten (für die Sortierung nach Nähe zum eigenen Wohnort) */
export function kmBetween(a: LatLon, b: LatLon): number {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}
