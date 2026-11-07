/**
 * Fahrspaß Wert einer Tour (Konzept "Tour Fahrspaß Wert", 7.11.2026): kleine Plakette mit Logo und Zahl,
 * so leise wie die Runden Chips. Antippen öffnet die Erklärung mit den vier Teilen und der Skala.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { OptionsSheet } from '@/components/ui/action-sheet';
import { FunGauge } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { TOUR_FUN_NAMES, type TourFun, type TourFunLevel } from '@/lib/fun-score';

export function FunPill({ fun, onPress, active, best, hint = 'Zeigt, wie der Wert entsteht' }: { fun: TourFun; onPress: () => void; active?: boolean; best?: boolean; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Fahrspaß ${fun.score} von 100, ${TOUR_FUN_NAMES[fun.level]}`}
      accessibilityHint={hint}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, active && styles.active, best && styles.best, pressed && styles.pressed]}>
      <FunGauge level={fun.level} size={20} />
      <AppText style={styles.value}>{fun.score}</AppText>
    </Pressable>
  );
}

/** Unterschied zur vorigen Runde: grün, wenn besser, sonst neutral */
export function FunDelta({ delta }: { delta: number }) {
  const up = delta >= 0;
  return (
    <View style={[styles.delta, up ? styles.deltaUp : styles.deltaDown]} accessibilityLabel={`${up ? 'besser' : 'schlechter'} als die vorige Runde um ${Math.abs(delta)}`}>
      <AppText style={[styles.deltaText, { color: up ? Colors.good : Colors.muted }]}>{up ? `+${delta}` : `−${Math.abs(delta)}`}</AppText>
    </View>
  );
}

/** Texte zu TOUR_FUN_STEPS in fun-score */
const RANGES = ['bis 34', '35 bis 54', '55 bis 69', '70 bis 84', 'ab 85'];

export function FunSheet({ fun, name, visible, onClose }: { fun: TourFun | null; name: string; visible: boolean; onClose: () => void }) {
  return (
    <OptionsSheet visible={visible && !!fun} onClose={onClose}>
      {fun && (
        <View style={styles.sheet}>
          <View style={styles.head}>
            <FunGauge level={fun.level} size={48} />
            <View style={styles.flex}>
              <View style={styles.scoreRow}>
                <AppText style={styles.big}>{fun.score}</AppText>
                <AppText style={styles.levelName}>{TOUR_FUN_NAMES[fun.level]}</AppText>
              </View>
              <AppText style={styles.muted} numberOfLines={1}>{name}</AppText>
            </View>
          </View>
          <View style={styles.facets}>
            {fun.facets.map((f) => (
              <View key={f.id} style={styles.facet} accessible accessibilityLabel={`${f.label}, ${f.value}, Anteil ${Math.round(f.weight * 100)} Prozent`}>
                <View style={styles.facetHead}>
                  <AppText style={styles.facetLabel}>{f.label}</AppText>
                  <AppText style={styles.muted}>
                    {f.value} · {Math.round(f.weight * 100)} %
                  </AppText>
                </View>
                <View style={styles.track}>
                  <View style={[styles.bar, { width: `${Math.round(f.share * 100)}%` }]} />
                </View>
                <AppText style={styles.muted}>{f.text}</AppText>
              </View>
            ))}
          </View>
          <View style={styles.scale}>
            <AppText style={styles.muted}>Skala</AppText>
            {([1, 2, 3, 4, 5] as TourFunLevel[]).map((l) => (
              <View key={l} style={[styles.scaleRow, l === fun.level && styles.scaleOn]}>
                <FunGauge level={l} size={22} />
                <AppText style={styles.scaleName}>{TOUR_FUN_NAMES[l]}</AppText>
                <AppText style={styles.muted}>{RANGES[l - 1]}</AppText>
              </View>
            ))}
          </View>
        </View>
      )}
    </OptionsSheet>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s,
    height: 44,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  active: { backgroundColor: Colors.line },
  best: { borderColor: Colors.signal },
  pressed: { opacity: 0.7 },
  value: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  delta: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  deltaUp: { backgroundColor: Colors.goodTint },
  deltaDown: { backgroundColor: Colors.surface2 },
  deltaText: { fontFamily: Fonts.bold, fontSize: Type.body, fontVariant: ['tabular-nums'] },
  sheet: { gap: Spacing.l },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  flex: { flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.s },
  big: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, fontVariant: ['tabular-nums'] },
  levelName: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.signal },
  muted: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  facets: { gap: Spacing.m },
  facet: { gap: 6 },
  facetHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.s },
  facetLabel: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.line, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.signal },
  scale: { gap: 2 },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, height: 36, paddingHorizontal: 10, borderRadius: Radius.s },
  scaleOn: { backgroundColor: Colors.line },
  scaleName: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
});
