/**
 * Rückblick auf eine gefahrene Tour (Koray 15.11.: die Zusammenfassung nach der Fahrt war später nicht mehr zu
 * finden). Aus Touren, Gefahren: Tippen auf eine Fahrt öffnet diese Ansicht.
 *
 * Aufbau wie die Ausfahrt: Name, Datum und Fahrzeug, Streckenbild, Kennzahlen (Strecke, Fahrzeit), darunter die
 * Fahrtstatistik und die eigene Bewertung. Hauptaktion fest unten: die Strecke im Planer öffnen (speichern,
 * nochmal fahren).
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/route-map';
import { BackLink } from '@/components/ui/back-link';
import { Kennzahlen } from '@/components/ui/kennzahlen';
import { IconLabel } from '@/components/ui/btn-icon';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Radius, Size, Spacing, Type } from '@/constants/theme';
import { BAD_REASONS, getDrive, scoreWord, type DriveDetail } from '@/lib/drives';
import { datum, meta } from '@/lib/format';
import { openDriveInPlanner } from '@/lib/open-drive';
import { fmtG } from '@/lib/ride-stats';
import type { LatLon, Tour } from '@/lib/tour';
import { t } from '@/i18n';

const OLD_RATING: Record<number, string> = { 1: t('Nicht gut'), 2: 'Gut', 3: t('Sensationell') };

export default function FahrtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<DriveDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getDrive(String(id))
      .then((x) => {
        if (!live) return;
        if (x) setD(x);
        else setErr(t('Diese Fahrt gibt es nicht mehr.'));
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  const tour = useMemo<Tour | null>(
    () =>
      d && d.track.length > 1
        ? { name: d.name, laenge_km: Number(d.km), wegpunkte: [d.track[0], d.track[d.track.length - 1]], linie: [{ c: 'ok', p: d.track }], warnungen: [], geprueft: false }
        : null,
    [d],
  );

  // Orte der Spitzenwerte (ab 15.11. gespeichert), wie nach der Fahrt in der Navigation
  const pins = useMemo(() => {
    const k = d?.peaks;
    if (!k) return [];
    const out: { id: string; p: LatLon; label: string; title: string }[] = [];
    if (k.spitze) out.push({ id: 'v', p: k.spitze.p, label: `${Math.round(k.spitze.v)} km/h`, title: t('Höchstgeschwindigkeit') });
    if (k.quer) out.push({ id: 'q', p: k.quer.p, label: fmtG(k.quer.v), title: t('Größte Querbeschleunigung') });
    if (k.bremsung) out.push({ id: 'b', p: k.bremsung.p, label: `−${fmtG(k.bremsung.v)}`, title: t('Stärkste Bremsung') });
    return out;
  }, [d]);

  const stats: [string, string | null][] = d
    ? [
        ['Schnitt', d.avg_kmh != null ? `${Math.round(Number(d.avg_kmh))} km/h` : null],
        ['Spitze', d.max_kmh != null ? `${Math.round(Number(d.max_kmh))} km/h` : null],
        [t('Kurven'), d.curves != null ? String(d.curves) : null],
        [t('Quer in Kurven'), d.max_lat_g != null ? fmtG(Number(d.max_lat_g)) : null],
        [t('Stärkste Bremsung'), d.max_brake_g != null ? fmtG(Number(d.max_brake_g)) : null],
      ]
    : [];
  const rating = d ? (d.rating_score != null ? scoreWord(d.rating_score) : d.rating ? OLD_RATING[d.rating] : null) : null;
  const reasons = (d?.rating_reasons ?? []).map((r) => BAD_REASONS.find((b) => b.id === r)?.label ?? r);

  return (
    <View style={[styles.flex, { backgroundColor: Colors.ground }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.s, paddingBottom: insets.bottom + 120 }]}>
        <BackLink label={t('Touren')} fallback="/touren" />
        {err && <AppText muted>{err}</AppText>}
        {!d && !err && <ActivityIndicator color={Colors.muted} />}
        {d && (
          <>
            <View style={styles.gapXs}>
              <AppText variant="display" numberOfLines={2}>
                {d.name}
              </AppText>
              <AppText muted>{meta(datum(new Date(d.started_at)), d.vehicle_name)}</AppText>
            </View>
            {/* Regel Konsistenzprüfung 15.11.: Kennzahlen direkt unter dem Titel, die Karte danach */}
            <Kennzahlen km={Number(d.km)} minutes={d.moving_min} />
            {/* echte Karte statt Strichbild (Koray 15.11.), mit den Orten der Spitzenwerte */}
            {tour && (
              <View style={styles.preview}>
                <RouteMap tour={tour} pins={pins} style={StyleSheet.absoluteFill} edgePadding={{ top: 48, right: 32, bottom: 32, left: 32 }} />
              </View>
            )}
            {pins.length > 0 && <AppText muted>{t('Die Spitzenwerte sind auf der Karte markiert.')}</AppText>}
            {stats.some((s) => s[1] != null) && (
              <View style={styles.grid}>
                {stats
                  .filter((x): x is [string, string] => x[1] != null)
                  .map(([l, v]) => (
                    <View key={l} style={styles.cell}>
                      <AppText style={styles.label}>{l}</AppText>
                      <AppText style={styles.value}>{v}</AppText>
                    </View>
                  ))}
              </View>
            )}
            {rating && (
              <View style={styles.card}>
                <AppText style={styles.label}>{t('Deine Bewertung')}</AppText>
                <AppText variant="title">{rating}</AppText>
                {reasons.length > 0 && <AppText muted>{reasons.join(', ')}</AppText>}
                {d.rating_note ? <AppText muted>{d.rating_note}</AppText> : null}
              </View>
            )}
          </>
        )}
      </ScrollView>
      {d && d.track.length > 1 && (
        <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.m }]}>
          <Pressable accessibilityRole="button" accessibilityHint={t('Zeigt die Strecke im Planer, dort kannst du sie speichern und nochmal fahren')} onPress={() => openDriveInPlanner(d, d.track)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <IconLabel icon={{ tab: 'planen' }} color={Colors.onSignal}>
<AppText style={styles.primaryText}>{t('Im Planer öffnen')}</AppText>
</IconLabel>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.xl },
  gapXs: { gap: Spacing.xs },
  preview: { height: 280, borderRadius: Radius.l, overflow: 'hidden', backgroundColor: Colors.surface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.m },
  cell: { width: '50%', gap: 2, paddingRight: Spacing.s },
  label: { fontFamily: Fonts.semibold, fontSize: Type.body, lineHeight: Leading.body, color: Colors.muted },
  value: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, textTransform: 'uppercase', fontVariant: ['tabular-nums'], color: Colors.text },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.xs },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: Spacing.m, paddingHorizontal: Spacing.xl, backgroundColor: Colors.ground },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.button },
  pressed: { opacity: 0.85 },
});
