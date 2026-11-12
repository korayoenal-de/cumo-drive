/**
 * Funkloch (Navigationsklassiker, Koray 12.11.): Scheitert die Neuberechnung am Netz, stand bisher nur
 * "Abseits der Tour" da, ohne Richtung. Jetzt rechnet die App selbst einen Rückweg: zur nächsten Stelle der
 * Tour voraus, als gelbe Luftlinie mit Himmelsrichtung und Entfernung. Keine Abbiegehinweise (dafür fehlt das
 * Straßennetz), aber man weiß, wohin. Sobald wieder Netz da ist, ersetzt die normale Rückführung sie.
 */
import { haversine, type LatLon } from '../tour';
import type { Maneuver, NavRoute } from './types';

/** So weit voraus auf der Tour wird die Stelle zum Zurückkommen gesucht */
const AHEAD_KM = 5;
/** Umweg auf der Tour zählt so viel wie Luftlinie: lieber etwas weiter vorne einsteigen als zurück */
const ALONG_WEIGHT = 0.25;

const DIRS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];

export function compass(a: LatLon, b: LatLon): string {
  const k = Math.cos((a[0] * Math.PI) / 180);
  const deg = ((Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

function words(m: number): string {
  if (m >= 950) return `${String(Math.round(m / 100) / 10).replace('.', ',')} km`;
  return `${Math.max(50, Math.round(m / 50) * 50)} m`;
}

/** Rückweg ohne Netz: Luftlinie zur besten Stelle der Tour voraus, danach die Tour wie gehabt */
export function offlineRejoin(current: NavRoute, doneIndex: number, pos: LatLon): NavRoute | null {
  const { shape, cumKm } = current;
  if (shape.length < 2) return null;
  const start = Math.max(0, Math.min(doneIndex, shape.length - 1));
  const startKm = cumKm[start];
  let best = -1;
  let bestCost = Infinity;
  for (let i = start; i < shape.length && cumKm[i] - startKm <= AHEAD_KM; i++) {
    const cost = haversine(pos, shape[i]) + ALONG_WEIGHT * (cumKm[i] - startKm) * 1000;
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  if (best < 0) return null;
  const target = shape[best];
  const air = haversine(pos, target);
  const newShape: LatLon[] = [pos, ...shape.slice(best)];
  const newCum = [0];
  for (let i = 1; i < newShape.length; i++) newCum.push(newCum[i - 1] + haversine(newShape[i - 1], newShape[i]) / 1000);
  const dir = compass(pos, target);
  const lead: Maneuver = {
    kind: 'geradeaus',
    text: `Kein Netz. Zurück zur Tour: ${words(air)} Richtung ${dir}`,
    speech: `Kein Netz. Die Tour liegt ${words(air).replace('km', 'Kilometer').replace(' m', ' Meter')} Richtung ${dir}.`,
    index: 0,
    km: 0,
  };
  const back: Maneuver = { kind: 'zwischenziel', text: 'Zurück auf der Tour. Der Tour folgen.', speech: 'Dann bist du zurück auf der Tour.', index: 1, km: newCum[1] };
  const rest = current.maneuvers
    .filter((m) => m.index > best && m.kind !== 'start')
    .map((m) => {
      const index = m.index - best + 1;
      return { ...m, index, km: newCum[Math.min(index, newCum.length - 1)] };
    });
  const restShare = current.km > 0 ? (current.km - cumKm[best]) / current.km : 0;
  return {
    shape: newShape,
    cumKm: newCum,
    maneuvers: [lead, back, ...rest],
    km: newCum[newCum.length - 1],
    // Luftlinie mit etwa 40 km/h, dazu der Rest der Tour
    minutes: (air / 1000 / 40) * 60 + current.minutes * restShare,
    source: current.source,
    rejoinIndex: 1,
  };
}
