/**
 * Gemeinsame Schnittstelle für die Routenführung.
 * Die Logik (Anweisungen holen, Position verfolgen, Ansagen, Neuberechnung) lebt in
 * src/lib/navigation/, die Oberfläche (Karte, Navigationsscreen) in src/components/navigation/.
 */
import type { LatLon, Profile, Tour } from '../tour';
import type { Avoid } from '../valhalla';

/** Art des Manövers, grob, für Pfeil Symbole. */
export type ManeuverKind =
  | 'start'
  | 'ziel'
  | 'geradeaus'
  | 'leicht_links'
  | 'links'
  | 'scharf_links'
  | 'leicht_rechts'
  | 'rechts'
  | 'scharf_rechts'
  | 'wenden'
  | 'kreisverkehr'
  | 'auffahrt'
  | 'abfahrt'
  | 'zwischenziel';

export type Maneuver = {
  kind: ManeuverKind;
  /** Anweisung zum Lesen, zum Beispiel "Links abbiegen auf L 3120" */
  text: string;
  /** Anweisung zum Vorlesen (kann ausführlicher sein) */
  speech: string;
  /** Straßenname oder Nummer nach dem Manöver */
  street?: string;
  /** Ausfahrt im Kreisverkehr, falls bekannt */
  exit?: number;
  /** Index im Shape der NavRoute, an dem das Manöver liegt */
  index: number;
  /** km ab Start der NavRoute */
  km: number;
};

export type NavRoute = {
  shape: LatLon[];
  /** km ab Start für jeden Shape Punkt (gleich lang wie shape) */
  cumKm: number[];
  maneuvers: Maneuver[];
  km: number;
  minutes: number;
  /** Quelle der Anweisungen */
  source: 'cumo' | 'valhalla';
};

/** einsteigen: an der nächsten passenden Stelle in die Tour; start: erst zum Startpunkt fahren */
export type NavEntry = 'einsteigen' | 'start';

export type NavRequest = {
  tour: Tour;
  profile: Profile;
  avoid: Avoid;
  entry?: NavEntry;
};

export type NavState = {
  status: 'bereit' | 'laeuft' | 'pausiert' | 'neuberechnung' | 'angekommen' | 'fehler';
  error?: string;
  route: NavRoute | null;
  position: LatLon | null;
  /** Fahrtrichtung in Grad, 0 ist Norden */
  heading: number | null;
  speedKmh: number | null;
  /** Index des nächsten Manövers in route.maneuvers */
  next: number;
  /** Meter bis zum nächsten Manöver */
  distToNextM: number | null;
  remainingKm: number | null;
  /** Ankunftszeit als Date, falls berechenbar */
  eta: Date | null;
  /** Abstand zur Route in Metern */
  offRouteM: number | null;
  voice: boolean;
};

export type NavControls = {
  start: () => Promise<void>;
  stop: () => void;
  setVoice: (on: boolean) => void;
  /** Für Tests ohne Fahrt: Position entlang der Route simulieren (km pro Sekunde Faktor) */
  simulate: (on: boolean, speedKmh?: number) => void;
};
