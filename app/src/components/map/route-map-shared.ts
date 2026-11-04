/**
 * Gemeinsames für die Karte (Handy und Web): Props, Farben je Klasse, kleine Helfer.
 */
import type { StyleProp, ViewStyle } from 'react-native';

import type { CheckClass, LatLon, Tour, Warning } from '@/lib/tour';

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
  /** Punkt, auf den die Karte springt, solange keine Tour Linie da ist */
  focus?: LatLon | null;
};

export type MapPin = { id: string; p: LatLon; label: string; title: string };

export type OtherDriver = { id: string; p: LatLon; name: string; role: 'lead' | 'schluss' | 'mitfahrer'; stale: boolean };

/** Farbe je Rolle: Lead im Signal Orange, Schlusslicht gelb, Mitfahrer hell. */
export const ROLE_COLOR: Record<OtherDriver['role'], string> = { lead: '#E2461C', schluss: '#E8B03A', mitfahrer: '#F4F4F2' };

export const WARN_COLOR = '#E8B03A';

export const CLASS_LINE: Record<CheckClass, { color: string; width: number; z: number }> = {
  ok: { color: '#F4F4F2', width: 4, z: 1 },
  pruefen: { color: WARN_COLOR, width: 6, z: 3 },
  raus: { color: '#E2461C', width: 7, z: 5 },
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
