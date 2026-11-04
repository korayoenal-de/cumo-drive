/**
 * Karte mit Blatt darüber, wie in Apple Maps: Die Karte füllt den ganzen Screen, das Blatt liegt
 * darauf und hat drei Höhen (klein, halb, groß). Ziehen am Kopf verschiebt das Blatt, beim Loslassen
 * rastet es mit einer Feder an der nächsten Höhe ein. Der Inhalt darunter scrollt.
 *
 * Bewusst in JS gebaut (PanResponder plus Reanimated), damit es ohne neue native Abhängigkeit
 * im vorhandenen App Build läuft.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { cancelAnimation, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_SPACE } from '@/components/ui/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** 0 klein (nur der Kopf), 1 halb, 2 groß */
export type Detent = 0 | 1 | 2;

const DETENT_NAME = ['klein', 'halb', 'groß'] as const;
const MEDIUM = 0.5;
const LARGE = 0.92;
/** Geschätzte Kopfhöhe, bis sie gemessen ist */
const HEAD_GUESS = 132;
const SPRING = { damping: 32, stiffness: 320, mass: 1 };
/** So weit in Millisekunden wird die Wurfbewegung beim Loslassen fortgeschrieben */
const PROJECT_MS = 180;

/** Über die kleinste oder größte Höhe hinaus nur noch gebremst ziehen. */
const rubber = (over: number) => over * 0.25;

type Props = {
  detent: Detent;
  onDetentChange: (d: Detent) => void;
  /** Kopf des Blatts: bleibt auch in der kleinen Höhe sichtbar und ist die Zieh Fläche */
  header: ReactNode;
  children: ReactNode;
  /** Hintergrund, meist die Karte. Bekommt die Höhe, die das Blatt unten verdeckt (klein oder halb). */
  background: (covered: number) => ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  /** Sprechtext für den Griff */
  grabberLabel: string;
};

export function MapSheet({ detent, onDetentChange, header, children, background, scrollRef, grabberLabel }: Props) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [boxH, setBoxH] = useState(0);
  const [headH, setHeadH] = useState(0);

  const H = boxH || win.height;
  /** Platz für die schwebende Tab Leiste und die Safe Area unten */
  const bottomSpace = insets.bottom + TAB_BAR_SPACE;
  const large = Math.round(Math.min(H * LARGE, H - insets.top - Spacing.s));
  const medium = Math.round(H * MEDIUM);
  const small = Math.round(Math.min((headH || HEAD_GUESS) + bottomSpace, medium - Spacing.xxxl));
  const visible = [small, medium, large];
  /** Verschiebung nach unten je Höhe; das Blatt selbst ist so hoch wie die große Höhe */
  const snaps = visible.map((v) => large - v);
  const target = snaps[detent];

  const y = useSharedValue(snaps[0]);
  const smallY = useSharedValue(snaps[0]);

  // Für die Zieh Geste, die außerhalb des Renderns läuft
  const live = useRef({ snaps, detent, onDetentChange });
  const velocity = useRef(0);
  const placed = useRef(false);
  const startY = useRef(0);
  useEffect(() => {
    live.current = { snaps, detent, onDetentChange };
  });

  // Zur gewählten Höhe federn; beim ersten Messen ohne Animation hinsetzen
  const measured = boxH > 0 && headH > 0;
  useEffect(() => {
    smallY.set(snaps[0]);
    const v = velocity.current;
    velocity.current = 0;
    if (placed.current) y.set(withSpring(target, { ...SPRING, velocity: v }));
    else y.set(target);
    if (measured) placed.current = true;
    // snaps[0] reicht, die anderen Werte hängen an target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, snaps[0], measured, y, smallY]);

  const [pan] = useState(() => {
    function settle(vy: number) {
      const { snaps: s, detent: cur, onDetentChange: change } = live.current;
      const projected = y.get() + vy * PROJECT_MS;
      let best = 0;
      for (let i = 1; i < s.length; i++) if (Math.abs(s[i] - projected) < Math.abs(s[best] - projected)) best = i;
      const v = vy * 1000;
      if (best === cur) y.set(withSpring(s[best], { ...SPRING, velocity: v }));
      else {
        velocity.current = v;
        change(best as Detent);
      }
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        cancelAnimation(y);
        startY.current = y.get();
      },
      onPanResponderMove: (_, g) => {
        const s = live.current.snaps;
        const top = s[2];
        const bottom = s[0];
        let next = startY.current + g.dy;
        if (next < top) next = top - rubber(top - next);
        if (next > bottom) next = bottom + rubber(next - bottom);
        y.set(next);
      },
      onPanResponderRelease: (_, g) => settle(g.vy),
      onPanResponderTerminate: (_, g) => settle(g.vy),
    });
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  // In der kleinen Höhe blendet der Inhalt unter dem Kopf aus, er läge sonst hinter der Tab Leiste
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.get(), [smallY.get() - 80, smallY.get()], [1, 0], Extrapolation.CLAMP),
  }));

  const step = (d: number) => onDetentChange(Math.max(0, Math.min(2, detent + d)) as Detent);
  function onAction(e: AccessibilityActionEvent) {
    if (e.nativeEvent.actionName === 'increment') step(1);
    else if (e.nativeEvent.actionName === 'decrement') step(-1);
    else if (e.nativeEvent.actionName === 'activate') onDetentChange(detent === 2 ? 0 : ((detent + 1) as Detent));
  }

  return (
    <View style={styles.box} onLayout={(e: LayoutChangeEvent) => setBoxH(Math.round(e.nativeEvent.layout.height))}>
      <View style={StyleSheet.absoluteFill}>{background(visible[Math.min(detent, 1)])}</View>
      <Animated.View style={[styles.sheet, { top: H - large, height: large }, sheetStyle]}>
        <View {...pan.panHandlers} onLayout={(e) => setHeadH(Math.round(e.nativeEvent.layout.height))} style={styles.head}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={grabberLabel}
            accessibilityHint="Wischen nach oben oder unten ändert die Höhe"
            accessibilityValue={{ text: DETENT_NAME[detent] }}
            accessibilityActions={[{ name: 'increment', label: 'Größer' }, { name: 'decrement', label: 'Kleiner' }, { name: 'activate' }]}
            onAccessibilityAction={onAction}
            onPress={() => onDetentChange(detent === 2 ? 0 : ((detent + 1) as Detent))}
            hitSlop={{ top: 8, bottom: 4 }}
            style={styles.grabberZone}>
            <View style={styles.grabber} />
          </Pressable>
          {header}
        </View>
        <Animated.View style={[styles.flex, contentStyle]}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: snaps[detent] + bottomSpace + Spacing.xl }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, backgroundColor: Colors.ground, overflow: 'hidden' },
  flex: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.ground,
    borderTopLeftRadius: Radius.l,
    borderTopRightRadius: Radius.l,
    boxShadow: '0 -6px 24px rgba(0,0,0,0.45)',
  },
  head: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.l, gap: Spacing.m },
  grabberZone: { height: 22, alignItems: 'center', justifyContent: 'center', marginBottom: -Spacing.xs },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.surface2 },
  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xs, gap: Spacing.xxl },
});
