/**
 * Gemeinsam losfahren (Konzept Koray 14.11.): Stand am Tag, Anpingen, freiwillig geteilte Ankunft,
 * Abfahrt und Treffpunkt ändern, Starten im Fenster ab 2 Stunden vorher, Lead übergeben und übernehmen.
 * Server: supabase/migrations/20261114080000_gemeinsam_losfahren.sql
 */
import * as Location from 'expo-location';

import { supabase } from './supabase';
import { haversine, type LatLon } from './tour';

export const ARRIVED_M = 300;
export const START_WINDOW_MS = 2 * 3600 * 1000;
export const TAKE_LEAD_AFTER_MS = 15 * 60 * 1000;
/** Ab wann ist "der Tag": 4 Stunden vor der Abfahrt */
export const DAY_BEFORE_MS = 4 * 3600 * 1000;

export type DayRow = { userId: string; arrived: boolean; etaMin: number | null; at: LatLon | null; pingedAt: Date | null; isLead: boolean };

function fail(message: string): never {
  throw new Error(/^[A-ZÄÖÜ]/.test(message) && !/violat|permission|function|relation|column|JWT/i.test(message) ? message : 'Das hat nicht geklappt. Bitte nochmal versuchen.');
}

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error.message);
  return data;
}

export async function rideDay(ride: string): Promise<DayRow[]> {
  const rows = ((await call('ride_day', { ride })) ?? []) as {
    user_id: string; arrived: boolean; eta_min: number | null; eta_lat: number | null; eta_lon: number | null; pinged_at: string | null; is_lead: boolean;
  }[];
  return rows.map((r) => ({
    userId: r.user_id,
    arrived: r.arrived,
    etaMin: r.eta_min,
    at: r.eta_lat != null && r.eta_lon != null ? [r.eta_lat, r.eta_lon] : null,
    pingedAt: r.pinged_at ? new Date(r.pinged_at) : null,
    isLead: r.is_lead,
  }));
}

export const pingMember = (ride: string, who: string) => call('ride_ping', { ride, who });
export const startRideNow = (ride: string) => call('ride_start', { ride });
export const giveLead = (ride: string, who: string | null) => call('ride_give_lead', { ride, who });
export const takeLead = (ride: string) => call('ride_take_lead', { ride });
export const changeRide = (ride: string, startsAt: Date | null, meeting: { name: string; lat: number; lon: number } | null) =>
  call('ride_change', { ride, new_starts: startsAt?.toISOString() ?? null, new_meeting: meeting });

/** Bin ich am Treffpunkt? Dann meldet die App "da" (ohne den Standort zu teilen) */
export async function checkArrived(ride: string, meeting: LatLon): Promise<boolean> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') return false;
  const loc = await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000, requiredAccuracy: 150 }).catch(() => null);
  if (!loc) return false;
  if (haversine([loc.coords.latitude, loc.coords.longitude], meeting) > ARRIVED_M) return false;
  await call('ride_arrived', { ride });
  return true;
}

/**
 * Teilen der Ankunft nach dem Anpingen: gilt für eine Ausfahrt, bis man ankommt oder die Gruppe losfährt.
 * Die Navigation meldet damit jede Minute Minuten und Punkt (navigation.tsx).
 */
let sharing: { ride: string; meeting: LatLon } | null = null;
export function startSharing(ride: string, meeting: LatLon) {
  sharing = { ride, meeting };
}
export function sharingFor(): { ride: string; meeting: LatLon } | null {
  return sharing;
}
export async function reportEta(minutes: number, at: LatLon) {
  if (!sharing) return;
  const s = sharing;
  if (haversine(at, s.meeting) <= ARRIVED_M) {
    sharing = null;
    await call('ride_arrived', { ride: s.ride }).catch(() => undefined);
    return;
  }
  await call('ride_share_eta', { ride: s.ride, minutes: Math.round(minutes), lat: at[0], lon: at[1] }).catch(() => undefined);
}
export async function stopSharing() {
  if (!sharing) return;
  const s = sharing;
  sharing = null;
  await call('ride_stop_eta', { ride: s.ride }).catch(() => undefined);
}
