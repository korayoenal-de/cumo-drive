/**
 * Route zum Treffpunkt mit unserer eigenen Navigation (Koray 14.11.): nie Apple Karten oder Google Maps.
 * Nach dem Tippen fragt ein Blatt Schnell (zuerst) oder Kurvig (Koray 14.11.). Geplant wird vom aktuellen
 * Standort zum Treffpunkt, danach öffnet die Navigation wie bei jeder Tour (auch in CarPlay).
 */
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async (way: Way) => {
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
      <Pressable accessibilityRole="button" accessibilityHint="Fragt nach Schnell oder Kurvig und startet die Navigation ab deinem Standort" disabled={busy} onPress={() => setOpen(true)} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.btnText}>Route zum Treffpunkt</AppText>}
      </Pressable>
      <ActionSheet
        visible={open}
        title="Route zum Treffpunkt"
        subtitle={place}
        items={[
          { key: 'schnell', icon: 'bolt.fill', label: 'Schnell', hint: 'Am schnellsten hin', primary: true, onPress: () => void go('schnell') },
          { key: 'kurvig', icon: 'point.topleft.down.to.point.bottomright.curvepath', label: 'Kurvig', hint: 'Schon auf dem Weg schöne Strecken', onPress: () => void go('kurvig') },
        ]}
        onClose={() => setOpen(false)}
      />
      {err && <AppText style={styles.err}>{err}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.m },
  btn: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  pressed: { opacity: 0.85 },
  err: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.stopText },
});
