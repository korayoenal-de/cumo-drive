/**
 * Tour als CUMO DRIVE Link teilen: drive.rallycumo.de/t#cumo1:...
 * Wer den Link öffnet, landet auf der Landeseite und holt die Route mit einem Tipp in die App
 * (cumodrive://scan?code=...). Dort steht sie als ungespeicherte Kopie im Planer.
 */
import { Share } from 'react-native';

import { encodeTour, shareUrl } from './share-code';
import { formatKm, type Profile, type Tour } from './tour';

export async function shareTourLink(tour: Tour, profile: Profile): Promise<void> {
  const url = shareUrl(encodeTour(tour, profile));
  const km = `${formatKm(tour.laenge_km, 0)} km`;
  await Share.share({ title: tour.name, message: `${tour.name}, ${km} mit CUMO DRIVE\n${url}` });
}
