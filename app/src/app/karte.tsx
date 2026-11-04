/**
 * Vollbild Karte der aktiven Tour: frei zoomen und verschieben, Warnungen anspringen, losfahren.
 * Die Tour kommt über setActiveTour aus dem Planer.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/route-map';
import { CLASS_LINE, tourWarnings } from '@/components/map/route-map-shared';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useActiveTour } from '@/lib/active-tour';
import { formatKm } from '@/lib/tour';

export default function KarteScreen() {
  const active = useActiveTour();
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState<number | null>(null);

  if (!active) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top + Spacing.xl }]}>
        <AppText variant="title">Keine Tour gewählt.</AppText>
        <AppText muted>Erstelle zuerst eine Tour im Tab Planen.</AppText>
        <RoundButton label="Schließen" onPress={() => router.back()} />
      </View>
    );
  }

  const { tour } = active;
  const warnings = tourWarnings(tour);
  const bottomH = (warnings.length ? 56 : 0) + 72 + insets.bottom;

  return (
    <View style={styles.root}>
      <RouteMap
        tour={tour}
        style={StyleSheet.absoluteFill}
        showUser
        highlightIndex={focus}
        onPressWarning={setFocus}
        edgePadding={{ top: insets.top + 80, right: 40, bottom: bottomH + 30, left: 40 }}
      />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.s }]} pointerEvents="box-none">
        <View style={styles.titleCard}>
          <AppText variant="title" numberOfLines={1}>{tour.name}</AppText>
          <AppText variant="caption" muted>
            {formatKm(tour.laenge_km, 0)} km{warnings.length ? `, ${warnings.length} Warnungen` : ', ohne Warnungen'}
          </AppText>
        </View>
        <RoundButton label="Schließen" onPress={() => router.back()} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.m }]}>
        {warnings.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <WarnChip label="Ganze Tour" active={focus == null} onPress={() => setFocus(null)} />
            {warnings.map(({ w, index }) => (
              <WarnChip
                key={index}
                color={CLASS_LINE[w.klasse].color}
                label={`km ${formatKm(w.start_km)} ${w.name || (w.klasse === 'raus' ? 'gesperrt' : 'prüfen')}`}
                active={focus === index}
                onPress={() => setFocus(index)}
              />
            ))}
          </ScrollView>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/navigation')}
          style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
          <AppText style={styles.goText}>Losfahren</AppText>
        </Pressable>
      </View>
    </View>
  );
}

function RoundButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <AppText style={styles.closeText}>{label}</AppText>
    </Pressable>
  );
}

function WarnChip({ label, color, active, onPress }: { label: string; color?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipOn]}>
      {color && <View style={[styles.chipDot, { backgroundColor: color }]} />}
      <AppText style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  empty: { flex: 1, backgroundColor: Colors.ground, padding: Spacing.xl, gap: Spacing.m, alignItems: 'flex-start' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.s, paddingHorizontal: Spacing.l },
  titleCard: { flex: 1, backgroundColor: 'rgba(11,11,12,0.88)', borderRadius: Radius.l, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m },
  close: { height: 48, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: 'rgba(11,11,12,0.88)', justifyContent: 'center' },
  closeText: { fontFamily: Fonts.semibold, fontSize: 15 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.m, paddingTop: Spacing.m, backgroundColor: 'rgba(11,11,12,0.92)', borderTopLeftRadius: Radius.l, borderTopRightRadius: Radius.l },
  chips: { gap: Spacing.s, paddingHorizontal: Spacing.l },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 260 },
  // Auswahl bleibt am hellen Rand erkennbar, das Padding gleicht die Randbreite aus
  chipOn: { borderWidth: 1, borderColor: Colors.text, paddingHorizontal: 13, backgroundColor: Colors.surface2 },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.muted },
  chipTextOn: { color: Colors.text, fontFamily: Fonts.semibold },
  go: { marginHorizontal: Spacing.l, height: 58, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: Fonts.display, fontSize: 20, color: Colors.onSignal, textTransform: 'uppercase', letterSpacing: 1 },
  pressed: { opacity: 0.8 },
});
