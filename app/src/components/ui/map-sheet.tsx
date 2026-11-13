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
 * Seit 11.11. (Koray: das Blatt hakelt, kurzer Inhalt lässt sich ins Leere scrollen):
 * - Das Ziehen läuft auf dem UI Thread (Gesture Handler plus Reanimated), auch wenn die App gerade plant.
 * - Der Inhaltsbereich hat eine feste Höhe; vorher wurde er bei jedem Bild neu gesetzt.
 * - Der Inhalt federt nicht mehr über seine Enden hinaus. Passt er ganz hinein, scrollt nichts.
 * - Ganz offen und oben angekommen folgt das Blatt beim Runterziehen direkt dem Finger.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollViewMarker } from 'react-native-screens/experimental';
import { scheduleOnRN } from 'react-native-worklets';

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
/** So weit in Sekunden wird die Wurfbewegung beim Loslassen fortgeschrieben */
const PROJECT_S = 0.18;

type Props = {
  detent: Detent;
  onDetentChange: (d: Detent) => void;
  /** Kopf des Blatts: steht oben im Inhalt und scrollt mit, in der kleinen Höhe ist er das Einzige, was zu sehen ist */
  header: ReactNode;
  children: ReactNode;
  /** Inhalt ausblenden, ohne ihn abzubauen (Laden beim ersten Planen) */
  hideBody?: boolean;
  /** So viel weniger Luft unter dem Kopf in der kleinen Höhe (Koray 13.11.: beim Laden 24 px weniger) */
  smallTrim?: number;
  /** Hintergrund, meist die Karte. Bekommt die Höhe, die das Blatt unten verdeckt (klein oder halb). */
  background: (covered: number) => ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  /** Sprechtext für den Griff */
  grabberLabel: string;
  /** Inhalt darf gerade nicht scrollen (etwa beim Ziehen eines Punkts) */
  lockScroll?: boolean;
  /** Scrollposition des Inhalts, etwa um Karten erst beim Sichtbarwerden zu laden */
  onScrollY?: (y: number) => void;
  /** Platz oben, den das Blatt auch ganz offen frei lässt (etwa für einen festen Umschalter über der Karte) */
  topReserve?: number;
};

export function MapSheet({ detent, onDetentChange, header, children, background, scrollRef, grabberLabel, lockScroll, hideBody, onScrollY, topReserve, smallTrim = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [boxH, setBoxH] = useState(0);
  const [headH, setHeadH] = useState(0);

  const H = boxH || win.height;
  /** Platz für die schwebende Tab Leiste und die Safe Area unten */
  const bottomSpace = insets.bottom + TAB_BAR_SPACE;
  const large = Math.round(Math.min(H * LARGE, H - Math.max(insets.top + Spacing.s, topReserve ?? 0)));
  const medium = Math.round(H * MEDIUM);
  const small = Math.round(Math.min((headH ? headH + GRAB_H : HEAD_GUESS) + bottomSpace - smallTrim, medium - Spacing.xxxl));
  const visible = [small, medium, large];
  /** Verschiebung nach unten je Höhe; das Blatt selbst ist so hoch wie die große Höhe */
  const snaps = visible.map((v) => large - v);
  const target = snaps[detent];

  const y = useSharedValue(snaps[0]);
  // Für die Zieh Geste auf dem UI Thread als Shared Values statt Refs
  const snapsNow = useSharedValue(snaps);
  const detentNow = useSharedValue<number>(detent);
  const fling = useSharedValue(0);
  const startY = useSharedValue(0);
  /** Scrollposition des Inhalts */
  const scrollY = useSharedValue(0);
  /** Ziehweg, ab dem das Blatt dem Finger folgt; null: gerade scrollt der Inhalt (nur ganz offen) */
  const base = useSharedValue<number | null>(0);
  const lastT = useSharedValue(0);
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

  /** Loslassen: zur nächsten Höhe in Wurfrichtung federn (vy in Punkten je Sekunde) */
  const settle = (vy: number) => {
    'worklet';
    const s = snapsNow.get();
    const projected = y.get() + vy * PROJECT_S;
    let best = 0;
    for (let i = 1; i < s.length; i++) if (Math.abs(s[i] - projected) < Math.abs(s[best] - projected)) best = i;
    if (best === detentNow.get()) y.set(withSpring(s[best], { ...SPRING, velocity: vy }));
    else {
      fling.set(vy);
      scheduleOnRN(onDetentChange, best as Detent);
    }
  };
  /** Blatt um dy ab dem Griffpunkt verschieben, über die Enden hinaus nur gebremst */
  const dragTo = (dy: number) => {
    'worklet';
    const s = snapsNow.get();
    const top = s[2];
    const bottom = s[0];
    let next = startY.get() + dy;
    if (next < top) next = top - (top - next) * 0.25;
    if (next > bottom) next = bottom + (next - bottom) * 0.25;
    y.set(next);
  };

  const native = Gesture.Native();
  /**
   * Ziehen im Inhalt. Klein und halb bewegt jede senkrechte Bewegung das Blatt. Ganz offen scrollt der Inhalt;
   * steht er oben und der Finger zieht weiter nach unten, übernimmt das Blatt und folgt dem Finger.
   */
  const bodyPan = Gesture.Pan()
    .enabled(!lockScroll)
    .activeOffsetY([-8, 8])
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(native)
    .onStart(() => {
      cancelAnimation(y);
      startY.set(y.get());
      lastT.set(0);
      // ganz offen gehört die Bewegung erst dem Inhalt; sonst zieht sie von Anfang an das Blatt
      base.set(detentNow.get() === 2 ? null : 0);
    })
    .onUpdate((e) => {
      const t = e.translationY;
      const down = t > lastT.get();
      lastT.set(t);
      if (base.get() === null) {
        // erst übernehmen, wenn der Inhalt ganz oben steht und es weiter nach unten geht
        if (scrollY.get() > 0.5 || !down) return;
        base.set(t);
        startY.set(snapsNow.get()[2]);
      }
      const dy = t - (base.get() ?? 0);
      if (detentNow.get() === 2 && dy < 0) {
        // wieder ganz oben: ab hier scrollt der Inhalt weiter
        y.set(snapsNow.get()[2]);
        base.set(null);
        return;
      }
      dragTo(dy);
    })
    .onEnd((e) => {
      if (base.get() === null) return;
      settle(e.velocityY);
    });
  /** Der Griff: ziehen wie oben, kurzes Tippen wechselt die Höhe */
  const grabPan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      cancelAnimation(y);
      startY.set(y.get());
    })
    .onUpdate((e) => dragTo(e.translationY))
    .onEnd((e) => settle(e.velocityY));
  const cycle = () => onDetentChange((detent === 2 ? 0 : detent + 1) as Detent);
  const grabTap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok) scheduleOnRN(cycle);
  });
  const grab = Gesture.Race(grabPan, grabTap);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));

  function onScrollJS(oy: number) {
    reportScroll(oy);
    onScrollY?.(oy);
    // Unter voller Höhe bleibt der Inhalt immer oben, der Kopf ist dann immer zu sehen
    if (detent < 2 && oy > 1) scrollRef?.current?.scrollTo({ y: 0, animated: false });
  }
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
    scheduleOnRN(onScrollJS, e.contentOffset.y);
  });

  const step = (d: number) => onDetentChange(Math.max(0, Math.min(2, detent + d)) as Detent);
  function onAction(e: AccessibilityActionEvent) {
    if (e.nativeEvent.actionName === 'increment') step(1);
    else if (e.nativeEvent.actionName === 'decrement') step(-1);
    else if (e.nativeEvent.actionName === 'activate') cycle();
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
    <GestureHandlerRootView style={styles.box} onLayout={(e: LayoutChangeEvent) => setBoxH(Math.round(e.nativeEvent.layout.height))}>
      <View style={StyleSheet.absoluteFill}>{background(visible[Math.min(detent, 1)])}</View>
      <Animated.View style={[styles.sheet, { top: H - large, height: large }, sheetStyle]}>
        <GestureDetector gesture={grab}>
          <View
            collapsable={false}
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
        </GestureDetector>
        {/* Feste Höhe (die des ganz offenen Blatts): bei klein und halb liegt der Rest unter dem Bildrand.
            Ab iOS 26 legt das System unter die schwebende Tab Leiste einen Weichzeichner über den
            Inhalt (Scroll Edge Effect). Im Blatt verdeckt das Inhalt, deshalb aus. */}
        <GestureDetector gesture={bodyPan}>
          <View collapsable={false} style={{ height: large - GRAB_H }}>
            <ScrollViewMarker style={styles.flex} scrollEdgeEffects={{ bottom: 'hidden' }}>
              <GestureDetector gesture={native}>
                <Animated.ScrollView
                  ref={scrollRef as RefObject<Animated.ScrollView | null> | undefined}
                  style={styles.flex}
                  contentContainerStyle={[styles.content, { paddingBottom: bottomSpace + Spacing.xl }]}
                  scrollEnabled={detent === 2 && !lockScroll}
                  canCancelContentTouches={!lockScroll}
                  // kein Federn über die Enden: oben übernimmt das Blatt, unten endet der Inhalt, wo er endet
                  bounces={false}
                  overScrollMode="never"
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
                </Animated.ScrollView>
              </GestureDetector>
            </ScrollViewMarker>
          </View>
        </GestureDetector>
      </Animated.View>
    </GestureHandlerRootView>
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
