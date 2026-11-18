/**
 * Überlagernde Touren (Koray 17.11., Leinwand „Überlagernde Touren“): trifft ein Tipp mehrere Touren, steht über dem
 * Blatt eine Reihe kleiner Karten. Wischen rastet je Karte ein (Haptik rastung) und wählt die Tour; die Karte der Welt
 * hebt sie orange hervor, die anderen sind grau. Tipp ins Leere schließt die Reihe (im Bildschirm).
 */
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated from 'react-native-reanimated';

import { FunMark, RouteThumb } from '@/components/tours/tour-bits';
import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Pressed } from '@/constants/theme';
import type { CommunityTour } from '@/lib/community';
import { useCommunityLine } from '@/lib/community-lines';
import { fahrzeit, meta as fmtMeta, strecke } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { tr } from '@/i18n';

export const RAIL_CARD_W = 280;
const GAP = 10;
const STEP = RAIL_CARD_W + GAP;

export function OverlapRail({ tours, active, onPick, bottom }: { tours: CommunityTour[]; active: string | null; onPick: (id: string) => void; bottom: number }) {
  const ref = useRef<ScrollViewInstance>(null);
  const idx = Math.max(0, tours.findIndex((x) => x.id === active));
  const last = useRef(idx);
  // Antippen einer Karte: zu ihr rollen
  useEffect(() => {
    if (last.current === idx) return;
    last.current = idx;
    ref.current?.scrollTo({ x: idx * STEP, animated: true });
  }, [idx]);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(tours.length - 1, Math.round(e.nativeEvent.contentOffset.x / STEP)));
    if (i === last.current) return;
    last.current = i;
    haptic('rastung');
    onPick(tours[i].id);
  };
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      {/* ohne Zeile „n Touren an dieser Stelle“ (Koray 18.11.), die Reihe spricht für sich; VoiceOver nennt die Zahl */}
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        onMomentumScrollEnd={onEnd}
        contentContainerStyle={styles.row}
        accessibilityRole="list"
        accessibilityLabel={tr('{n} Touren an dieser Stelle', { n: tours.length })}>
        {tours.map((x, i) => (
          <Animated.View key={x.id} entering={softEnter(i + 1)}>
            <RailCard t={x} on={x.id === active} pos={i + 1} of={tours.length} onPress={() => onPick(x.id)} />
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

function RailCard({ t: x, on, pos, of, onPress }: { t: CommunityTour; on: boolean; pos: number; of: number; onPress: () => void }) {
  const data = useCommunityLine(x, true);
  const km = Number(x.km);
  const line = fmtMeta(strecke(km), x.minutes ? fahrzeit(x.minutes) : null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={tr('Tour {pos} von {of}, {name}, {line}', { pos, of, name: x.name, line })}
      onPress={onPress}
      style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && styles.pressed]}>
      <RouteThumb shape={data?.thumb} muted={!on} />
      <View style={styles.text}>
        <AppText style={styles.name} numberOfLines={1}>
          {x.name}
        </AppText>
        <AppText style={styles.meta} numberOfLines={1}>
          {line}
        </AppText>
      </View>
      <FunMark score={data?.fun} reserve />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, gap: Spacing.s },
  row: { paddingHorizontal: Spacing.l, gap: GAP },
  card: { width: RAIL_CARD_W, height: 76, borderRadius: Radius.l, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.overlay },
  cardOn: { backgroundColor: Colors.surface2 },
  pressed: Pressed,
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.text },
  meta: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted, fontVariant: ['tabular-nums'] },
});
