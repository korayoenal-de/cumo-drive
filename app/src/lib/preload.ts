/**
 * Vorladen während der Startanimation (Idee von Koray, 7.11.2026): die rund vier Sekunden nutzen, damit
 * Planen und Karte danach ohne Warten bereitstehen. Nichts hiervon hält den Start auf; was nicht rechtzeitig
 * fertig ist, läuft im Hintergrund weiter. Die Karte selbst baut sich unter dem Startscreen schon auf.
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { cumoAvailable } from './cumo-routing';
import { prefetchPassLive } from './pass-live';

let started = false;

export function preloadOnStart() {
  if (started || Platform.OS === 'web') return;
  started = true;
  // Routing Server wecken: so steht fest, ob die App über ihn oder den Ersatzweg plant
  void cumoAvailable();
  // Passstatus (Sperren) aus dem Konto
  prefetchPassLive();
  // Standort früh holen: Rundtour ab hier und Karte haben ihn danach sofort
  void (async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1000 });
      if (!last) await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      // ohne Standort geht es trotzdem weiter
    }
  })();
}
