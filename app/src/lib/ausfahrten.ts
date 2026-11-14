/**
 * Community Ausfahrten (Koray 9.11.): veröffentlichte Gruppenfahrten mit Zeit und Treffpunkt.
 * Abonnenten legen sie aus einer eigenen Tour an, andere fragen an, der Organisator nimmt an oder
 * lehnt ab. Angenommene sind im Chat und fahren am Tag als Gruppe mit (wie bei Einladungen).
 * Funktionen und Tabellen aus supabase/migrations/20261109230000_community_ausfahrten.sql.
 * Push folgt mit expo-notifications im nächsten nativen Build; bis dahin zeigt die App offene
 * Anfragen beim Öffnen der Community.
 */
import { useEffect, useState } from 'react';

import { saveCloudTour } from './cloud-tours';
import { patchTour, type SavedTour } from './library';
import { supabase } from './supabase';
import { unpackTour, type Packed } from './tour-pack';
import type { LatLon, Profile, Tour } from './tour';

export type MemberStatus = 'eingeladen' | 'zugesagt' | 'abgesagt' | 'angefragt' | 'abgelehnt';

export type MeetingPoint = { name: string; lat: number; lon: number };

export type Ausfahrt = {
  id: string;
  name: string;
  ownerName: string;
  ownerCar: string | null;
  startsAt: Date;
  meeting: MeetingPoint | null;
  note: string | null;
  km: number | null;
  minutes: number | null;
  start: LatLon | null;
  end: LatLon | null;
  goalName: string | null;
  /** Start und Ziel liegen nah beieinander */
  roundTrip: boolean;
  taken: number;
  maxMembers: number;
  myStatus: MemberStatus | null;
  isOwner: boolean;
  openRequests: number;
  rideStatus: 'geplant' | 'laeuft' | 'beendet';
  /** in der Community sichtbar; sonst privat, nur für Organisator und Eingeladene (Koray 13.11.) */
  isPublic: boolean;
  /** vorbei (Koray 14.11.): beendet, oder 3 Stunden nach der geplanten Rückkehr, spätestens Mitternacht */
  isOver: boolean;
  /** echte Fahrt: Start und Ende, wenn sie lief */
  startedAt: Date | null;
  endedAt: Date | null;
};

export type Anfrage = {
  userId: string;
  name: string;
  vehicle: string | null;
  message: string | null;
  requestedAt: Date;
  memberSince: Date | null;
  drives: number;
  driveKm: number;
};

export type Teilnehmer = { userId: string; name: string; vehicle: string | null; isOwner: boolean };

export type Nachricht = { id: number; userId: string; body: string; createdAt: Date };

function fail(message: string): never {
  // Meldungen aus den Funktionen sind deutsch, technische Fehler bekommen einen Standardtext
  throw new Error(/^[A-ZÄÖÜ][^\n]*$/.test(message) && !/violat|permission|function|relation|column|JWT/i.test(message) ? message : 'Das hat nicht geklappt. Bitte nochmal versuchen.');
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

function dist(a: LatLon, b: LatLon) {
  const dLat = (b[0] - a[0]) * 111;
  const dLon = (b[1] - a[1]) * 111 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

type Row = {
  id: string; name: string; owner_name: string | null; owner_car: string | null; starts_at: string; meeting_point: MeetingPoint | null;
  note: string | null; km: number | string | null; minutes: number | null; start_lat: number | null; start_lon: number | null;
  end_lat: number | null; end_lon: number | null; goal_name: string | null; taken: number; max_members: number;
  my_status: MemberStatus | null; is_owner: boolean; open_requests: number; ride_status: Ausfahrt['rideStatus'];
  is_public?: boolean | null;
  is_over?: boolean | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export async function listAusfahrten(): Promise<Ausfahrt[]> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return [];
  const { data, error } = await supabase.rpc('community_rides');
  if (error) fail(error.message);
  return ((data ?? []) as Row[]).map((r) => {
    const start: LatLon | null = r.start_lat != null && r.start_lon != null ? [r.start_lat, r.start_lon] : null;
    const end: LatLon | null = r.end_lat != null && r.end_lon != null ? [r.end_lat, r.end_lon] : null;
    return {
      id: r.id,
      name: r.name,
      ownerName: r.owner_name ?? 'Fahrer',
      ownerCar: r.owner_car,
      startsAt: new Date(r.starts_at),
      meeting: r.meeting_point && typeof r.meeting_point.lat === 'number' ? r.meeting_point : null,
      note: r.note,
      km: num(r.km),
      minutes: num(r.minutes),
      start,
      end,
      goalName: r.goal_name,
      roundTrip: !!start && !!end && dist(start, end) < 3,
      taken: r.taken,
      maxMembers: r.max_members,
      myStatus: r.my_status,
      isOwner: r.is_owner,
      openRequests: r.open_requests ?? 0,
      rideStatus: r.ride_status,
      // ältere Server ohne Spalte: dort kamen nur öffentliche Ausfahrten
      isPublic: r.is_public ?? true,
      // ältere Server ohne Spalte: dort kamen nur anstehende Ausfahrten
      isOver: r.is_over ?? false,
      startedAt: r.started_at ? new Date(r.started_at) : null,
      endedAt: r.ended_at ? new Date(r.ended_at) : null,
    };
  });
}

export async function ausfahrtTour(id: string): Promise<{ tour: Tour & { minutes?: number }; profile: Profile } | null> {
  const { data, error } = await supabase.rpc('community_ride_tour', { ride: id });
  if (error) fail(error.message);
  if (!data) return null;
  return unpackTour(data as Packed);
}

export type Absage = { userId: string; name: string; reason: string | null };

/** Absagen für den Veranstalter, still ohne Zahl (Koray 12.11.) */
export async function ausfahrtAbsagen(id: string): Promise<Absage[]> {
  const { data, error } = await supabase.rpc('ride_declines', { ride: id });
  if (error) return [];
  return ((data ?? []) as { user_id: string; display_name: string | null; reason: string | null }[]).map((r) => ({ userId: r.user_id, name: r.display_name ?? 'Fahrer', reason: r.reason }));
}

/** „Heute“, „Morgen“, „in 3 Tagen“, „in 2 Wochen“ */
export function relDay(d: Date, now = new Date()): string {
  const day = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);
  const n = day(d) - day(now);
  if (n <= 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n < 14) return `in ${n} Tagen`;
  return `in ${Math.round(n / 7)} Wochen`;
}

export async function ausfahrtTeilnehmer(id: string): Promise<Teilnehmer[]> {
  const { data, error } = await supabase.rpc('community_ride_members', { ride: id });
  if (error) fail(error.message);
  return ((data ?? []) as { user_id: string; display_name: string | null; vehicle: string | null; is_owner: boolean }[]).map((r) => ({
    userId: r.user_id,
    name: r.display_name ?? 'Fahrer',
    vehicle: r.vehicle,
    isOwner: r.is_owner,
  }));
}

/** Ausfahrt aus einer eigenen Tour veröffentlichen; die Tour kommt dafür ins Konto. */
export async function publishAusfahrt(t: SavedTour, opts: { startsAt: Date; meeting: MeetingPoint | null; note: string; seats: number; public?: boolean }): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new Error('Zum Veröffentlichen brauchst du ein Konto (Einstellungen).');
  // Die gemerkte Konto ID kann fremd oder gelöscht sein (anderes Konto, Kopie aus der Community).
  // Ein Update auf eine fremde Zeile schlägt still fehl, deshalb erst prüfen, ob sie uns gehört.
  let cloudId: string | undefined = t.cloudId;
  if (cloudId) {
    const { data: own } = await supabase.from('tours').select('id').eq('id', cloudId).eq('owner', s.session.user.id).maybeSingle();
    if (!own) cloudId = undefined;
  }
  if (!cloudId || cloudId !== t.cloudId || !t.syncedAt || t.syncedAt < t.updatedAt) {
    cloudId = await saveCloudTour(t, { id: cloudId, folder: t.folder, profile: t.profile });
    patchTour(t.id, { cloudId, syncedAt: new Date().toISOString() });
  }
  const { data, error } = await supabase.rpc('publish_ride', {
    p_tour: cloudId,
    p_starts: opts.startsAt.toISOString(),
    p_meeting: opts.meeting,
    p_note: opts.note.trim() || null,
    p_seats: opts.seats,
    p_public: opts.public ?? false,
  });
  if (error) fail(error.message);
  return data as string;
}

export async function cancelAusfahrt(id: string) {
  const { error } = await supabase.rpc('cancel_public_ride', { ride: id });
  if (error) fail(error.message);
}

/** Mitfahren anfragen; bei einer privaten Ausfahrt mit dem Schlüssel aus dem Einladungslink */
export async function requestAusfahrt(id: string, message: string, vehicle: string | null, key?: string | null) {
  const { error } = await supabase.rpc('request_ride', { ride: id, msg: message.trim() || null, my_vehicle: vehicle?.trim() || null, k: key ?? null });
  if (error) fail(error.message);
}

/** Einladungslink einer eigenen Ausfahrt: führt zu einer Anfrage, die du annimmst (Koray 13.11.) */
export const RIDE_LINK_BASE = 'https://drive.rallycumo.de/a';
export async function rideLink(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('ride_link_key', { ride: id });
  if (error) fail(error.message);
  return `${RIDE_LINK_BASE}#${id}.${data as string}`;
}

/** Ausfahrt und Schlüssel aus einem Einladungslink (Text nach dem #) */
export function parseRideLink(hash: string): { id: string; key: string } | null {
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{8,40})/i.exec(hash);
  return m ? { id: m[1].toLowerCase(), key: m[2].toLowerCase() } : null;
}

export type LinkedRide = { id: string; name: string; ownerName: string; startsAt: Date; km: number | null; free: number; rideStatus: Ausfahrt['rideStatus'] };

/** Eckdaten für Eingeladene per Link, noch ohne Teilnehmer und Tour */
export async function rideByLink(id: string, key: string): Promise<LinkedRide | null> {
  const { data, error } = await supabase.rpc('ride_by_link', { ride: id, k: key });
  if (error) fail(error.message);
  const r = ((data ?? []) as { id: string; name: string; owner_name: string | null; starts_at: string; km: number | string | null; max_members: number; taken: number; ride_status: Ausfahrt['rideStatus'] }[])[0];
  return r ? { id: r.id, name: r.name, ownerName: r.owner_name ?? 'Fahrer', startsAt: new Date(r.starts_at), km: num(r.km), free: Math.max(0, r.max_members - r.taken), rideStatus: r.ride_status } : null;
}

export async function withdrawAusfahrt(id: string) {
  const { error } = await supabase.rpc('withdraw_ride', { ride: id });
  if (error) fail(error.message);
}

export async function listAnfragen(id: string): Promise<Anfrage[]> {
  const { data, error } = await supabase.rpc('ride_requests', { ride: id });
  if (error) fail(error.message);
  return ((data ?? []) as { user_id: string; display_name: string | null; vehicle: string | null; message: string | null; requested_at: string; member_since: string | null; drives: number; drive_km: number | string }[]).map((r) => ({
    userId: r.user_id,
    name: r.display_name ?? 'Fahrer',
    vehicle: r.vehicle,
    message: r.message,
    requestedAt: new Date(r.requested_at),
    memberSince: r.member_since ? new Date(r.member_since) : null,
    drives: r.drives ?? 0,
    driveKm: Number(r.drive_km ?? 0),
  }));
}

export async function answerAnfrage(id: string, userId: string, accept: boolean) {
  const { error } = await supabase.rpc('answer_request', { ride: id, member: userId, accept });
  if (error) fail(error.message);
}

// Chat ---------------------------------------------------------------------------------------

export async function loadNachrichten(id: string): Promise<Nachricht[]> {
  const { data, error } = await supabase.from('ride_messages').select('id,user_id,body,created_at').eq('ride_id', id).order('created_at').limit(300);
  if (error) fail(error.message);
  return ((data ?? []) as { id: number; user_id: string; body: string; created_at: string }[]).map((r) => ({ id: r.id, userId: r.user_id, body: r.body, createdAt: new Date(r.created_at) }));
}

export async function sendNachricht(id: string, body: string) {
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  const { error } = await supabase.from('ride_messages').insert({ ride_id: id, body: text });
  if (error) fail(error.message);
}

/** Nachrichten laden und live halten (Realtime, dazu alle 20 s nachladen falls die Verbindung hakt). */
export function useNachrichten(id: string | undefined) {
  const [list, setList] = useState<Nachricht[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = () =>
      loadNachrichten(id)
        .then((l) => {
          if (!alive) return;
          setList(l);
          setError(null);
        })
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const ch = supabase
      .channel(`ride-chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${id}` }, (p) => {
        const r = p.new as { id: number; user_id: string; body: string; created_at: string };
        setList((l) => (l && !l.some((m) => m.id === r.id) ? [...l, { id: r.id, userId: r.user_id, body: r.body, createdAt: new Date(r.created_at) }] : l));
      })
      .subscribe();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [id]);
  return { list, error, reload: () => id && loadNachrichten(id).then(setList).catch(() => undefined) };
}

// Anzeige --------------------------------------------------------------------------------------

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const weekday = (d: Date) => WD[d.getDay()];
export const clock = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
/** Sa 14.11. */
export const shortDate = (d: Date) => `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
/** Samstag, 14. November */
export const longDate = (d: Date) => `${WD_LONG[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}`;
export const monthYear = (d: Date) => `${MON[d.getMonth()]} ${d.getFullYear()}`;

/** Ankunft aus Abfahrt und Fahrzeit (ohne Pausen) */
export function arrival(a: Pick<Ausfahrt, 'startsAt' | 'minutes'>): Date | null {
  return a.minutes ? new Date(a.startsAt.getTime() + a.minutes * 60000) : null;
}

export const freeSeats = (a: Pick<Ausfahrt, 'taken' | 'maxMembers'>) => Math.max(0, a.maxMembers - a.taken);

export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase();
}
