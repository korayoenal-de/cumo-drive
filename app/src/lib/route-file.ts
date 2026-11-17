/**
 * Touren als GPX oder KML teilen und importieren (App). Export geht über das Teilen Menü von iOS
 * (Dateien, AirDrop, Mail, andere Apps), Import über die Dateiauswahl.
 * Die nativen Module kommen mit dem nächsten Build; ältere Builds teilen den Text der Datei.
 */
import { Share } from 'react-native';

import { fileBase, parseRouteFile, toGpx, toGpxMany, toKml, type Tour } from './tour';

export type RouteFormat = 'gpx' | 'kml';

type FsModule = typeof import('expo-file-system');
type SharingModule = typeof import('expo-sharing');

function fs(): FsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional, ältere Builds ohne das Paket
    return require('expo-file-system') as FsModule;
  } catch {
    return null;
  }
}
function sharing(): SharingModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional, ältere Builds ohne das Paket
    return require('expo-sharing') as SharingModule;
  } catch {
    return null;
  }
}

const MIME: Record<RouteFormat, string> = { gpx: 'application/gpx+xml', kml: 'application/vnd.google-earth.kml+xml' };

export async function exportTour(tour: Tour, format: RouteFormat): Promise<void> {
  await shareText(format === 'gpx' ? toGpx(tour) : toKml(tour), `${fileBase(tour.name)}.${format}`, MIME[format]);
}

/** Alle Touren als eine GPX Datei teilen, etwa zum Sichern nach dem Ende der Mitgliedschaft */
export async function exportAllTours(tours: Tour[], title: string): Promise<void> {
  await shareText(toGpxMany(tours, title), `${fileBase(title)}.gpx`, MIME.gpx);
}

async function shareText(text: string, name: string, mimeType: string): Promise<void> {
  const F = fs();
  const S = sharing();
  if (F && S && (await S.isAvailableAsync().catch(() => false))) {
    const file = new F.File(F.Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await S.shareAsync(file.uri, { mimeType, dialogTitle: name });
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
