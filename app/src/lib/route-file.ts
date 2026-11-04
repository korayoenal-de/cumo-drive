/**
 * Touren als GPX oder KML teilen und importieren (App). Export geht über das Teilen Menü von iOS
 * (Dateien, AirDrop, Mail, andere Apps), Import über die Dateiauswahl.
 * Die nativen Module kommen mit dem nächsten Build; ältere Builds teilen den Text der Datei.
 */
import { Share } from 'react-native';

import { fileBase, parseRouteFile, toGpx, toKml, type Tour } from './tour';

export type RouteFormat = 'gpx' | 'kml';

type FsModule = typeof import('expo-file-system');
type SharingModule = typeof import('expo-sharing');

function fs(): FsModule | null {
  try {
    return require('expo-file-system') as FsModule;
  } catch {
    return null;
  }
}
function sharing(): SharingModule | null {
  try {
    return require('expo-sharing') as SharingModule;
  } catch {
    return null;
  }
}

const MIME: Record<RouteFormat, string> = { gpx: 'application/gpx+xml', kml: 'application/vnd.google-earth.kml+xml' };

export async function exportTour(tour: Tour, format: RouteFormat): Promise<void> {
  const text = format === 'gpx' ? toGpx(tour) : toKml(tour);
  const name = `${fileBase(tour.name)}.${format}`;
  const F = fs();
  const S = sharing();
  if (F && S && (await S.isAvailableAsync().catch(() => false))) {
    const file = new F.File(F.Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await S.shareAsync(file.uri, { mimeType: MIME[format], dialogTitle: name });
    return;
  }
  await Share.share({ title: name, message: text });
}

/** Öffnet die Dateiauswahl und liest eine GPX oder KML Datei. null, wenn abgebrochen. */
export async function importTourFile(): Promise<Tour | null> {
  const F = fs();
  if (!F?.File?.pickFileAsync) throw new Error('Import kommt mit dem nächsten App Update aus TestFlight.');
  const res = await F.File.pickFileAsync({ mimeTypes: ['*/*'] });
  if (res.canceled || !res.result) return null;
  const file = res.result;
  const text = await file.text();
  return parseRouteFile(text, decodeURIComponent(file.name ?? file.uri.split('/').pop() ?? 'Tour'));
}

export const canImportFiles = () => !!fs()?.File?.pickFileAsync;
