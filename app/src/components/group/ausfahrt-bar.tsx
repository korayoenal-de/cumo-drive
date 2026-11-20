/**
 * Leiste der Ausfahrt über der Tab Leiste (Konzept „Ausfahrt im Fokus“, Koray 20.11.2026, Hinweis von Timo: die
 * Chats der Ausfahrt lagen zu tief in der Community).
 *
 * Eine Fläche, eine Aktion: Tippen öffnet die Seite der Ausfahrt. Links der Datumsblock (neutral, am Tag „Heute“ in
 * Signal, während der Fahrt „Läuft“ in Grün), daneben Name und eine Zeile mit Zeit, Entfernung und neuen Nachrichten.
 * Sichtbar ab 24 Stunden vor einer Ausfahrt, bei der du dabei bist, bis sie vorbei ist; bei mehreren nur die nächste.
 *
 * Bewusste Abweichung von der Leinwand (72 hoch, eigene schwebende Fläche): die Leiste sitzt im Zubehörplatz der
 * iOS Tab Leiste (wie die laufende Gruppenfahrt und der Mini Player in Apple Music). Dort ist sie etwa 48 hoch, iOS
 * blendet sie in der Navigation, auf Detailseiten und bei offener Tastatur selbst aus, und Toast und Karte rechnen
 * sie schon ein. Der Datumsblock ist darum 36 statt 48.
 */
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/ui/tap';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { listAusfahrten, listRideChats, type Ausfahrt } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { strecke, tagKurz, uhr, wann } from '@/lib/format';
import { haversine, type LatLon } from '@/lib/tour';
import { t, tr } from '@/i18n';

/** ab wann die Leiste erscheint */
export const BAR_BEFORE_MS = 24 * 3600 * 1000;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Die nächste Ausfahrt, bei der ich dabei bin, ab 24 Stunden vorher bis sie vorbei ist */
export function nextRide(list: Ausfahrt[], now = Date.now()): Ausfahrt | null {
  return (
    list
      .filter((a) => (a.isOwner || a.myStatus === 'zugesagt') && !a.isOver && !a.isCancelled && a.rideStatus !== 'beendet')
      .filter((a) => a.rideStatus === 'laeuft' || a.startsAt.getTime() - now < BAR_BEFORE_MS)
      .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime())[0] ?? null
  );
}

/** at: Zeitpunkt des Ladens, für den Countdown (lädt jede Minute neu) */
type BarState = { ride: Ausfahrt; unread: number; km: number | null; at: number };

/** Lädt beim Öffnen, beim Zurückkehren in die App und jede Minute */
export function useAusfahrtBar(): BarState | null {
  const me = useSession()?.user.id;
  const [st, setSt] = useState<BarState | null>(null);
  const load = useCallback(() => {
    if (!me) {
      setSt(null);
      return;
    }
    Promise.all([listAusfahrten(), listRideChats().catch(() => [])])
      .then(async ([list, chats]) => {
        const ride = nextRide(list);
        if (!ride) return setSt(null);
        const unread = chats.find((c) => c.rideId === ride.id)?.unread ?? 0;
        // Entfernung nur am Tag und nur mit schon erteilter Erlaubnis, nie mit Nachfrage
        let km: number | null = null;
        const to: LatLon | null = ride.meeting ? [ride.meeting.lat, ride.meeting.lon] : ride.start;
        if (to && tagKurz(ride.startsAt) === t('Heute')) {
          const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
          if (perm?.granted) {
            const pos = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60000 }).catch(() => null);
            if (pos) km = (haversine([pos.coords.latitude, pos.coords.longitude], to) / 1000) * 1.25;
          }
        }
        setSt({ ride, unread, km, at: Date.now() });
      })
      .catch(() => undefined);
  }, [me]);
  useFocusEffect(load);
  useEffect(() => {
    const id = setInterval(load, 60000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [load]);
  return st;
}

function countdown(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return min < 60 ? tr('in {n} min', { n: min }) : tr('in {h}:{m} h', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });
}

export function AusfahrtBar({ state }: { state: BarState }) {
  const { ride, unread, km, at } = state;
  const live = ride.rideStatus === 'laeuft';
  const today = tagKurz(ride.startsAt) === t('Heute');
  const fresh = unread > 0 ? tr('{n} neu', { n: unread }) : null;
  const line = live
    ? [tr('{n} fahren mit', { n: ride.taken }), fresh]
    : today
      ? [countdown(ride.startsAt.getTime() - at), km != null ? strecke(km) : null, fresh]
      : [wann(ride.startsAt), fresh];
  const sub = line.filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tr('Ausfahrt')} ${ride.name}, ${sub}`}
      accessibilityHint={t('Öffnet die Ausfahrt')}
      onPress={() => router.push({ pathname: '/ausfahrt/[id]', params: { id: ride.id } })}
      style={styles.bar}>
      <View style={[styles.date, live ? styles.dateLive : today ? styles.dateToday : null]}>
        {live ? (
          <>
            <View style={styles.dot} />
            <AppText style={[styles.dateSmall, styles.liveText]}>{t('Läuft')}</AppText>
          </>
        ) : today ? (
          <>
            <AppText style={[styles.dateSmall, styles.onSignal]}>{t('Heute')}</AppText>
            <AppText style={[styles.dateTime, styles.onSignal]}>{uhr(ride.startsAt)}</AppText>
          </>
        ) : (
          <>
            <AppText style={styles.dateSmall}>{WD[ride.startsAt.getDay()]}</AppText>
            <AppText style={styles.dateDay}>{ride.startsAt.getDate()}</AppText>
          </>
        )}
      </View>
      <View style={styles.flex}>
        <AppText style={styles.title} numberOfLines={1}>
          {ride.name}
        </AppText>
        <AppText muted style={styles.sub} numberOfLines={1}>
          {sub}
        </AppText>
      </View>
      <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={Colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingLeft: Spacing.s, paddingRight: Spacing.l },
  date: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  dateToday: { backgroundColor: Colors.signal },
  dateLive: { backgroundColor: Colors.goodTint, gap: 2 },
  dateSmall: { fontFamily: Fonts.semibold, fontSize: 10, lineHeight: 12, color: Colors.muted },
  dateDay: { fontFamily: Fonts.display, fontSize: 16, lineHeight: 18, color: Colors.text },
  dateTime: { fontFamily: Fonts.bold, fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'] },
  onSignal: { color: Colors.onSignal },
  liveText: { color: Colors.good },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.good },
  title: { fontFamily: Fonts.semibold, fontSize: Type.small },
  sub: { fontFamily: Fonts.medium, fontSize: Type.caption },
});
