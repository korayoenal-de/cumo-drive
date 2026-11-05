/**
 * Highlights einer Route, nach Fahrspaß Pegel gerankt: Legenden zuerst, bei gleichem Pegel nach km.
 * Pässe und kuratierte Strecken kommen aus derselben Suche wie die Ansagen in der Navigation.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/action-bar';
import { FUN_NAMES, FunGauge, toFunLevel } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { findHighlights, highlightFacts } from '@/lib/navigation/highlights';
import { cumulativeKm } from '@/lib/navigation/route';
import type { LatLon } from '@/lib/tour';

export function HighlightList({ line }: { line: LatLon[] }) {
  const list = useMemo(() => {
    if (line.length < 2) return [];
    return findHighlights(line, cumulativeKm(line), null).sort((a, b) => b.level - a.level || a.startKm - b.startKm);
  }, [line]);
  if (!list.length) return null;
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{`Highlights auf der Strecke (${list.length})`}</AppText>
      <View style={styles.card}>
        {list.map((h, i) => {
          const lv = toFunLevel(h.level);
          return (
            <Animated.View key={h.id} entering={softEnter(i)} style={styles.row}>
              <View style={styles.flex}>
                <AppText style={styles.name} numberOfLines={1}>
                  {h.name}
                </AppText>
                <AppText style={styles.sub} numberOfLines={1}>
                  {`km ${Math.round(h.startKm)} · ${highlightFacts(h)}`}
                </AppText>
              </View>
              <View style={styles.gauge}>
                <FunGauge level={lv} size={28} />
                <AppText style={styles.level}>{FUN_NAMES[lv]}</AppText>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: Spacing.m },
  card: { borderRadius: Radius.l, backgroundColor: Colors.surface, paddingHorizontal: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64, paddingVertical: Spacing.s },
  name: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  sub: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  gauge: { alignItems: 'center', gap: 2, minWidth: 72 },
  level: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.muted },
});
