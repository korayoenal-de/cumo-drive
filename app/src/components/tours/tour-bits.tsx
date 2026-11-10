/**
 * Bausteine der Tourkarten, gemeinsam für Meine Touren (TourCard) und die Routen der Community,
 * damit beide gleich aussehen: Mini Streckenbild, Plaketten und Fahrspaß mit Zahl.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { FunGauge } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import { TOUR_FUN_NAMES, tourFunLevel } from '@/lib/fun-score';
import type { ThumbShape } from '@/lib/route-thumb';

export const THUMB = 56;

/**
 * Mini Karte der Strecke: Linie in Signalfarbe, Start als Punkt. Ohne Form (Linie lädt noch) bleibt
 * die dunkle Fläche als ruhiger Platzhalter in derselben Größe; die Linie blendet dann auf.
 */
export const RouteThumb = memo(function RouteThumb({ shape, fade }: { shape: ThumbShape | null | undefined; fade?: boolean }) {
  return (
    <View style={styles.thumb} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {shape && (
        <Animated.View entering={fade ? FadeIn.duration(Motion.enter) : undefined}>
          <Svg width={THUMB} height={THUMB}>
            <Polyline points={shape.points} fill="none" stroke={Colors.signal} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={shape.start[0]} cy={shape.start[1]} r={3} fill={Colors.text} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
});

/** Grüne Plakette für Eigenes (In der Community, Von dir) */
export function GoodBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <AppText style={styles.badgeText}>{label}</AppText>
    </View>
  );
}

/** Graue Plakette mit Initiale des Absenders (Koray 10.11., Variante A); ohne Namen „Aus der Community“ */
export function FromBadge({ author }: { author?: string | null }) {
  const name = author?.trim();
  const label = name ? `Von ${name}` : 'Aus der Community';
  return (
    <View style={styles.fromBadge} accessible accessibilityLabel={label}>
      <View style={styles.fromInitial}>
        <AppText style={styles.fromInitialText}>{(name || 'C').charAt(0).toUpperCase()}</AppText>
      </View>
      <AppText style={styles.fromText} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

/** Fahrspaß Pegel mit Zahl rechts in der Karte. reserve hält den Platz frei, solange der Wert fehlt. */
export function FunMark({ score, reserve }: { score: number | null | undefined; reserve?: boolean }) {
  if (score == null || score < 0) return reserve ? <View style={styles.fun} /> : null;
  const level = tourFunLevel(score);
  return (
    <View style={styles.fun} accessible accessibilityLabel={`Fahrspaß ${score} von 100, ${TOUR_FUN_NAMES[level]}`}>
      <FunGauge level={level} size={20} />
      <AppText style={styles.funText}>{score}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: THUMB, height: THUMB, borderRadius: Radius.m, backgroundColor: Colors.ground, overflow: 'hidden' },
  badge: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: Spacing.s, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Colors.goodTint },
  badgeText: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.good },
  fromBadge: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 3, paddingRight: Spacing.s, paddingVertical: 2, borderRadius: Radius.pill, backgroundColor: Colors.surface2 },
  fromInitial: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#3A3A40', alignItems: 'center', justifyContent: 'center' },
  fromInitialText: { fontFamily: Fonts.bold, fontSize: 10, color: Colors.text },
  fromText: { flexShrink: 1, fontFamily: Fonts.semibold, fontSize: Type.caption, color: '#C9C9CD' },
  fun: { alignItems: 'center', gap: 2, minWidth: 36 },
  funText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
});
