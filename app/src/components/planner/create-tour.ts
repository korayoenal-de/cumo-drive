/**
 * Ablauf "Tour erstellen" ohne Oberfläche: Standort holen, Orte auflösen, Rundtour bauen,
 * prüfen und gesperrte Stellen umfahren. Kann auch vom Web Planer genutzt werden.
 */
import * as Location from 'expo-location';

import { searchPlaces, reverseName, type Place } from '@/lib/geocode';
import { planChecked, type PlannedTour } from '@/lib/plan';
import { bearingTo, roundTrip, type Direction } from '@/lib/roundtrip';
import type { LatLon, Profile } from '@/lib/tour';
import type { Avoid } from '@/lib/valhalla';

export type PlanPhase = 'start' | 'route' | 'check' | 'fix';

export const PHASES: { id: PlanPhase; label: string }[] = [
  { id: 'start', label: 'Startort bestimmen' },
  { id: 'route', label: 'Route berechnen' },
  { id: 'check', label: 'Prüfen' },
  { id: 'fix', label: 'Gesperrte Stellen umfahren' },
];

export type PlanErrorKind = 'permission' | 'services' | 'position' | 'notfound' | 'network' | 'routing' | 'aborted';

export class PlanError extends Error {
  kind: PlanErrorKind;
  constructor(kind: PlanErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type Spot = { p: LatLon; name: string };

export type TourRequest = {
  start: Spot;
  km: number;
  direction: Direction;
  /** Peilung zu einer Ziel Region, überschreibt direction */
  bearing?: number;
  towardName?: string;
  profile: Profile;
  avoid: Avoid;
};

/** Aktueller Standort mit Ortsname. Fragt bei Bedarf nach der Berechtigung. */
export async function locate(signal?: AbortSignal): Promise<Spot> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== Location.PermissionStatus.GRANTED && perm.canAskAgain) {
    perm = await Location.requestForegroundPermissionsAsync();
  }
  if (perm.status !== Location.PermissionStatus.GRANTED) {
    throw new PlanError('permission', 'Du hast den Standort nicht freigegeben. Ohne ihn wissen wir nicht, wo die Rundtour starten soll.');
  }
  const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!enabled) {
    throw new PlanError('services', 'Die Ortungsdienste deines Handys sind aus.');
  }
  let pos: Location.LocationObject | null = null;
  try {
    pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1000 });
    if (!pos) pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    pos = null;
  }
  if (!pos) throw new PlanError('position', 'Dein Standort ließ sich gerade nicht bestimmen.');
  const p: LatLon = [pos.coords.latitude, pos.coords.longitude];
  const name = await reverseName(p, signal);
  return { p, name };
}

/** Erster Treffer der Ortssuche oder ein freundlicher Fehler. */
export async function findPlace(q: string, near: LatLon | undefined, what: string, signal?: AbortSignal): Promise<Place> {
  const hits = await searchPlaces(q, near, signal);
  if (!hits.length) throw new PlanError('notfound', `${what} "${q}" haben wir nicht gefunden.`);
  return hits[0];
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

/** Rundtour bauen und prüfen. */
export async function buildTour(
  req: TourRequest,
  seed: number,
  onPhase: (p: PlanPhase) => void,
  signal?: AbortSignal,
): Promise<PlannedTour> {
  onPhase('route');
  const rt = await roundTrip(
    { start: req.start.p, km: req.km, direction: req.direction, bearing: req.bearing, profile: req.profile, avoid: req.avoid, seed },
    signal,
  );
  return planChecked(
    `Rundtour ab ${req.start.name}`,
    [req.start.p, ...rt.via, req.start.p],
    req.profile,
    req.avoid,
    (s) => onPhase(s),
    signal,
    true,
  );
}

/** Beliebigen Fehler in einen PlanError mit Art übersetzen. */
export function toPlanError(e: unknown, signal?: AbortSignal): PlanError {
  if (e instanceof PlanError) return e;
  if (signal?.aborted || (e instanceof Error && e.name === 'AbortError')) return new PlanError('aborted', 'Abgebrochen.');
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed|failed to fetch|networkerror|load failed|timed? ?out/i.test(msg) || e instanceof TypeError) {
    return new PlanError('network', 'Der Routenplaner ist gerade nicht erreichbar.');
  }
  if (msg.startsWith('Routenplaner')) {
    return new PlanError('routing', 'Für diese Einstellungen hat der Routenplaner keine passende Runde gefunden.');
  }
  if (msg.startsWith('Ortssuche')) {
    return new PlanError('network', 'Die Ortssuche ist gerade nicht erreichbar.');
  }
  return new PlanError('routing', 'Beim Planen ist etwas schiefgegangen.');
}
