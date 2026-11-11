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
  | 'zwischenziel'
  | 'rechts_halten'
  | 'links_halten'
  | 'einfaedeln_rechts'
  | 'einfaedeln_links'
  | 'auffahrt_rechts'
  | 'auffahrt_links'
  | 'abfahrt_rechts'
  | 'abfahrt_links'
  | 'wenden_rechts'
  | 'kreisverkehr_verlassen'
  | 'faehre_an_bord'
  | 'faehre_verlassen'
  | 'ziel_links'
  | 'ziel_rechts';

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
  /** Nach einer Abweichung: bis zu diesem Index führt die Route zurück auf die Tour (gestrichelt) */
  rejoinIndex?: number;
};

/**
 * einsteigen: an der nächsten passenden Stelle in die Tour; start: erst zum Startpunkt, dann die
 * ganze Tour; anfahrt: nur zum Startpunkt (bei weiter Anreise, schnellste Route).
 */
export type NavEntry = 'einsteigen' | 'start' | 'anfahrt';

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
  /** Tempo gegenüber der Planung: 1 wie geplant, 1,2 heißt 20 % langsamer. Fließt in Ankunft und Restzeiten ein. */
  pace: number;
  /** Abstand zur Route in Metern */
  offRouteM: number | null;
  voice: boolean;
};

export type NavControls = {
  start: () => Promise<void>;
  stop: () => void;
  /** Fahrt anhalten (true) oder fortsetzen (false) */
  pause: (on: boolean) => void;
  setVoice: (on: boolean) => void;
  /** Freie Ansage (zum Beispiel Highlights), respektiert Stumm */
  say: (text: string) => void;
  /** Für Tests ohne Fahrt: Position entlang der Route simulieren (km pro Sekunde Faktor) */
  simulate: (on: boolean, speedKmh?: number) => void;
  /**
   * Zwischenziel überspringen: vom Standort direkt zurück auf die Route ab Index index (dem Zwischenziel
   * danach oder dem Ziel). Gibt den alten Stand zurück, damit Rückgängig möglich ist; null, wenn es nicht ging.
   */
  skipTo: (index: number, fast?: boolean) => Promise<SkipUndo | null>;
  /** Stand vor dem Überspringen wiederherstellen */
  restore: (u: SkipUndo) => void;
  /** Bei einer Abweichung selbst wählen: zurück zur Tour oder neue Route ab hier */
  choose: (mode: 'rejoin' | 'fresh') => void;
};

export type SkipUndo = { route: NavRoute; done: number; hint: number };
