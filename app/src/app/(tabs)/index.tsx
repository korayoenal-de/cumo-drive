import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

// Beispieldaten, bis das Routing angebunden ist.
const PROFILES = [
  { id: 'kurvig', label: 'Kurvig' },
  { id: 'paesse', label: 'Pässe' },
  { id: 'entspannt', label: 'Entspannt' },
] as const;

const TOURS = [
  { name: 'Schwarzwaldhochstraße B500', meta: 'Rundtour ab Gernsbach · 3 h 05', km: '186 km', asphalt: 'Asphalt 98 %' },
  { name: 'Route des Crêtes', meta: 'Vosges · Colmar bis Thann · 3 h 40', km: '214 km', asphalt: 'Asphalt 96 %' },
  { name: 'Pfälzerwald Kurvenrunde', meta: 'Rundtour ab Bad Dürkheim · 2 h 30', km: '142 km', asphalt: 'Asphalt 94 %' },
];

export default function Entdecken() {
  const [profile, setProfile] = useState<string>('kurvig');

  return (
    <Screen>
      <View style={styles.header}>
        <AppText style={styles.brand}>CUMO DRIVE</AppText>
        <View style={styles.avatar}>
          <AppText style={styles.avatarText}>KÖ</AppText>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <AppText variant="caption" muted>
          Heute, trocken
        </AppText>
        <AppText variant="display">{'Wohin\nheute?'}</AppText>
      </View>

      <View style={{ gap: Spacing.m }}>
        <TextInput
          accessibilityLabel="Ziel oder Pass suchen"
          placeholder="Ziel oder Pass suchen"
          placeholderTextColor={Colors.muted}
          style={styles.search}
        />
        <View style={styles.chips}>
          {PROFILES.map((p) => (
            <Chip key={p.id} label={p.label} active={profile === p.id} onPress={() => setProfile(p.id)} />
          ))}
        </View>
      </View>

      <Pressable accessibilityRole="button" style={styles.fetch} onPress={() => router.push('/scan')}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText style={{ fontFamily: Fonts.semibold, fontSize: 15 }}>Tour vom Planer holen</AppText>
          <AppText variant="caption" muted>
            Am Rechner planen, QR Code scannen, losfahren
          </AppText>
        </View>
        <AppText style={styles.fetchArrow}>›</AppText>
      </Pressable>

      <View>
        <AppText variant="label" style={{ paddingBottom: Spacing.s }}>
          Für dich geplant
        </AppText>
        {TOURS.map((t) => (
          <Pressable key={t.name} style={styles.tour} accessibilityRole="button">
            <View style={{ flex: 1, gap: 3 }}>
              <AppText variant="title" numberOfLines={1}>
                {t.name}
              </AppText>
              <AppText variant="caption" muted>
                {t.meta}
              </AppText>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <AppText variant="number">{t.km}</AppText>
              <AppText style={styles.good}>{t.asphalt}</AppText>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.group}>
        <View style={{ flex: 1, gap: 3 }}>
          <AppText style={{ fontFamily: Fonts.semibold, fontSize: 15 }}>Sonntagsrunde · 6 Autos</AppText>
          <AppText variant="caption" muted>
            Start 9:30 Uhr, Gernsbach Bahnhof
          </AppText>
        </View>
        <Pressable style={styles.join} accessibilityRole="button">
          <AppText style={styles.joinText}>Beitreten</AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontFamily: Fonts.display, fontSize: 15, letterSpacing: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.semibold, fontSize: 13 },
  search: {
    height: 52,
    paddingHorizontal: Spacing.l,
    backgroundColor: Colors.surface,
    borderRadius: Radius.m,
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', gap: Spacing.s },
  tour: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surface2,
  },
  fetch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: Spacing.l,
    backgroundColor: Colors.surface,
    borderRadius: Radius.l,
    borderWidth: 1,
    borderColor: Colors.signal,
  },
  fetchArrow: { fontFamily: Fonts.display, fontSize: 28, color: Colors.signal },
  good: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.good },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: Spacing.l,
    backgroundColor: Colors.surface,
    borderRadius: Radius.l,
  },
  join: {
    height: 40,
    paddingHorizontal: Spacing.l,
    borderRadius: 20,
    backgroundColor: Colors.text,
    justifyContent: 'center',
  },
  joinText: { color: Colors.ground, fontFamily: Fonts.bold, fontSize: 14 },
});
