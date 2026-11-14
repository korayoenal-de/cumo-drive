/**
 * Route zum Treffpunkt mit unserer eigenen Navigation (Koray 14.11.): nie Apple Karten oder Google Maps.
 * Schnell ist voreingestellt, Kurvig wählbar. Geplant wird vom aktuellen Standort zum Treffpunkt,
 * danach öffnet die Navigation wie bei jeder Tour (auch in CarPlay).
 */
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { setActiveTour } from '@/lib/active-tour';
import { avoidSetting } from '@/lib/avoid-settings';
import { planChecked } from '@/lib/plan';
import type { LatLon } from '@/lib/tour';

type Way = 'schnell' | 'kurvig';

async function here(): Promise<LatLon> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Für die Route brauchen wir deinen Standort.');
  const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 200 }).catch(() => null);
  const loc = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return [loc.coords.latitude, loc.coords.longitude];
}

/** Planen und die Navigation öffnen */
export async function navigateToMeeting(to: LatLon, place: string, way: Way): Promise<void> {
  const from = await here();
  const avoid = avoidSetting();
  const t = await planChecked(`Zum Treffpunkt ${place}`, [from, to], way, avoid);
  setActiveTour({ ...t, name: `Zum Treffpunkt ${place}`, namen: ['Dein Standort', place] }, way, avoid);
  router.push('/navigation');
}

export function MeetingRoute({ to, place }: { to: LatLon; place: string }) {
  const [way, setWay] = useState<Way>('schnell');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await navigateToMeeting(to, place, way);
    } catch (e) {
      setErr(e instanceof Error && e.message.length < 120 ? e.message : 'Die Route ließ sich gerade nicht planen. Bitte nochmal versuchen.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.box}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Art der Anfahrt">
        <Chip label="Schnell" active={way === 'schnell'} onPress={() => setWay('schnell')} />
        <Chip label="Kurvig" active={way === 'kurvig'} onPress={() => setWay('kurvig')} />
      </View>
      <Pressable accessibilityRole="button" accessibilityHint="Plant die Route ab deinem Standort und startet die Navigation" disabled={busy} onPress={() => void go()} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.btnText}>Route zum Treffpunkt</AppText>}
      </Pressable>
      {err && <AppText style={styles.err}>{err}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.m },
  row: { flexDirection: 'row', gap: Spacing.s },
  btn: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  pressed: { opacity: 0.85 },
  err: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.stopText },
});
