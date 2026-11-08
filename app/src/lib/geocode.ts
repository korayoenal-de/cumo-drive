/**
 * Ortssuche über Photon (Komoot, OSM Daten, ohne Schlüssel). Prototyp, später eigener Dienst.
 */
import { haversine, type LatLon } from './tour';

export type Place = { name: string; detail: string; p: LatLon };

/**
 * Ortsname zu Ort, mit Vorrang für Städte und Gemeinden. So wird "Heppenheim" zur Stadt an der
 * Bergstraße und nicht zum gleichnamigen Stadtteil von Worms. Regionen wie "Odenwald" fallen
 * auf die normale Suche zurück.
 */
export async function searchTowns(q: string, near?: LatLon, signal?: AbortSignal): Promise<Place[]> {
  const towns = await searchPlaces(q, near, signal, ['city', 'locality']);
  return towns.length ? towns : searchPlaces(q, near, signal);
}

export async function searchPlaces(q: string, near?: LatLon, signal?: AbortSignal, layers: string[] = []): Promise<Place[]> {
  const url = new URL('https://photon.komoot.io/api/');
  for (const l of layers) url.searchParams.append('layer', l);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '6');
  url.searchParams.set('lang', 'de');
  if (near) {
    url.searchParams.set('lat', String(near[0]));
    url.searchParams.set('lon', String(near[1]));
  }
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Ortssuche: Fehler ${res.status}`);
  type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string> };
  const data = (await res.json()) as { features: F[] };
  const all = data.features.map((f) => {
    const pr = f.properties;
    // Adresse mit Hausnummer: ohne eigenen Namen ist sie der Titel, sonst steht sie im Untertitel
    const addr = pr.street && pr.housenumber ? `${pr.street} ${pr.housenumber}` : undefined;
    const name = pr.name ?? addr ?? pr.street ?? pr.city ?? 'Ort';
    const detail = [addr !== name ? addr : undefined, pr.city !== name ? pr.city : undefined, pr.state, pr.country].filter(Boolean).join(', ');
    return { name, detail, p: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as LatLon };
  });
  // Gleicher Name in wenigen km Abstand nur einmal (Tester 8.11.: sechsmal "Tegernsee" für Ort, See, Bahnhof
  // und Bahnsteige). Photon sortiert den Ort zuerst, er bleibt stehen.
  return all.filter((x, i) => !all.slice(0, i).some((y) => y.name === x.name && haversine(x.p, y.p) < 5000));
}

export async function reverseName(p: LatLon, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${p[0]}&lon=${p[1]}&lang=de`, { signal });
    const data = (await res.json()) as { features: { properties: Record<string, string> }[] };
    const pr = data.features[0]?.properties ?? {};
    return pr.city ?? pr.name ?? pr.district ?? 'Standort';
  } catch {
    return 'Standort';
  }
}
