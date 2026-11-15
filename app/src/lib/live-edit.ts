/**
 * Tour anpassen unterwegs (Koray 15.11.): Die Navigation legt den Rest der Tour hier ab und öffnet den Planer
 * im Modus „live“ über sich. Die Navigation läuft darunter weiter. „Übernehmen“ gibt die geänderte Tour an die
 * Navigation zurück, die ohne Neustart umschaltet; „Verwerfen“ lässt alles, wie es war.
 * In der Gruppenfahrt darf nur die Lead anpassen, die neue Route geht dann an alle (lib/group/ride.ts).
 */
import type { SavedTour } from './library';
import type { Profile, Tour } from './tour';
import type { Avoid } from './valhalla';

type Apply = (tour: Tour & { minutes?: number }, profile: Profile, avoid: Avoid) => void;

let pending: { tour: SavedTour; profile: Profile; avoid: Avoid } | null = null;
let apply: Apply | null = null;

/** Rest der Tour vormerken und festlegen, was „Übernehmen“ tut */
export function startLiveEdit(tour: SavedTour, profile: Profile, avoid: Avoid, onApply: Apply) {
  pending = { tour, profile, avoid };
  apply = onApply;
}

/** Der Planer holt die Tour einmal ab */
export function takeLiveEdit() {
  const p = pending;
  pending = null;
  return p;
}

/** Übernehmen: an die Navigation geben; true, wenn jemand sie angenommen hat */
export function applyLiveEdit(tour: Tour & { minutes?: number }, profile: Profile, avoid: Avoid): boolean {
  const fn = apply;
  apply = null;
  if (!fn) return false;
  fn(tour, profile, avoid);
  return true;
}

export function endLiveEdit() {
  pending = null;
  apply = null;
}
