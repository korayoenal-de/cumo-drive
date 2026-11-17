/**
 * Taste mit Symbol, die ihre Aktion zeigt (Joy of Use, Koray 17.11.):
 * - Muster A „fliegt ins Ziel“ (ref.fly): die Taste schrumpft zum Kreis um ihr Symbol, das Symbol fliegt ins Ziel
 *   (Tab oder Stelle auf der Seite, lib/fly.ts).
 * - Muster B „klappt zusammen“ (ref.launch): die Taste klappt von links nach rechts zur runden Symboltaste zusammen,
 *   Haptik losfahren, dann folgt der nächste Bildschirm. Mit reveal baut sie sich dort von links nach rechts auf.
 * Ohne beides ist es eine normale Taste mit Symbol. Regeln: docs/design-prinzipien.md, Abschnitt Aktionen mit Ziel.
 */
import { forwardRef, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { BtnIconView, type BtnIcon } from '@/components/ui/btn-icon';
import { EASE_OUT } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Type } from '@/constants/theme';
import { flyTo, type FlyTarget } from '@/lib/fly';
import { haptic } from '@/lib/haptics';

/** Zusammenklappen und Aufbauen (ms) */
export const MORPH_MS = 240;
export const ICON_GAP = 8;

export type MorphActionRef = {
  /**
   * Muster A: zum Kreis schrumpfen, dann fliegt das Symbol; danach ruft es done (Taste darf verschwinden).
   * delay: erst done (etwa ein Modal schließen), der Flug startet danach an derselben Stelle
   */
  fly: (target: FlyTarget, done?: () => void, delay?: number) => void;
  /** Muster B: von links nach rechts zusammenklappen, dann then */
  launch: (then: () => void) => void;
  /** Zurück in die volle Taste (wenn nach launch nichts wechselt, etwa beim Abbruch) */
  reset: () => void;
};

type Props = {
  label: string;
  icon: BtnIcon;
  onPress: () => void;
  tone?: 'signal' | 'surface';
  busy?: boolean;
  disabled?: boolean;
  /** Muster B auf dem nächsten Bildschirm: baut sich von links nach rechts auf */
  reveal?: boolean;
  height?: number;
  textSize?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export const MorphAction = forwardRef<MorphActionRef, Props>(function MorphAction(
  { label, icon, onPress, tone = 'signal', busy, disabled, reveal, height = Size.button, textSize = Type.button, style, accessibilityHint },
  ref,
) {
  const reduced = useReducedMotion();
  const box = useRef<ComponentRef<typeof View>>(null);
  const [w, setW] = useState(0);
  const [cw, setCw] = useState(0);
  // Kanten des farbigen Grunds, Versatz des Inhalts und Deckkraft der Schrift
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const shift = useSharedValue(0);
  const text = useSharedValue(reveal ? 0 : 1);
  const shown = useSharedValue(reveal ? 0 : 1);
  const revealed = useRef(!reveal);
  const bg = tone === 'signal' ? Colors.signal : Colors.surface2;
  const fg = tone === 'signal' ? Colors.onSignal : Colors.text;
  // Mitte des Symbols in der Taste (Inhalt ist mittig: Symbol, Abstand, Schrift)
  const iconCx = (w - cw) / 2 + 10;
  const timing = { duration: reduced ? 0 : MORPH_MS, easing: EASE_OUT };

  const onLayout = (e: LayoutChangeEvent) => {
    const nw = e.nativeEvent.layout.width;
    setW(nw);
    if (!revealed.current && cw > 0) startReveal(nw, cw);
  };
  const onContent = (e: LayoutChangeEvent) => {
    const ncw = e.nativeEvent.layout.width;
    setCw(ncw);
    if (!revealed.current && w > 0) startReveal(w, ncw);
  };
  // Aufbauen: als Kreis links beginnen, nach rechts wachsen, die Schrift blendet ein
  function startReveal(width: number, content: number) {
    revealed.current = true;
    const cx = (width - content) / 2 + 10;
    right.value = width - height;
    shift.value = height / 2 - cx;
    shown.value = 1;
    right.value = withTiming(0, timing);
    shift.value = withTiming(0, timing);
    text.value = withTiming(1, { ...timing, duration: reduced ? 0 : MORPH_MS + 80 });
  }

  useImperativeHandle(ref, () => ({
    fly(target, done, delay) {
      const cx = iconCx;
      const toLeft = Math.max(0, cx - height / 2);
      const toRight = Math.max(0, w - (cx + height / 2));
      text.value = withTiming(0, { ...timing, duration: reduced ? 0 : 160 });
      right.value = withTiming(toRight, timing);
      left.value = withTiming(toLeft, timing, (ok) => {
        if (!ok) return;
        shown.value = 0;
        runOnJS(launchFlight)(target, toLeft, done, delay);
      });
    },
    launch(then) {
      haptic('losfahren');
      text.value = withTiming(0, { ...timing, duration: reduced ? 0 : 160 });
      shift.value = withTiming(w - height / 2 - iconCx, timing);
      left.value = withTiming(Math.max(0, w - height), timing, (ok) => {
        if (ok) runOnJS(then)();
      });
    },
    reset() {
      left.value = 0;
      right.value = 0;
      shift.value = 0;
      text.value = 1;
      shown.value = 1;
    },
  }));

  function launchFlight(target: FlyTarget, toLeft: number, done?: () => void, delay?: number) {
    box.current?.measureInWindow((x, y) => {
      const go = () => flyTo({ from: { x: x + toLeft + height / 2, y: y + height / 2, size: height }, target, icon, bg, fg });
      if (delay) setTimeout(go, delay);
      else go();
      done?.();
    });
  }

  const bgStyle = useAnimatedStyle(() => ({ left: left.value, right: right.value, opacity: shown.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateX: shift.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: text.value }));

  return (
    <Pressable
      ref={box}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy, disabled }}
      disabled={disabled || busy}
      onPress={onPress}
      onLayout={onLayout}
      style={({ pressed }) => [{ height }, style, pressed && styles.pressed, disabled && styles.disabled]}>
      <Animated.View style={[styles.bg, { borderRadius: Radius.pill, backgroundColor: bg }, bgStyle]} />
      <Animated.View style={[styles.fill, contentStyle]}>
        {busy ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.content} onLayout={onContent}>
            <BtnIconView icon={icon} color={fg} />
            <Animated.View style={textStyle}>
              <AppText style={{ fontFamily: Fonts.bold, fontSize: textSize, color: fg }} numberOfLines={1}>
                {label}
              </AppText>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

/** Runder Symbolknopf (Lesezeichen, Pass) als Startpunkt eines Flugs: misst sich und schickt das Symbol los */
export function flyFrom(view: ComponentRef<typeof View> | null, opts: { target: FlyTarget; icon: BtnIcon; bg: string; fg: string }) {
  view?.measureInWindow((x, y, w, h) => flyTo({ from: { x: x + w / 2, y: y + h / 2, size: Math.max(w, h) }, ...opts }));
}

const styles = StyleSheet.create({
  bg: { position: 'absolute', top: 0, bottom: 0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: ICON_GAP },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
  disabled: { opacity: 0.4 },
});
