/**
 * Karte mit Blatt darüber, wie in Apple Maps: Die Karte füllt den ganzen Screen, das Blatt liegt
 * darauf und hat drei Höhen (klein, halb, groß). Ziehen am Griff verschiebt das Blatt, beim Loslassen
 * rastet es mit einer Feder an der nächsten Höhe ein. Einfache Regeln:
 * 1. Der Kopf (Tabs oder Überschrift) steht oben im Inhalt und scrollt mit (kein fester Kopf,
 *    Entscheidung 5.11.: er verdeckte Inhalt). In der kleinen Höhe ist nur er zu sehen.
 * 2. Klein und halb zieht jede Wischbewegung das ganze Blatt, nichts scrollt.
 * 3. Erst ganz offen scrollt der Inhalt; ganz oben weiter nach unten ziehen bringt das Blatt
 *    zurück auf halb.
 * Der Inhalt reicht bis zum unteren Rand und läuft unter der Tab Leiste durch; der Weichzeichner
 * von iOS 26 an dieser Kante ist abgeschaltet, unten bleibt Luft, damit alles hochscrollbar ist.
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
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollViewMarker } from 'react-native-screens/experimental';

import { TAB_BAR_SPACE } from '@/components/ui/screen';
import { reportScroll } from '@/lib/tab-bar';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

/** 0 klein (nur der Kopf), 1 halb, 2 groß */
export type Detent = 0 | 1 | 2;

const DETENT_NAME = ['klein', 'halb', 'groß'] as const;
const MEDIUM = 0.6;
const LARGE = 0.92;
/** Geschätzte Kopfhöhe samt Griff, bis sie gemessen ist */
const HEAD_GUESS = 132;
/** Höhe der festen Griff Zone */
const GRAB_H = 28;
const SPRING = { damping: 38, stiffness: 320, mass: 1 };
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
  /** Inhalt ausblenden, ohne ihn abzubauen (Laden beim ersten Planen) */
  hideBody?: boolean;
  /** Hintergrund, meist die Karte. Bekommt die Höhe, die das Blatt unten verdeckt (klein oder halb). */
  background: (covered: number) => ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  /** Sprechtext für den Griff */
  grabberLabel: string;
  /** Inhalt darf gerade nicht scrollen (etwa beim Ziehen eines Punkts) */
  lockScroll?: boolean;
};

export function MapSheet({ detent, onDetentChange, header, children, background, scrollRef, grabberLabel, lockScroll, hideBody }: Props) {
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
    const v = fling.get();
    fling.set(0);
    if (placed.current) y.set(withSpring(target, { ...SPRING, velocity: v }));
    else y.set(target);
    if (measured) placed.current = true;
  }, [target, measured, y, fling]);

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
    return { sheet: make(false), grab: make(true) };
  }, [onDetentChange, y, snapsNow, detentNow, fling, startY]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  /** Der Inhaltsbereich wächst mit dem Blatt bis zum unteren Rand; unten Luft für die Tab Leiste */
  const areaStyle = useAnimatedStyle(() => ({ height: Math.max(0, large - y.get() - GRAB_H) }));

  /** Volle Höhe: oben weiter nach unten ziehen bringt das Blatt zurück auf halb */
  const collapsing = useRef(false);
  useEffect(() => {
    collapsing.current = false;
  }, [detent]);
  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    reportScroll(e.nativeEvent.contentOffset.y);
    // Unter voller Höhe bleibt der Inhalt immer oben, der Kopf ist dann immer zu sehen
    if (detent < 2 && e.nativeEvent.contentOffset.y > 1) scrollRef?.current?.scrollTo({ y: 0, animated: false });
    if (detent === 2 && !collapsing.current && e.nativeEvent.contentOffset.y < -48) {
      collapsing.current = true;
      onDetentChange(1);
    }
  }

  const step = (d: number) => onDetentChange(Math.max(0, Math.min(2, detent + d)) as Detent);
  function onAction(e: AccessibilityActionEvent) {
    if (e.nativeEvent.actionName === 'increment') step(1);
    else if (e.nativeEvent.actionName === 'decrement') step(-1);
    else if (e.nativeEvent.actionName === 'activate') onDetentChange(detent === 2 ? 0 : ((detent + 1) as Detent));
  }

  // Unter voller Höhe scrollt nichts: zurück an den Anfang, damit der Kopf zu sehen ist
  // (Kopf versteckt bei halber Höhe am 5.11.: ein Aufruf reichte nicht, wenn das Scrollen im selben
  // Moment gesperrt wird. Daher gleich, nach dem nächsten Bild und nach der Feder noch einmal.)
  useEffect(() => {
    if (detent === 2) return;
    const top = () => scrollRef?.current?.scrollTo({ y: 0, animated: false });
    top();
    const raf = requestAnimationFrame(top);
    const t = setTimeout(top, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [detent, scrollRef]);

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
        {/* Ab iOS 26 legt das System unter die schwebende Tab Leiste einen Weichzeichner über den
            Inhalt (Scroll Edge Effect). Im Blatt verdeckt das Inhalt, deshalb aus. */}
        <Animated.View style={areaStyle} {...(detent < 2 && !lockScroll ? pan.sheet.panHandlers : null)}>
        <ScrollViewMarker style={styles.flex} scrollEdgeEffects={{ bottom: 'hidden' }}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: bottomSpace + Spacing.xl }]}
          scrollEnabled={detent === 2 && !lockScroll}
          canCancelContentTouches={!lockScroll}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}>
          {/* Kopf (Tabs oder Überschrift) scrollt mit; seine Höhe bestimmt die kleine Höhe des Blatts */}
          <View onLayout={(e) => setHeadH(Math.round(e.nativeEvent.layout.height))} style={styles.head}>
            {header}
          </View>
          {/* hideBody: nur der Kopf, etwa beim Laden; der Inhalt bleibt erhalten, damit kein Zustand verloren geht */}
          <View style={[styles.body, hideBody && { display: 'none' }]}>{children}</View>
        </ScrollView>
        </ScrollViewMarker>
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
    boxShadow: Shadow.sheet,
  },
  head: { paddingTop: Spacing.l, paddingBottom: Spacing.xxl, gap: Spacing.s },
  body: { gap: Spacing.section },
  grabberZone: { height: GRAB_H, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.surface2 },
  content: { paddingHorizontal: Spacing.xl },
});
