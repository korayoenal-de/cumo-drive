/**
 * Richtungswahl als Drehregler: Den Knopf auf dem Ring in die gewünschte Himmelsrichtung ziehen
 * (rastet auf acht Richtungen ein), der Fächer zeigt, wohin die Runde führt. In der Mitte Zufall.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { DIRECTIONS, type Direction } from '@/lib/roundtrip';

const SIZE = 260;
const C = SIZE / 2;
const R = 86; // Ring, Beschriftung außen muss in die Fläche passen
const KNOB = 22;
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

export function DirectionDial({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  const [w, setW] = useState(SIZE);
  const [drag, setDrag] = useState<number | null>(null);
  const cur = DIRECTIONS.find((d) => d.id === value);
  const deg = drag ?? cur?.bearing ?? null;
  const scale = w / SIZE;

  // Ursprung beim Greifen merken, danach über pageX/pageY rechnen (locationX springt je nach Element unter dem Finger)
  const origin = useRef({ x: 0, y: 0 });
  const fromTouch = (e: GestureResponderEvent, grant = false) => {
    const n = e.nativeEvent;
    if (grant) origin.current = { x: n.pageX - n.locationX, y: n.pageY - n.locationY };
    const x = (grant ? n.locationX : n.pageX - origin.current.x) / scale - C;
    const y = (grant ? n.locationY : n.pageY - origin.current.y) / scale - C;
    return { r: Math.hypot(x, y), deg: ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360 };
  };
  const snap = (d: number) => DIRECTIONS[Math.round(d / 45) % 8];

  const move = (e: GestureResponderEvent, grant = false) => {
    const t = fromTouch(e, grant);
    setDrag(t.deg);
    const s = snap(t.deg);
    if (s.id !== value) onChange(s.id);
  };

  const step = (n: number) => {
    const i = cur ? DIRECTIONS.indexOf(cur) : n > 0 ? -1 : 0;
    onChange(DIRECTIONS[(i + n + 8) % 8].id);
  };

  const knob = deg != null ? pt(deg, R) : null;
  const label = value === 'zufall' ? 'Zufall' : cur!.label;

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.dial, { height: w }]}
        onLayout={(e: LayoutChangeEvent) => setW(Math.min(SIZE, e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Richtung der Runde"
        accessibilityValue={{ text: label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        // Ring greifen, nicht die Mitte (dort liegt Zufall)
        onStartShouldSetResponder={(e) => fromTouch(e, true).r > 55}
        onMoveShouldSetResponder={() => false}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => move(e, true)}
        onResponderMove={(e) => move(e)}
        onResponderRelease={() => setDrag(null)}
        onResponderTerminate={() => setDrag(null)}>
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
  centerText: { fontFamily: Fonts.displayBold, fontSize: Type.body },
  centerTextOn: { color: Colors.onSignal },
  caption: { textAlign: 'center' },
});
