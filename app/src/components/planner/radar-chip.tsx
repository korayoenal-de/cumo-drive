/**
 * Hinweis über der Karte, während das Radar sucht: wie viele kuratierte Strecken im Umkreis liegen.
 * Erscheint, wenn der erste Ring fast am Rand ist.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Type } from '@/constants/theme';
import { RADAR_MS } from '@/lib/radar';

export function RadarChip({ count, top, found }: { count: number; top: number; found?: number }) {
  // beim Auflösen: was der Ring auf der fertigen Runde gefunden hat
  const text = found != null ? `${found} kurvige ${found === 1 ? 'Abschnitt' : 'Abschnitte'} auf deiner Runde` : count === 0 ? 'Kurvige Straßen suchen' : count === 1 ? '1 Traumstrecke im Umkreis' : `${count} Traumstrecken im Umkreis`;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <Animated.View entering={FadeIn.delay(found != null ? 400 : RADAR_MS * 0.6).duration(300)} exiting={FadeOut.duration(200)} style={styles.chip} accessibilityLiveRegion="polite">
        <View style={styles.dot} />
        <AppText style={styles.text}>{text}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(22,22,24,0.92)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.signal },
  text: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
});
