/**
 * Tempo in der Navigation, unten links: dein Tempo und daneben das erlaubte Tempo als Schild.
 * Das Limit kommt aus den Straßendaten entlang der Route (speed-zones.ts); ohne Angabe steht kein Schild,
 * geraten wird nie. Zu schnell färbt die Fläche nur ein (warnTint), ohne Ton und ohne Wertung.
 */
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

/** Spielraum, bevor die Fläche einfärbt (Tachoabweichung) */
const OVER_KMH = 4;

export function SpeedBadge({ speedKmh, limit }: { speedKmh: number | null; limit: number | null }) {
  const v = speedKmh != null && speedKmh >= 3 ? Math.round(speedKmh) : 0;
  const over = limit != null && limit < 130 && v > limit + OVER_KMH;
  const label = `Tempo ${v} km/h${limit != null ? `, erlaubt ${limit >= 130 ? 'unbegrenzt' : `${limit} km/h`}` : ''}${over ? ', zu schnell' : ''}`;
  return (
    <View style={[styles.badge, over && styles.over]} accessible accessibilityLabel={label}>
      <View style={styles.speed}>
        <AppText style={[styles.value, over && styles.valueOver]}>{v}</AppText>
        <AppText style={styles.unit}>km/h</AppText>
      </View>
      {limit != null && (
        <View style={[styles.sign, limit >= 130 && styles.signFree]}>
          {limit >= 130 ? <View style={styles.freeBar} /> : <AppText style={styles.signText}>{limit}</AppText>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    paddingVertical: Spacing.s,
    paddingLeft: Spacing.l,
    paddingRight: Spacing.s,
    minHeight: 56,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(11,11,12,0.92)',
  },
  over: { backgroundColor: 'rgba(58,44,15,0.96)' },
  speed: { alignItems: 'center', minWidth: 40 },
  value: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 26, color: Colors.text, fontVariant: ['tabular-nums'] },
  valueOver: { color: Colors.warn },
  unit: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.muted },
  // Verkehrszeichen: weiß mit rotem Ring, schwarze Zahl
  sign: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#D7261E', alignItems: 'center', justifyContent: 'center' },
  signFree: { borderColor: '#FFFFFF', borderWidth: 0 },
  freeBar: { width: 34, height: 4, backgroundColor: '#1C1C1F', transform: [{ rotate: '-45deg' }] },
  signText: { fontFamily: Fonts.bold, fontSize: 16, color: '#0B0B0C', fontVariant: ['tabular-nums'] },
});
