/**
 * Gefahrene Strecke als ungespeicherte Tour im Planer (Tester Gregor 12.11.): dort steht sie auf der Karte,
 * mit dem Lesezeichen lässt sie sich speichern und später nochmal fahren.
 */
import { router } from 'expo-router';

import type { Drive } from '@/lib/drives';
import { setEditTour, type EditOrigin } from '@/lib/edit-tour';
import { flatten, type LatLon, type Tour } from '@/lib/tour';

export function openDriveInPlanner(d: Pick<Drive, 'name' | 'curves' | 'moving_min'>, line: LatLon[], back: EditOrigin = { label: 'Touren', href: '/touren' }) {
  const tour: Tour = { name: d.name, laenge_km: 0, wegpunkte: [line[0], line[line.length - 1]], linie: [{ c: 'ok', p: line }], warnungen: [], geprueft: false };
  const pts = flatten(tour);
  tour.laenge_km = +pts[pts.length - 1].km.toFixed(1);
  const now = new Date().toISOString();
  setEditTour({ ...tour, id: '', folder: 'Gefahren', createdAt: now, updatedAt: now, curves: d.curves ?? undefined, minutes: d.moving_min }, back);
  router.navigate('/');
}
