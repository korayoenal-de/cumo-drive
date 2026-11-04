/**
 * Zeigt neue Kurznachrichten der Gruppe überall in der App oben als Banner und liest sie vor.
 * Eigene Nachrichten werden nicht angesagt.
 */
import { speakText } from '@/lib/navigation/voice';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useRide, type RideMsg } from '@/lib/group/ride';

export function RideBanner() {
  const ride = useRide();
  const insets = useSafeAreaInsets();
  const seen = useRef<string | null>(null);
  const [shown, setShown] = useState<RideMsg | null>(null);

  const latest = ride.messages[0];
  useEffect(() => {
    if (!latest || latest.id === seen.current) return;
    seen.current = latest.id;
    if (latest.from === ride.me?.id) return;
    const t0 = setTimeout(() => setShown(latest), 0);
    speakText(`${latest.name}: ${latest.text}`);
    const t1 = setTimeout(() => setShown((s) => (s?.id === latest.id ? null : s)), 8000);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [latest, ride.me?.id]);

  if (!shown) return null;
  return (
    <Pressable accessibilityRole="alert" onPress={() => setShown(null)} style={[styles.banner, { top: insets.top + Spacing.s }]}>
      <AppText variant="label" style={styles.from}>
        {shown.name}
      </AppText>
      <AppText style={styles.text}>{shown.text}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: Spacing.l,
    right: Spacing.l,
    zIndex: 100,
    padding: Spacing.l,
    borderRadius: Radius.l,
    backgroundColor: Colors.signal,
    gap: 2,
  },
  from: { color: Colors.onSignal },
  text: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 20 },
});
