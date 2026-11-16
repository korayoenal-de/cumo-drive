/**
 * Erinnerungen an zugesagte Ausfahrten (Koray 12.11.), lokal auf dem Gerät geplant:
 * am Vortag um 18 Uhr und am Tag 15 Minuten vor der Losfahrzeit. Nur wenn Mitteilungen erlaubt sind;
 * fragt nie selbst nach. Gleicht bei jedem Aufruf ab: neue planen, überholte (abgesagt, verschoben) löschen.
 *
 * Seit 15.11. (Tester: Erinnerung 1:05 h vorher, obwohl er 1 km vom Treffpunkt stand) zählt nur der aktuelle
 * Standort, nie der Wohnort: jedes Öffnen der App rechnet die Anfahrt von dort neu. Ist man schon nah dran,
 * entfällt die Erinnerung. Ohne Standort kommt 90 Minuten vor dem Start eine neutrale Erinnerung ohne Losfahrzeit.
 */
import * as ExpoModules from 'expo-modules-core';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import type * as NotificationsT from 'expo-notifications';

import { clock, type Ausfahrt } from './ausfahrten';
import { pushStatus } from './push';
import type { LatLon } from './tour';
import { DEFAULT_AVOID, route } from './valhalla';
import { t } from '@/i18n';

const PREFIX = 'ride-';

/** Anfahrt in Minuten vom Wohnort zum Treffpunkt, je Ausfahrt einmal gerechnet */
const approach = new Map<string, number | null>();

export async function approachMinutes(r: Ausfahrt, home: LatLon | null): Promise<number | null> {
  const to = r.meeting ? ([r.meeting.lat, r.meeting.lon] as LatLon) : r.start;
  if (!home || !to) return null;
  const key = `${r.id}:${home[0].toFixed(3)},${home[1].toFixed(3)}:${to[0].toFixed(4)},${to[1].toFixed(4)}`;
  if (approach.has(key)) return approach.get(key) ?? null;
  try {
    const res = await route([home, to], 'schnell', DEFAULT_AVOID);
    const m = Math.round(res.minutes);
    approach.set(key, m);
    return m;
  } catch {
    approach.set(key, null);
    return null;
  }
}

/** Aktueller Standort ohne Nachfrage: zuletzt bekannt (15 min), sonst kurz messen; ohne Erlaubnis null */
export async function currentSpot(): Promise<LatLon | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60000, requiredAccuracy: 1000 });
    if (last) return [last.coords.latitude, last.coords.longitude];
    const now = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    return now ? [now.coords.latitude, now.coords.longitude] : null;
  } catch {
    return null;
  }
}

/** Schon fast da: keine Losfahr Erinnerung */
const NEAR_MIN = 5;
/** Ohne Standort: neutrale Erinnerung so lange vor dem Start */
const NEUTRAL_MIN = 90;

/** Losfahrzeit: Anfahrt plus 15 Minuten Puffer vor dem Treffpunkt */
export const departAt = (r: Ausfahrt, minutes: number) => new Date(r.startsAt.getTime() - (minutes + 15) * 60000);

function eveningBefore(d: Date) {
  const e = new Date(d);
  e.setDate(e.getDate() - 1);
  e.setHours(18, 0, 0, 0);
  return e;
}

// Ältere Builds ohne das native Modul: nichts tun statt abstürzen (wie push.ts)
const hasNative = typeof ExpoModules.requireOptionalNativeModule === 'function' && !!ExpoModules.requireOptionalNativeModule('ExpoPushTokenManager');

// zuletzt geplante Fahrten, damit das Öffnen der App vom neuen Standort aus neu rechnen kann
let lastRides: Ausfahrt[] | null = null;
let listening = false;

export async function syncRideReminders(rides: Ausfahrt[], _home?: LatLon | null) {
  lastRides = rides;
  if (!listening) {
    listening = true;
    AppState.addEventListener('change', (st) => {
      if (st === 'active' && lastRides) void syncRideReminders(lastRides);
    });
  }
  if (!hasNative || (await pushStatus()) !== 'an') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications') as typeof NotificationsT;
  const now = Date.now();
  const want = new Map<string, NotificationsT.NotificationRequestInput>();
  const mine = rides.filter((r) => (r.isOwner || r.myStatus === 'zugesagt') && r.rideStatus === 'geplant' && r.startsAt.getTime() > now);
  const here = mine.length ? await currentSpot() : null;
  for (const r of mine) {
    const where = r.meeting?.name ? ` am ${r.meeting.name}` : '';
    const data = { url: `/ausfahrt/${r.id}`, type: 'ride_reminder' };
    const eve = eveningBefore(r.startsAt);
    if (eve.getTime() > now) {
      want.set(`${PREFIX}${r.id}-vortag`, {
        identifier: `${PREFIX}${r.id}-vortag`,
        content: { title: `Morgen: ${r.name}`, body: `${clock(r.startsAt)} Uhr${where}.`, data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: eve },
      });
    }
    const min = here ? await approachMinutes(r, here) : null;
    if (min != null && min <= NEAR_MIN) continue;
    const at =
      min != null ? new Date(departAt(r, min).getTime() - 15 * 60000) : new Date(r.startsAt.getTime() - NEUTRAL_MIN * 60000);
    if (at.getTime() <= now) continue;
    want.set(`${PREFIX}${r.id}-los`, {
      identifier: `${PREFIX}${r.id}-los`,
      content:
        min != null
          ? { title: t('In 15 Minuten losfahren: {name}', { name: r.name }), body: t('Von deinem Standort etwa {min} Minuten zum Treffpunkt, Start {v1} Uhr{where}.', { min, v1: clock(r.startsAt), where }), data }
          : { title: t('Heute {v0} Uhr: {name}', { v0: clock(r.startsAt), name: r.name }), body: t('Treffpunkt{v0}. Tippe für deine Anfahrt.', { v0: where || ' am Start der Tour' }), data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
  const planned = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const p of planned) {
    if (p.identifier.startsWith(PREFIX) && !want.has(p.identifier)) await Notifications.cancelScheduledNotificationAsync(p.identifier).catch(() => undefined);
  }
  for (const [, req] of want) await Notifications.scheduleNotificationAsync(req).catch(() => undefined);
}
