/**
 * Gemeinsames für die Karte (Handy und Web): Props, Farben je Klasse, kleine Helfer.
 */
import type { StyleProp, ViewStyle } from 'react-native';

import type { Pass } from '@/lib/passes';
import type { Radar, Scan } from '@/lib/radar';
import type { CheckClass, LatLon, Tour, Warning } from '@/lib/tour';
import { Colors } from '@/constants/theme';

export type RouteMapProps = {
  tour: Tour;
  style?: StyleProp<ViewStyle>;
  /** Zoomen und Verschieben erlaubt (Standard ja) */
  interactive?: boolean;
  /** Eigenen Standort der Karte zeigen */
  showUser?: boolean;
  /** Tipp auf eine Warnung, Index in tour.warnungen */
  onPressWarning?: (index: number) => void;
  /** Kamera folgt der Position (Navigation) */
  followUser?: boolean;
  /** Fahrtrichtung in Grad, 0 ist Norden */
  heading?: number | null;
  /** Warnung, zu der die Karte springen soll, Index in tour.warnungen */
  highlightIndex?: number | null;
  /** Position aus der Navigation (auch simuliert); ohne sie folgt nichts */
  position?: LatLon | null;
  /** Rand beim Einpassen der Tour in Punkten */
  edgePadding?: { top: number; right: number; bottom: number; left: number };
  /** Andere Fahrer der Gruppenfahrt */
  others?: OtherDriver[];
  /** Markierte Punkte, zum Beispiel Spitzenwerte der Fahrtstatistik */
  pins?: MapPin[];
  /** Langer Druck auf die Karte, liefert den Punkt (zum Beispiel neuer Wegpunkt im Planer) */
  onLongPress?: (p: LatLon) => void;
  /** Verdeckter Rand der Karte (zum Beispiel durch ein Sheet); hält auch den Apple Maps Rechtshinweis sichtbar */
  mapPadding?: { top: number; right: number; bottom: number; left: number };
  /** Weg zurück auf die Tour nach einer Abweichung, gestrichelt gezeichnet */
  dashed?: LatLon[] | null;
  /** Punkt, auf den die Karte springt, solange keine Tour Linie da ist */
  focus?: LatLon | null;
  /** false: Ausschnitt nicht an Tour oder Fokus anpassen (Punkt wurde gerade auf der Karte gesetzt) */
  autoFit?: boolean;
  /** Navigation: Wert ändern zeigt kurz die ganze restliche Route (Planung ansehen), danach folgt die Karte wieder */
  overview?: number;
  /** Zentrieren während der Übersicht beendet sie */
  onOverviewEnd?: () => void;
  /** Zusätzliche Ebenen aus den Karteneinstellungen zeigen (Pässe, Meine Touren, Fahrten) */
  layers?: boolean;
  /** Tipp auf einen Pass der Pässe Ebene (zum Beispiel zur Route hinzufügen) */
  onPressPass?: (pass: Pass) => void;
  /** Punkte halten und ziehen (Koray 11.11.): 'start', 'ziel' oder die id eines Pins, mit der neuen Lage */
  onDragPoint?: (id: string, p: LatLon) => void;
  /** Strecke wird gerade neu gerechnet: Linie blass zeigen (Ziehen, Koray 11.11.) */
  stale?: boolean;
  /** Langer Druck auf die Linie der Tour (statt irgendwo auf die Karte): dort entsteht ein Ziehpunkt */
  onLongPressLine?: (p: LatLon) => void;
  /** Tipp auf einen nummerierten Punkt (Zwischenziel), id wie in pins */
  onPressPin?: (id: string) => void;
  /** Platz oben, den andere Elemente belegen (Zurück Pille): Hinweiskarten beginnen darunter */
  overlayTop?: number;
  /** Tipp auf eine freie Stelle der Karte (nicht auf einen Marker) */
  onPressMap?: () => void;
  /** Pässe, die schon als Punkt in der Planung stehen: sie erscheinen markiert */
  pickedPassIds?: ReadonlySet<string>;
  /** Zu diesem Punkt fliegen; n wechselt bei jedem Aufruf */
  flyTo?: { p: LatLon; n: number } | null;
  /** Radar beim Erstellen einer Rundtour: Ring ab dem Start, Strecken im Umkreis leuchten auf */
  radar?: Radar | null;
  /** Scan entlang der Strecke beim ersten Planen in Tour planen */
  scan?: Scan | null;
};

export type MapPin = { id: string; p: LatLon; label: string; title: string };

export type OtherDriver = { id: string; p: LatLon; name: string; role: 'lead' | 'schluss' | 'mitfahrer'; stale: boolean; /** abseits der Tour */ off?: boolean; /** fährt eine eigene Route */ own?: boolean };

/** Farbe je Rolle: Lead im Signal Orange, Schlusslicht gelb, Mitfahrer hell. */
export const ROLE_COLOR: Record<OtherDriver['role'], string> = { lead: Colors.signal, schluss: Colors.warn, mitfahrer: Colors.text };

export const WARN_COLOR = Colors.warn;

export const CLASS_LINE: Record<CheckClass, { color: string; width: number; z: number }> = {
  ok: { color: Colors.text, width: 4, z: 1 },
  pruefen: { color: WARN_COLOR, width: 6, z: 3 },
  raus: { color: Colors.signal, width: 7, z: 5 },
};

/** Warnungen, die auf der Karte erscheinen, mit ihrem Index in tour.warnungen. */
export function tourWarnings(tour: Tour): { w: Warning; index: number }[] {
  return tour.warnungen.map((w, index) => ({ w, index })).filter(({ w }) => w.klasse !== 'ok');
}

/** Höchstens max Punkte der Linie, gleichmäßig verteilt, zum Einpassen des Ausschnitts. */
export function sampleLine(tour: Tour, max: number): LatLon[] {
  const all = tour.linie.flatMap((r) => r.p);
  if (all.length <= max) return all;
  const step = all.length / max;
  const out: LatLon[] = [];
  for (let i = 0; i < max; i++) out.push(all[Math.floor(i * step)]);
  out.push(all[all.length - 1]);
  return out;
}
