/**
 * Karte mit Blatt darüber, wie in Apple Maps: Die Karte füllt den ganzen Screen, das Blatt liegt
 * darauf und hat drei Höhen (klein, halb, groß). Ziehen am Griff verschiebt das Blatt, beim Loslassen
 * rastet es mit einer Feder an der nächsten Höhe ein. Nur der Griff steht fest, Kopf und Inhalt
 * scrollen gemeinsam. Wer auf halber Höhe nach oben scrollt, öffnet das Blatt ganz; wer auf voller
 * Höhe oben weiter nach unten zieht, bringt es zurück auf halbe Höhe.
 *
 * Bewusst in JS gebaut (PanResponder plus Reanimated), damit es ohne neue native Abhängigkeit
 * im vorhandenen App Build läuft.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import Animated, { cancelAnimation, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_SPACE } from '@/components/ui/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** 0 klein (nur der Kopf), 1 halb, 2 groß */
export type Detent = 0 | 1 | 2;

const DETENT_NAME = ['klein', 'halb', 'groß'] as const;
const MEDIUM = 0.6;
const LARGE = 0.92;
/** Geschätzte Kopfhöhe samt Griff, bis sie gemessen ist */
const HEAD_GUESS = 132;
/** Höhe der festen Griff Zone */
const GRAB_H = 28;
/** So weit nach oben gescrollt öffnet das halbe Blatt ganz */
const EXPAND_AT = 24;
/** So weit oben über den Anfang hinaus gezogen schließt das volle Blatt auf halb */
const COLLAPSE_AT = -64;
const SPRING = { damping: 32, stiffness: 320, mass: 1 };
/** So weit in Millisekunden wird die Wurfbewegung beim Loslassen fortgeschrieben */
const PROJECT_MS = 180;

/** Über die kleinste oder größte Höhe hinaus nur noch gebremst ziehen. */
const rubber = (over: number) => over * 0.25;

type Props = {
  detent: Detent;
  onDetentChange: (d: Detent) => void;
  /** Kopf des Blatts: steht oben im Inhalt und scrollt mit, in der kleinen Höhe ist er das Einzige, was zu sehen ist */
  header: ReactNode;
  children: ReactNode;
  /** Hintergrund, meist die Karte. Bekommt die Höhe, die das Blatt unten verdeckt (klein oder halb). */
  background: (covered: number) => ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
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
  const small = Math.round(Math.min((headH ? headH + GRAB_H : HEAD_GUESS) + bottomSpace, medium - Spacing.xxxl));
  const visible = [small, medium, large];
  /** Verschiebung nach unten je Höhe; das Blatt selbst ist so hoch wie die große Höhe */
  const snaps = visible.map((v) => large - v);
  const target = snaps[detent];

  const y = useSharedValue(snaps[0]);
  const smallY = useSharedValue(snaps[0]);
  // Für die Zieh Geste, die außerhalb des Renderns läuft, als Shared Values statt Refs
  const snapsNow = useSharedValue(snaps);
  const detentNow = useSharedValue<number>(detent);
  const fling = useSharedValue(0);
  const startY = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    snapsNow.set([snaps[0], snaps[1], snaps[2]]);
    detentNow.set(detent);
    // die Werte stecken alle in snaps[0..2] und detent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps[0], snaps[1], snaps[2], detent, snapsNow, detentNow]);

  // Zur gewählten Höhe federn; beim ersten Messen ohne Animation hinsetzen
  const measured = boxH > 0 && headH > 0;
  useEffect(() => {
    smallY.set(snaps[0]);
    const v = fling.get();
    fling.set(0);
    if (placed.current) y.set(withSpring(target, { ...SPRING, velocity: v }));
    else y.set(target);
    if (measured) placed.current = true;
    // snaps[0] reicht, die anderen Werte hängen an target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, snaps[0], measured, y, smallY, fling]);

  const pan = useMemo(() => {
    function settle(vy: number) {
      const s = snapsNow.get();
      const projected = y.get() + vy * PROJECT_MS;
      let best = 0;
      for (let i = 1; i < s.length; i++) if (Math.abs(s[i] - projected) < Math.abs(s[best] - projected)) best = i;
      const v = vy * 1000;
      if (best === detentNow.get()) y.set(withSpring(s[best], { ...SPRING, velocity: v }));
      else {
        fling.set(v);
        onDetentChange(best as Detent);
      }
    }
    /** grab: der Griff selbst, nimmt jede Berührung an und wertet ein kurzes Tippen als Höhenwechsel */
    const make = (grab: boolean) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => grab,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          cancelAnimation(y);
          startY.set(y.get());
        },
        onPanResponderMove: (_, g) => {
          const s = snapsNow.get();
          const top = s[2];
          const bottom = s[0];
          let next = startY.get() + g.dy;
          if (next < top) next = top - rubber(top - next);
          if (next > bottom) next = bottom + rubber(next - bottom);
          y.set(next);
        },
        onPanResponderRelease: (_, g) => {
          if (grab && Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) {
            const d = detentNow.get();
            onDetentChange((d === 2 ? 0 : d + 1) as Detent);
            return;
          }
          settle(g.vy);
        },
        onPanResponderTerminate: (_, g) => settle(g.vy),
      });
    return { head: make(false), grab: make(true) };
  }, [onDetentChange, y, snapsNow, detentNow, fling, startY]);

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

  // In der kleinen Höhe zeigt das Blatt nur den Kopf: zurück nach oben, Scrollen aus
  useEffect(() => {
    if (detent === 0) scrollRef?.current?.scrollTo({ y: 0, animated: false });
  }, [detent, scrollRef]);

  /** Scrollen steuert die Höhe: halb und hoch gescrollt öffnet, voll und oben gezogen schließt auf halb */
  const switching = useRef(false);
  useEffect(() => {
    switching.current = false;
  }, [detent]);
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (switching.current) return;
    const off = e.nativeEvent.contentOffset.y;
    if (detent === 1 && off > EXPAND_AT) {
      switching.current = true;
      onDetentChange(2);
    } else if (detent === 2 && off < COLLAPSE_AT) {
      switching.current = true;
      onDetentChange(1);
    }
  }

  return (
    <View style={styles.box} onLayout={(e: LayoutChangeEvent) => setBoxH(Math.round(e.nativeEvent.layout.height))}>
      <View style={StyleSheet.absoluteFill}>{background(visible[Math.min(detent, 1)])}</View>
      <Animated.View style={[styles.sheet, { top: H - large, height: large }, sheetStyle]}>
        <View
          {...pan.grab.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={grabberLabel}
          accessibilityHint="Wischen nach oben oder unten ändert die Höhe"
          accessibilityValue={{ text: DETENT_NAME[detent] }}
          accessibilityActions={[{ name: 'increment', label: 'Größer' }, { name: 'decrement', label: 'Kleiner' }, { name: 'activate' }]}
          onAccessibilityAction={onAction}
          style={styles.grabberZone}>
          <View style={styles.grabber} />
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: snaps[detent] + bottomSpace + Spacing.xl }]}
          scrollEnabled={detent !== 0}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          {/* In der kleinen Höhe ist der Kopf die Zieh Fläche, sonst scrollt er mit */}
          <View
            {...(detent === 0 ? pan.head.panHandlers : null)}
            onLayout={(e) => setHeadH(Math.round(e.nativeEvent.layout.height))}
            style={styles.head}>
            {header}
          </View>
          <Animated.View style={[styles.body, contentStyle]}>{children}</Animated.View>
        </ScrollView>
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
  head: { paddingTop: Spacing.s, paddingBottom: Spacing.l, gap: Spacing.s },
  body: { gap: Spacing.xxl },
  grabberZone: { height: GRAB_H, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.surface2 },
  content: { paddingHorizontal: Spacing.xl },
});
