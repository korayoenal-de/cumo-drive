/**
 * Losfahren in einer Gruppenfahrt mit Einladung: Tour als aktive Tour setzen und dem Live Kanal
 * der Fahrt beitreten, mit eigenem Namen aus dem Profil und dem aktuellen Fahrzeug aus der Garage.
 */
import { setActiveTour } from '../active-tour';
import { myProfile } from '../profile';
import { supabase } from '../supabase';
import { currentVehicle, vehicleName } from '../vehicle';
import { DEFAULT_AVOID } from '../valhalla';
import { loadRideTour, rideOverview } from './invites';
import { startRide, type Role } from './ride';

function myCar(): string {
  return (() => { const v = currentVehicle(); return v ? vehicleName(v) : ''; })() || myProfile()?.car || '';
}

function myName(): string {
  return myProfile()?.displayName ?? 'Fahrer';
}

/** Eigene Fahrzeugbezeichnung für Einladungen und Zusagen. */
export function myVehicleLabel(): string {
  return myCar();
}

/** Ersteller startet die Fahrt als Lead (die Tour ist schon geladen und wird übergeben). */
export async function startAsLead(rideId: string, rideName: string, tour: Parameters<typeof setActiveTour>[0], profile: Parameters<typeof setActiveTour>[1]) {
  setActiveTour(tour, profile, DEFAULT_AVOID);
  await startRide(rideId, 'lead', { name: myName(), car: myCar(), rideName });
}

/** Eingeladene fahren mit: Tour der Fahrt laden, Rolle aus der Fahrt übernehmen, Kanal beitreten. */
export async function rideAlong(rideId: string) {
  const t = await loadRideTour(rideId);
  if (!t) throw new Error('Zu dieser Fahrt gibt es keine Tour.');
  let role: Role = 'mitfahrer';
  try {
    const { data } = await supabase.auth.getUser();
    const mine = (await rideOverview(rideId)).find((m) => m.userId === data.user?.id);
    if (mine?.role) role = mine.role;
  } catch {
    // ohne Übersicht als Mitfahrer
  }
  setActiveTour(t.tour, t.profile, t.avoid ?? DEFAULT_AVOID);
  await startRide(rideId, role, { name: myName(), car: myCar(), rideName: t.name });
}
