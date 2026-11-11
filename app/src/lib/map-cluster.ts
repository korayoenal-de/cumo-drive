/**
 * Pins auf der Karte bündeln (Koray 11.11.): Liegen Pins auf dem Bildschirm zu dicht, wird daraus ein Kreis mit
 * Zahl. Näher heran lösen sie sich wieder in einzelne Pins auf. Gerechnet wird in einem festen Raster je
 * Zoomstufe, ein Durchlauf über alle Pins: das trägt auch viele tausend Fahrer. Was außerhalb des Ausschnitts
 * liegt, wird gar nicht erst gezeichnet.
 */
import type { LatLon } from './tour';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type Cluster<T> = { key: string; p: LatLon; items: T[] };

const mercY = (lat: number) => (Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) * 180) / Math.PI;

/**
 * @param widthPt Breite der Karte in Punkten
 * @param cellPt Kantenlänge einer Rasterzelle in Punkten: was in derselben Zelle liegt, wird ein Kreis
 * @param keep diese IDs bleiben immer einzeln (zum Beispiel der gewählte Pin)
 */
export function clusterPins<T extends { id: string; p: LatLon }>(pins: T[], region: Region, widthPt: number, cellPt = 56, keep?: string | null): Cluster<T>[] {
  if (!pins.length || region.longitudeDelta <= 0 || widthPt <= 0) return [];
  // Zoomstufe auf feste Schritte runden, damit die Zellen beim Verschieben der Karte stehen bleiben
  const zoom = Math.round(Math.log2((360 * widthPt) / (256 * region.longitudeDelta)) * 2) / 2;
  const ptPerDeg = (256 * 2 ** zoom) / 360;
  // nur der Ausschnitt mit etwas Rand (15 % je Seite), damit beim Verschieben nichts aufblitzt
  const padLat = region.latitudeDelta * 0.65;
  const padLon = region.longitudeDelta * 0.65;
  const minLat = region.latitude - padLat;
  const maxLat = region.latitude + padLat;
  const minLon = region.longitude - padLon;
  const maxLon = region.longitude + padLon;
  const cells = new Map<string, { lat: number; lon: number; items: T[] }>();
  const out: Cluster<T>[] = [];
  for (const pin of pins) {
    const [lat, lon] = pin.p;
    if (pin.id === keep) {
      out.push({ key: pin.id, p: pin.p, items: [pin] });
      continue;
    }
    if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) continue;
    const k = `${Math.floor((lon * ptPerDeg) / cellPt)}:${Math.floor((mercY(lat) * ptPerDeg) / cellPt)}`;
    const c = cells.get(k);
    if (c) {
      c.lat += lat;
      c.lon += lon;
      c.items.push(pin);
    } else cells.set(k, { lat, lon, items: [pin] });
  }
  for (const [k, c] of cells) {
    const n = c.items.length;
    out.push(n === 1 ? { key: c.items[0].id, p: c.items[0].p, items: c.items } : { key: `c${zoom}:${k}:${n}`, p: [c.lat / n, c.lon / n], items: c.items });
  }
  return out;
}

/** 1200 wird 1,2 Tsd. */
export function clusterLabel(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace('.', ',')} Tsd.`;
}
