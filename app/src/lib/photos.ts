/**
 * Fotos als erster Community Input: Bilder mit GPS aus den CDC Touren, gruppiert nach Ort und
 * den Pässen zugeordnet. Die Bilder liegen nicht im Repo, sondern nur im Web Build unter
 * /fotos (fotos.json, {id}.jpg groß, t_{id}.jpg Vorschau). Später kommen sie aus Supabase Storage.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { passPoint, PASSES, type Pass } from './passes';
import { haversine, type LatLon } from './tour';

export type Photo = { id: string; lat: number; lon: number; t: string; w: number; h: number };
export type PhotoGroup = { key: string; p: LatLon; photos: Photo[]; pass: Pass | null };

export const photoUrl = (p: Photo) => `/fotos/${p.id}.jpg`;
export const thumbUrl = (p: Photo) => `/fotos/t_${p.id}.jpg`;

let groups: PhotoGroup[] | null = null;
let started = false;
const listeners = new Set<() => void>();

/** Fotos im Umkreis von 400 m zu einem Ort zusammenfassen, dann dem nächsten Pass bis 3 km zuordnen. */
export function groupPhotos(list: Photo[]): PhotoGroup[] {
  const out: PhotoGroup[] = [];
  for (const ph of [...list].sort((a, b) => a.t.localeCompare(b.t))) {
    const pt: LatLon = [ph.lat, ph.lon];
    const g = out.find((x) => haversine(x.p, pt) < 400);
    if (g) g.photos.push(ph);
    else out.push({ key: ph.id, p: pt, photos: [ph], pass: null });
  }
  for (const g of out) {
    let best: Pass | null = null;
    let bd = 3000;
    for (const ps of PASSES) {
      const d = haversine(g.p, passPoint(ps));
      if (d < bd) {
        bd = d;
        best = ps;
      }
    }
    g.pass = best;
  }
  return out;
}

function load() {
  if (started || Platform.OS !== 'web' || typeof window === 'undefined') return;
  started = true;
  fetch('/fotos/fotos.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((list: Photo[]) => {
      groups = groupPhotos(list);
      for (const l of listeners) l();
    })
    .catch(() => undefined);
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => {
    listeners.delete(l);
  };
}

export function usePhotoGroups(): PhotoGroup[] | null {
  return useSyncExternalStore(subscribe, () => groups, () => null);
}

export function photoGroupsGeoJson(list: PhotoGroup[]) {
  return {
    type: 'FeatureCollection',
    features: list.map((g) => ({
      type: 'Feature',
      properties: { key: g.key, n: g.photos.length },
      geometry: { type: 'Point', coordinates: [g.p[1], g.p[0]] },
    })),
  };
}

export function photoDate(p: Photo): string {
  const d = new Date(p.t);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}
