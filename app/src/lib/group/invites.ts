/**
 * Gruppenfahrten mit Einladung (Supabase Tabellen rides und ride_members, Funktionen aus der
 * Migration 20261105090000_namen_einladungen.sql). Der Ersteller lädt Mitfahrer mit ihrem Namen ein,
 * höchstens 6 Fahrzeuge inklusive Ersteller. Eingeladene sagen zu oder ab und fahren dann mit.
 */
import { packTour, unpackTour, type Packed } from '../handoff';
import type { SavedTour } from '../library';
import { supabase } from '../supabase';
import type { Profile, Tour } from '../tour';
import type { Avoid } from '../valhalla';
import type { Role } from './ride';

export type InviteStatus = 'eingeladen' | 'zugesagt' | 'abgesagt';

export type RideMemberRow = {
  userId: string;
  name: string;
  vehicle: string | null;
  status: InviteStatus;
  role: Role;
  isOwner: boolean;
};

export type MyInvite = {
  rideId: string;
  name: string;
  ownerName: string;
  km: number | null;
  rideStatus: 'geplant' | 'laeuft' | 'beendet';
  myStatus: InviteStatus;
  startsAt: string | null;
  createdAt: string;
};

/** Größe der Gruppe ohne Enterprise Stufe (Fahrzeuge inklusive Ersteller). */
export const DEFAULT_MAX_MEMBERS = 6;

function fail(message: string): never {
  // Meldungen aus den Funktionen sind schon deutsch, technische Fehler bekommen einen Standardtext
  throw new Error(/^[A-ZÄÖÜ][^\n]*$/.test(message) && !/violat|permission|function|relation|column/i.test(message) ? message : 'Das hat nicht geklappt. Bitte nochmal versuchen.');
}

/** Nur die Tourdaten, ohne Felder aus Meine Touren (ID, Ordner, Abgleich). */
function plainTour(t: SavedTour): Tour & { minutes?: number } {
  return { name: t.name, laenge_km: t.laenge_km, km_je_klasse: t.km_je_klasse, wegpunkte: t.wegpunkte, linie: t.linie, warnungen: t.warnungen, geprueft: t.geprueft, minutes: t.minutes };
}

/** Fahrt für eine gespeicherte Tour anlegen; der Ersteller ist automatisch Lead. Liefert die ID und die Gruppengröße. */
export async function createGroupRide(t: SavedTour, avoid?: Avoid): Promise<{ id: string; maxMembers: number }> {
  const { data, error } = await supabase
    .from('rides')
    .insert({ name: t.name.slice(0, 120) || 'Gruppenfahrt', tour: packTour(plainTour(t), t.profile ?? 'kurvig', avoid), tour_id: t.cloudId ?? null })
    .select('id,max_members')
    .single();
  if (error) fail(error.message);
  const row = data as { id: string; max_members: number };
  return { id: row.id, maxMembers: row.max_members };
}

/** Eigene, noch nicht beendete Fahrt zu dieser Tour (zum Weitermachen nach dem Zurückkommen). */
export async function findPlannedRide(cloudId: string | undefined): Promise<{ id: string; maxMembers: number } | null> {
  if (!cloudId) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from('rides')
    .select('id,max_members')
    .eq('owner', u.user.id)
    .eq('tour_id', cloudId)
    .in('status', ['geplant', 'laeuft'])
    .gt('created_at', new Date(Date.now() - 2 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; max_members: number } | null;
  return row ? { id: row.id, maxMembers: row.max_members } : null;
}

export async function inviteToRide(rideId: string, userId: string) {
  const { error } = await supabase.rpc('invite_to_ride', { ride: rideId, member: userId });
  if (error) fail(error.message);
}

/** Eingeladenen wieder aus der Fahrt nehmen (nur Ersteller). */
export async function removeFromRide(rideId: string, userId: string) {
  const { error } = await supabase.from('ride_members').delete().eq('ride_id', rideId).eq('user_id', userId);
  if (error) fail(error.message);
}

export async function rideOverview(rideId: string): Promise<RideMemberRow[]> {
  const { data, error } = await supabase.rpc('ride_overview', { ride: rideId });
  if (error) fail(error.message);
  return ((data ?? []) as { user_id: string; display_name: string | null; vehicle: string | null; status: InviteStatus; role: Role; is_owner: boolean }[]).map((r) => ({
    userId: r.user_id,
    name: r.display_name ?? 'Fahrer',
    vehicle: r.vehicle,
    status: r.status,
    role: r.role,
    isOwner: r.is_owner,
  }));
}

export async function myInvites(): Promise<MyInvite[]> {
  const { data, error } = await supabase.rpc('my_ride_invites');
  if (error) fail(error.message);
  return ((data ?? []) as { ride_id: string; name: string; owner_name: string | null; km: number | string | null; ride_status: MyInvite['rideStatus']; my_status: InviteStatus; starts_at: string | null; created_at: string }[]).map((r) => ({
    rideId: r.ride_id,
    name: r.name,
    ownerName: r.owner_name ?? 'Jemand',
    km: r.km != null ? Number(r.km) : null,
    rideStatus: r.ride_status,
    myStatus: r.my_status,
    startsAt: r.starts_at,
    createdAt: r.created_at,
  }));
}

/** Zusagen oder absagen, beim Zusagen mit dem eigenen Fahrzeug. */
export async function respondInvite(rideId: string, accept: boolean, vehicle?: string | null) {
  const { error } = await supabase.rpc('respond_invite', { ride: rideId, accept, my_vehicle: vehicle?.trim() || null });
  if (error) fail(error.message);
}

/** Absagen mit freiwilligem Grund (Koray 12.11.); der Veranstalter sieht ihn still in der Ausfahrt */
export async function declineInvite(rideId: string, reason?: string | null) {
  const { error } = await supabase.rpc('decline_invite', { ride: rideId, reason: reason?.trim() || null });
  if (error) fail(error.message);
}

/** Status der Fahrt setzen (nur Ersteller): läuft beim Start, beendet am Ende. */
export async function setRideStatus(rideId: string, status: 'laeuft' | 'beendet') {
  const { error } = await supabase.from('rides').update({ status }).eq('id', rideId);
  if (error) fail(error.message);
}

/** Tour der Fahrt laden (für Eingeladene, die mitfahren). */
export async function loadRideTour(rideId: string): Promise<{ name: string; tour: Tour & { minutes?: number }; profile: Profile; avoid?: Avoid } | null> {
  const { data, error } = await supabase.from('rides').select('name,tour').eq('id', rideId).maybeSingle();
  if (error) fail(error.message);
  const row = data as { name: string; tour: Packed | null } | null;
  if (!row?.tour) return null;
  return { name: row.name, ...unpackTour(row.tour) };
}
