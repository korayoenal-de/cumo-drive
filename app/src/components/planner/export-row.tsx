/** Zwei Knöpfe zum Teilen einer Tour als GPX oder KML (Navi, Google Maps, calimoto, Garmin). */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { exportTour, type RouteFormat } from '@/lib/route-file';
import type { Tour } from '@/lib/tour';

export function ExportRow({ tour, onSurface }: { tour: Tour; onSurface?: boolean }) {
  const [busy, setBusy] = useState<RouteFormat | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: RouteFormat) => {
    setBusy(f);
    setErr(null);
    try {
      await exportTour(tour, f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Export hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        {(['gpx', 'kml'] as const).map((f) => (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityLabel={`Als ${f.toUpperCase()} exportieren`}
            onPress={() => !busy && void run(f)}
            style={({ pressed }) => [styles.btn, onSurface && styles.onSurface, pressed && styles.pressed]}>
            {busy === f ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.text}>{f.toUpperCase()} exportieren</AppText>}
          </Pressable>
        ))}
      </View>
      {err && <AppText variant="caption" style={styles.err}>{err}</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.s },
  btn: { flex: 1, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  onSurface: { backgroundColor: Colors.surface2 },
  pressed: { opacity: 0.7 },
  text: { fontFamily: Fonts.semibold, fontSize: 14 },
  err: { color: Colors.signal },
});
