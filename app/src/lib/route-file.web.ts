/** Touren als GPX oder KML herunterladen und importieren (Web). */
import { fileBase, parseRouteFile, toGpx, toKml, type Tour } from './tour';

export type RouteFormat = 'gpx' | 'kml';

const MIME: Record<RouteFormat, string> = { gpx: 'application/gpx+xml', kml: 'application/vnd.google-earth.kml+xml' };

export async function exportTour(tour: Tour, format: RouteFormat): Promise<void> {
  const blob = new Blob([format === 'gpx' ? toGpx(tour) : toKml(tour)], { type: MIME[format] });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBase(tour.name)}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importTourFile(): Promise<Tour | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(parseRouteFile(await f.text(), f.name));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export const canImportFiles = () => true;
