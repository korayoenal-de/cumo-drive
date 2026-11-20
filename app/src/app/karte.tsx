/**
 * Vollbild Karte der aktiven Tour: frei zoomen und verschieben, Warnungen anspringen, losfahren.
 * Die Tour kommt über setActiveTour aus dem Planer.
 *
 * Mit ?ausfahrt=<id> (Koray 20.11.2026): die Tour einer Ausfahrt, nur zum Ansehen. Kein Losfahren (das läuft
 * über die Ausfahrt), der Organisator bekommt „Tour bearbeiten“: öffnet die gespeicherte Tour im Planer, beim
 * Überschreiben bietet der Planer an, die Ausfahrt nachzuziehen. Die aktive Tour bleibt unberührt.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { RouteMap } from '@/components/map/route-map';
import { CLASS_LINE, tourWarnings } from '@/components/map/route-map-shared';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size, Pressed } from '@/constants/theme';
import { useActiveTour, type ActiveTour } from '@/lib/active-tour';
import { ausfahrtTour, rideSource } from '@/lib/ausfahrten';
import { setEditTour } from '@/lib/edit-tour';
import { readLibrary } from '@/lib/library';
import { showToast } from '@/lib/toast';
import { formatKm } from '@/lib/tour';
import { t, tr } from '@/i18n';
import { DEFAULT_AVOID } from '@/lib/valhalla';
import { ToastHost } from '@/components/ui/toast';

export default function KarteScreen() {
  const { ausfahrt } = useLocalSearchParams<{ ausfahrt?: string }>();
  const own = useActiveTour();
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState<number | null>(null);
  const [ride, setRide] = useState<{ view: ActiveTour; tourId: string | null; isOwner: boolean } | null>(null);
  useEffect(() => {
    if (!ausfahrt) return;
    let live = true;
    void Promise.all([ausfahrtTour(ausfahrt), rideSource(ausfahrt).catch(() => null)])
      .then(([full, src]) => {
        if (!live || !full) return;
        setRide({ view: { tour: { ...full.tour, name: src?.name ?? full.tour.name }, profile: full.profile, avoid: DEFAULT_AVOID }, tourId: src?.tourId ?? null, isOwner: !!src?.isOwner });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ausfahrt]);
  const active = ausfahrt ? (ride?.view ?? null) : own;

  /** Organisator: gespeicherte Tour der Ausfahrt im Planer öffnen */
  const editRide = () => {
    const saved = ride?.tourId ? readLibrary().find((x) => x.id === ride.tourId) : null;
    if (!saved) {
      showToast(tr('Die Tour der Ausfahrt liegt nicht unter deinen Touren.'), { tone: 'error' });
      return;
    }
    setEditTour(saved, { label: 'Touren', href: '/touren' });
    router.dismissAll();
    router.navigate('/');
  };

  if (ausfahrt && !ride) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top + Spacing.xl }]}>
        <AppText muted>{t('Karte lädt')}</AppText>
        <RoundButton label={t('Schließen')} onPress={() => router.back()} />
      </View>
    );
  }

  if (!active) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top + Spacing.xl }]}>
        <AppText variant="title">{t('Keine Tour gewählt.')}</AppText>
        <AppText muted>{t('Erstelle zuerst eine Tour im Tab Planen.')}</AppText>
        <RoundButton label={t('Schließen')} onPress={() => router.back()} />
      </View>
    );
  }

  const { tour } = active;
  const warnings = tourWarnings(tour);
  // Ausfahrt ohne Organisator Rolle: unten nur die Warnungen, ohne Taste
  const hasButton = !ausfahrt || !!ride?.isOwner;
  const bottomH = (warnings.length ? 56 : 0) + (hasButton ? 72 : 0) + insets.bottom;

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
            {formatKm(tour.laenge_km, 0)} km{warnings.length ? `, ${warnings.length} Warnungen` : t(', ohne Warnungen')}
          </AppText>
        </View>
        <RoundButton label={t('Schließen')} onPress={() => router.back()} />
      </View>

      {(hasButton || warnings.length > 0) && (
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.m }]}>
        {warnings.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <WarnChip label={t('Ganze Tour')} active={focus == null} onPress={() => setFocus(null)} />
            {warnings.map(({ w, index }) => (
              <WarnChip
                key={index}
                color={CLASS_LINE[w.klasse].color}
                label={`km ${formatKm(w.start_km)} ${w.name || (w.klasse === 'raus' ? 'gesperrt' : t('prüfen'))}`}
                active={focus === index}
                onPress={() => setFocus(index)}
              />
            ))}
          </ScrollView>
        )}
        {!ausfahrt ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic('losfahren');
              router.replace('/navigation');
            }}
            style={({ pressed }) => [styles.go, pressed && styles.pressed]}>
            <AppText style={styles.goText}>{t('Losfahren')}</AppText>
          </Pressable>
        ) : ride?.isOwner ? (
          // Nebenaktion, leise: losgefahren wird über die Ausfahrt (eine Hauptaktion je Ansicht)
          <Pressable accessibilityRole="button" onPress={editRide} style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
            <AppText style={styles.quietText}>{t('Tour bearbeiten')}</AppText>
          </Pressable>
        ) : null}
      </View>
      )}
      <ToastHost />
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
  titleCard: { flex: 1, backgroundColor: Colors.overlay, borderRadius: Radius.l, paddingHorizontal: Spacing.l, paddingVertical: Spacing.m },
  close: { height: 48, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.overlay, justifyContent: 'center' },
  closeText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.m, paddingTop: Spacing.m, backgroundColor: Colors.overlay, borderTopLeftRadius: Radius.l, borderTopRightRadius: Radius.l },
  chips: { gap: Spacing.s, paddingHorizontal: Spacing.l },
  chip: { height: Size.chip, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', gap: Spacing.s, maxWidth: 260 },
  // Auswahl bleibt am hellen Rand erkennbar, das Padding gleicht die Randbreite aus
  chipOn: { borderWidth: 1, borderColor: Colors.text, paddingHorizontal: 13, backgroundColor: Colors.surface2 },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontFamily: Fonts.medium, fontSize: Type.small, color: Colors.muted },
  chipTextOn: { color: Colors.text, fontFamily: Fonts.semibold },
  go: { marginHorizontal: Spacing.l, height: 58, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  quiet: { marginHorizontal: Spacing.l, height: 52, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  pressed: Pressed,
});
