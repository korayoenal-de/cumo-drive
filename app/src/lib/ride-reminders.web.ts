/** Web: keine lokalen Erinnerungen, die Rechnung der Anfahrt gibt es trotzdem */
import type { Ausfahrt } from './ausfahrten';
import type { LatLon } from './tour';
import { DEFAULT_AVOID, route } from './valhalla';

const approach = new Map<string, number | null>();
export async function approachMinutes(r: Ausfahrt, home: LatLon | null): Promise<number | null> {
  const to = r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : r.start;
  if (!home || !to) return null;
  const key = `${r.id}:${home.join(',')}:${to.join(',')}`;
  if (approach.has(key)) return approach.get(key) ?? null;
  try {
    const res = await route([home, to], 'schnell', DEFAULT_AVOID);
    approach.set(key, Math.round(res.minutes));
  } catch {
    approach.set(key, null);
  }
  return approach.get(key) ?? null;
}
export const departAt = (r: Ausfahrt, minutes: number) => new Date(r.startsAt.getTime() - (minutes + 15) * 60000);
export async function syncRideReminders(_rides: Ausfahrt[], _home: LatLon | null) {}
