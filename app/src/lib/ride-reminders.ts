/**
 * Erinnerungen an zugesagte Ausfahrten (Koray 12.11.), lokal auf dem Gerät geplant:
 * am Vortag um 18 Uhr und am Tag 15 Minuten vor der Losfahrzeit (Anfahrt vom Wohnort zum Treffpunkt),
 * ohne Wohnort zwei Stunden vor dem Start. Nur wenn Mitteilungen erlaubt sind; fragt nie selbst nach.
 * Gleicht bei jedem Aufruf ab: neue planen, überholte (abgesagt, verschoben) löschen.
 */
import * as ExpoModules from 'expo-modules-core';
import type * as NotificationsT from 'expo-notifications';

import { clock, type Ausfahrt } from './ausfahrten';
import { pushStatus } from './push';
import type { LatLon } from './tour';
import { DEFAULT_AVOID, route } from './valhalla';

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

export async function syncRideReminders(rides: Ausfahrt[], home: LatLon | null) {
  if (!hasNative || (await pushStatus()) !== 'an') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications') as typeof NotificationsT;
  const now = Date.now();
  const want = new Map<string, NotificationsT.NotificationRequestInput>();
  const mine = rides.filter((r) => (r.isOwner || r.myStatus === 'zugesagt') && r.rideStatus === 'geplant' && r.startsAt.getTime() > now);
  for (const r of mine) {
    const where = r.meeting?.name ? ` am ${r.meeting.name}` : '';
    const data = { url: `/ausfahrt/${r.id}`, type: 'ride_reminder' };
    const min = await approachMinutes(r, home);
    const go = min != null ? departAt(r, min) : new Date(r.startsAt.getTime() - 2 * 3600000);
    const eve = eveningBefore(r.startsAt);
    if (eve.getTime() > now) {
      want.set(`${PREFIX}${r.id}-vortag`, {
        identifier: `${PREFIX}${r.id}-vortag`,
        content: {
          title: `Morgen: ${r.name}`,
          body: `${clock(r.startsAt)} Uhr${where}.${min != null ? ` Bei dir losfahren um ${clock(go)}.` : ''}`,
          data,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: eve },
      });
    }
    const before = new Date(go.getTime() - 15 * 60000);
    if (before.getTime() > now) {
      want.set(`${PREFIX}${r.id}-los`, {
        identifier: `${PREFIX}${r.id}-los`,
        content: {
          title: min != null ? `In 15 Minuten losfahren: ${r.name}` : `Heute: ${r.name}`,
          body: `Treffpunkt ${clock(r.startsAt)} Uhr${where}.`,
          data,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: before },
      });
    }
  }
  const planned = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const p of planned) {
    if (p.identifier.startsWith(PREFIX) && !want.has(p.identifier)) await Notifications.cancelScheduledNotificationAsync(p.identifier).catch(() => undefined);
  }
  for (const [, req] of want) await Notifications.scheduleNotificationAsync(req).catch(() => undefined);
}
