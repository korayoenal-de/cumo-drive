/**
 * Adressen mit Hausnummer über den Geocoder des Geräts (auf dem iPhone Apple). Photon kennt viele Hausnummern
 * nicht, und Zusätze wie "126b" findet es gar nicht (Koray 8.11.). Nur auf dem Gerät, im Web bleibt es bei Photon.
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { reverseName, type Place } from './geocode';
import { haversine, type LatLon } from './tour';

/** Sieht aus wie Straße mit Hausnummer, etwa "Ludwigstraße 126b" oder "Hauptstr. 5, Bensheim" */
export const looksLikeAddress = (q: string) => /[a-zäöüß.]{3,}\s+\d+\s*[a-z]?\b/i.test(q);

/** Weiter weg als das gilt ein Treffer ohne Ortsangabe als falscher Ort */
const NEAR_KM = 60;

async function geocode(q: string): Promise<LatLon[]> {
  try {
    const res = await Location.geocodeAsync(q);
    return res.map((r) => [r.latitude, r.longitude] as LatLon);
  } catch {
    return [];
  }
}

async function label(p: LatLon, fallback: string): Promise<Place> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: p[0], longitude: p[1] });
    const street = [r?.street, r?.streetNumber].filter(Boolean).join(' ');
    return { name: street || fallback, detail: [r?.postalCode && r?.city ? `${r.postalCode} ${r.city}` : r?.city, r?.country].filter(Boolean).join(', '), p };
  } catch {
    return { name: fallback, detail: '', p };
  }
}

export async function searchAddress(q: string, near?: LatLon, signal?: AbortSignal): Promise<Place[]> {
  if (Platform.OS === 'web' || !looksLikeAddress(q)) return [];
  let pts = await geocode(q);
  // Ohne Ort im Text: in der Nähe suchen, sonst landet "Ludwigstraße 126" irgendwo in Deutschland
  if (near && !q.includes(',') && !pts.some((p) => haversine(p, near) / 1000 <= NEAR_KM)) {
    const city = await reverseName(near, signal);
    if (city && city !== 'Standort') pts = [...(await geocode(`${q}, ${city}`)), ...pts];
  }
  if (signal?.aborted) return [];
  const sorted = near ? [...pts].sort((a, b) => haversine(a, near) - haversine(b, near)) : pts;
  return Promise.all(sorted.slice(0, 2).map((p) => label(p, q)));
}
