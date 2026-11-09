/**
 * Ablauf "Tour erstellen" ohne Oberfläche: Standort holen, Orte auflösen, Rundtour bauen,
 * prüfen und gesperrte Stellen umfahren. Kann auch vom Web Planer genutzt werden.
 */
import * as Location from 'expo-location';

import { searchTowns, reverseName, type Place } from '@/lib/geocode';
import type { PlannedTour } from '@/lib/plan';
import type { Direction } from '@/lib/roundtrip';
import { smartRoundTrip } from '@/lib/smart-roundtrip';
import type { LatLon, Profile } from '@/lib/tour';
import type { Avoid } from '@/lib/valhalla';

export type PlanPhase = 'start' | 'route' | 'compare' | 'traffic' | 'check' | 'fix';

export const PHASES: { id: PlanPhase; label: string }[] = [
  { id: 'start', label: 'Startort bestimmen' },
  { id: 'route', label: 'Route berechnen' },
  { id: 'compare', label: 'Beste Runde wählen' },
  { id: 'traffic', label: 'Verkehrsmeldungen prüfen' },
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
  /** Hinweis zum Ergebnis, zum Beispiel warum die Runde länger wurde */
  note?: string;
  profile: Profile;
  avoid: Avoid;
};

/** Höchstalter der Position, wenn ausdrücklich der aktuelle Standort gefragt ist */
export const FRESH_MS = 30 * 1000;

/**
 * Aktueller Standort mit Ortsname. Fragt bei Bedarf nach der Berechtigung.
 * maxAgeMs: wie alt eine gespeicherte Position höchstens sein darf (beim ausdrücklichen
 * Tippen auf Mein Standort kurz, damit nach einer Fahrt nicht der alte Ort zurückkommt).
 */
export async function locate(signal?: AbortSignal, maxAgeMs = 5 * 60 * 1000): Promise<Spot> {
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
    pos = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: 1000 });
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
/** Bekannte Fahrregionen: Ortssuchen finden sonst gleichnamige Dörfer (es gibt Orte namens Schwarzwald). */
const REGIONS: { names: string[]; name: string; p: LatLon }[] = [
  { names: ['schwarzwald'], name: 'Schwarzwald', p: [48.3, 8.2] },
  { names: ['nordschwarzwald'], name: 'Nordschwarzwald', p: [48.65, 8.35] },
  { names: ['südschwarzwald', 'suedschwarzwald'], name: 'Südschwarzwald', p: [47.85, 8.05] },
  { names: ['odenwald'], name: 'Odenwald', p: [49.62, 8.95] },
  { names: ['pfalz', 'pfälzerwald', 'pfaelzerwald', 'pfälzer wald'], name: 'Pfälzerwald', p: [49.3, 7.85] },
  { names: ['vogesen', 'vosges'], name: 'Vogesen', p: [48.05, 7.0] },
  { names: ['elsass', 'elsaß', 'alsace'], name: 'Elsass', p: [48.3, 7.45] },
  { names: ['spessart'], name: 'Spessart', p: [50.0, 9.4] },
  { names: ['taunus'], name: 'Taunus', p: [50.25, 8.4] },
  { names: ['hunsrück', 'hunsrueck'], name: 'Hunsrück', p: [49.9, 7.3] },
  { names: ['eifel'], name: 'Eifel', p: [50.3, 6.7] },
  { names: ['mosel', 'moseltal'], name: 'Moseltal', p: [49.95, 7.1] },
  { names: ['westerwald'], name: 'Westerwald', p: [50.6, 7.9] },
  { names: ['kraichgau'], name: 'Kraichgau', p: [49.15, 8.8] },
  { names: ['rhön', 'rhoen'], name: 'Rhön', p: [50.45, 9.95] },
  { names: ['vogelsberg'], name: 'Vogelsberg', p: [50.5, 9.2] },
  { names: ['sauerland'], name: 'Sauerland', p: [51.2, 8.2] },
  { names: ['harz'], name: 'Harz', p: [51.75, 10.6] },
  { names: ['schwäbische alb', 'schwaebische alb', 'alb'], name: 'Schwäbische Alb', p: [48.4, 9.4] },
  { names: ['allgäu', 'allgaeu'], name: 'Allgäu', p: [47.6, 10.3] },
  { names: ['bayerischer wald'], name: 'Bayerischer Wald', p: [49.0, 13.2] },
  { names: ['fichtelgebirge'], name: 'Fichtelgebirge', p: [50.05, 11.85] },
  { names: ['fränkische schweiz', 'fraenkische schweiz'], name: 'Fränkische Schweiz', p: [49.8, 11.3] },
  { names: ['thüringer wald', 'thueringer wald'], name: 'Thüringer Wald', p: [50.65, 10.75] },
  { names: ['dolomiten', 'dolomites'], name: 'Dolomiten', p: [46.5, 11.9] },
];

export function findRegion(q: string): { name: string; p: LatLon } | null {
  const n = q.toLowerCase().replace(/^(den|die|das|dem|der)\s+/, '').trim();
  return REGIONS.find((r) => r.names.includes(n)) ?? null;
}

export async function findPlace(q: string, near: LatLon | undefined, what: string, signal?: AbortSignal): Promise<Place> {
  const region = findRegion(q);
  if (region) return { name: region.name, detail: 'Region', p: region.p };
  const hits = await searchTowns(q, near, signal);
  if (!hits.length) throw new PlanError('notfound', `${what} "${q}" haben wir nicht gefunden.`);
  return hits[0];
}

export function newSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

/** Rundtour bauen und prüfen (GraphHopper Varianten, sonst Valhalla). */
export async function buildTour(
  req: TourRequest,
  seed: number,
  onPhase: (p: PlanPhase) => void,
  signal?: AbortSignal,
): Promise<PlannedTour> {
  return smartRoundTrip(
    {
      name: `Rundtour ab ${req.start.name}`,
      start: req.start.p,
      km: req.km,
      direction: req.direction,
      bearing: req.bearing,
      profile: req.profile,
      avoid: req.avoid,
      seed,
    },
    (s: PlanPhase) => onPhase(s),
    signal,
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
