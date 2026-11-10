/**
 * expo-location für die Simulation: Erlaubnis ist erteilt, watchPositionAsync merkt sich den
 * Callback. Positionen fährt die Simulation über sendPosition (wie die Navigation) oder über emitGps.
 */
type Loc = { coords: { latitude: number; longitude: number; heading: number | null; speed: number | null; accuracy: number } ; timestamp: number };

let watcher: ((l: Loc) => void) | null = null;
let last: Loc | null = null;

export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };
export const requestForegroundPermissionsAsync = async () => ({ granted: true, status: 'granted' });
export const getForegroundPermissionsAsync = async () => ({ granted: true, status: 'granted' });
export const getLastKnownPositionAsync = async () => last;
export const getCurrentPositionAsync = async () => last;
export async function watchPositionAsync(_o: unknown, cb: (l: Loc) => void) {
  watcher = cb;
  return { remove: () => void (watcher = null) };
}

/** Von der Simulation: GPS Punkt einspeisen */
export function emitGps(lat: number, lon: number, heading: number | null, speedMs: number | null) {
  last = { coords: { latitude: lat, longitude: lon, heading, speed: speedMs, accuracy: 5 }, timestamp: Date.now() };
  watcher?.(last);
}
export const isWatching = () => watcher != null;
