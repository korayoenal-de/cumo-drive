/**
 * Richtungswahl als Drehregler: Den Knopf auf dem Ring in die gewünschte Himmelsrichtung ziehen
 * (rastet auf acht Richtungen ein), der Fächer zeigt, wohin die Runde führt. In der Mitte Zufall.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { DIRECTIONS, type Direction } from '@/lib/roundtrip';

const SIZE = 260;
const C = SIZE / 2;
const R = 86; // Ring, Beschriftung außen muss in die Fläche passen
const KNOB = 22;
/** Greifbereich: vom inneren Rand des Rings bis über die Beschriftung */
const RING_IN = 55;
const RING_OUT = 128;
const SHORT: Record<Exclude<Direction, 'zufall'>, string> = { N: 'N', NO: 'NO', O: 'O', SO: 'SO', S: 'S', SW: 'SW', W: 'W', NW: 'NW' };

const pt = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

function wedge(deg: number, r: number, spread = 32) {
  const a = pt(deg - spread, r);
  const b = pt(deg + spread, r);
  return `M ${C} ${C} L ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y} Z`;
}

export function DirectionDial({
  value,
  onChange,
  onDragChange,
}: {
  value: Direction;
  onChange: (d: Direction) => void;
  /** Ring wird gezogen: Blatt und Inhalt dürfen solange nicht scrollen (sonst kämpfen beide um den Finger) */
  onDragChange?: (on: boolean) => void;
}) {
  const [w, setW] = useState(SIZE);
  const [drag, setDrag] = useState<number | null>(null);
  const cur = DIRECTIONS.find((d) => d.id === value);
  const deg = drag ?? cur?.bearing ?? null;
  const scale = w / SIZE;

  /** zuletzt gemeldete Richtung (Index), auf dem UI Thread: gemeldet wird nur der Wechsel */
  const lastIdx = useSharedValue(-1);
  useEffect(() => {
    lastIdx.set(cur ? DIRECTIONS.indexOf(cur) : -1);
  }, [cur, lastIdx]);
  const pick = (i: number) => {
    // jede neue Richtung rastet spürbar ein, wie im iOS Picker
    haptic('rastung');
    onChange(DIRECTIONS[i].id);
  };
  /** x und y in Punkten innerhalb der Fläche */
  const track = (x: number, y: number) => {
    'worklet';
    const d = ((Math.atan2(y / scale - C, x / scale - C) * 180) / Math.PI + 90 + 360) % 360;
    scheduleOnRN(setDrag, d);
    const i = Math.round(d / 45) % 8;
    if (i !== lastIdx.get()) {
      lastIdx.set(i);
      scheduleOnRN(pick, i);
    }
  };
  const begin = () => onDragChange?.(true);
  const end = () => {
    setDrag(null);
    onDragChange?.(false);
  };
  /**
   * Der Ring gehört dem Regler, sofort beim Berühren (Koray 11.11.: das Ziehen kämpfte mit dem Scrollen der Seite).
   * Die Geste entscheidet schon beim Aufsetzen des Fingers: auf Ring oder Beschriftung übernimmt sie und das
   * Scrollen ist für diese Berührung aus; in der Mitte (Zufall) und in den Ecken gibt sie ab, dort scrollt die Seite.
   */
  const pan = Gesture.Pan()
    .manualActivation(true)
    .shouldCancelWhenOutside(false)
    .onTouchesDown((e, manager) => {
      const t = e.changedTouches[0];
      const r = t ? Math.hypot(t.x / scale - C, t.y / scale - C) : 0;
      if (e.numberOfTouches === 1 && r > RING_IN && r < RING_OUT) manager.activate();
      else manager.fail();
    })
    .onStart((e) => {
      scheduleOnRN(begin);
      track(e.x, e.y);
    })
    .onUpdate((e) => track(e.x, e.y))
    .onFinalize(() => scheduleOnRN(end));

  const step = (n: number) => {
    const i = cur ? DIRECTIONS.indexOf(cur) : n > 0 ? -1 : 0;
    onChange(DIRECTIONS[(i + n + 8) % 8].id);
  };

  const knob = deg != null ? pt(deg, R) : null;
  const label = value === 'zufall' ? 'Zufall' : cur!.label;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={pan}>
      <View
        collapsable={false}
        style={[styles.dial, { height: w }]}
        onLayout={(e: LayoutChangeEvent) => setW(Math.min(SIZE, e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Richtung der Runde"
        accessibilityValue={{ text: label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
        <Svg width={w} height={w} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle cx={C} cy={C} r={R} stroke={Colors.surface2} strokeWidth={30} fill="none" />
          {deg != null && <Path d={wedge(deg, R - 15)} fill={Colors.signal} opacity={0.22} />}
          {DIRECTIONS.map((d) => {
            const a = pt(d.bearing, R + 27);
            const t1 = pt(d.bearing, R - 9);
            const t2 = pt(d.bearing, R + 9);
            const on = value === d.id;
            return [
              <Line key={`t${d.id}`} x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={on ? Colors.signal : Colors.muted} strokeWidth={d.bearing % 90 === 0 ? 3 : 2} strokeLinecap="round" opacity={on ? 1 : 0.6} />,
              <SvgText key={`l${d.id}`} x={a.x} y={a.y + 5} fontSize={d.bearing % 90 === 0 ? 15 : 12} fontWeight={on ? '800' : '600'} fill={on ? Colors.text : Colors.muted} textAnchor="middle">
                {SHORT[d.id as Exclude<Direction, 'zufall'>]}
              </SvgText>,
            ];
          })}
          {knob && (
            <>
              <Line x1={C} y1={C} x2={knob.x} y2={knob.y} stroke={Colors.signal} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
              <Circle cx={knob.x} cy={knob.y} r={KNOB / 2 + 3} fill={Colors.ground} />
              <Circle cx={knob.x} cy={knob.y} r={KNOB / 2} fill={Colors.signal} />
            </>
          )}
        </Svg>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: value === 'zufall' }}
          accessibilityLabel="Zufällige Richtung"
          onPress={() => onChange('zufall')}
          style={[styles.center, { width: 92 * scale, height: 92 * scale, borderRadius: 46 * scale }, value === 'zufall' && styles.centerOn]}>
          <AppText style={[styles.centerText, value === 'zufall' && styles.centerTextOn]}>Zufall</AppText>
        </Pressable>
      </View>
      </GestureDetector>
      <AppText variant="caption" muted style={styles.caption}>
        {value === 'zufall' ? 'Die Runde führt in eine zufällige Richtung. Knopf auf dem Ring ziehen für eine feste Richtung.' : `Die Runde führt Richtung ${label}.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.xs },
  dial: { width: '100%', maxWidth: SIZE, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  centerOn: { backgroundColor: Colors.signal },
  centerText: { fontFamily: Fonts.bold, fontSize: Type.body },
  centerTextOn: { color: Colors.onSignal },
  caption: { textAlign: 'center' },
});
