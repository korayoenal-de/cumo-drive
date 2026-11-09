/**
 * Hauptaktion im Ladezustand (Koray 9.11.): Losfahren steht schon unten, aber inaktiv. Der Knopf füllt
 * sich von dunklem Orange zur Signalfarbe, darin der Schritt und die Prozentzahl. Der Routing Server meldet
 * keinen echten Fortschritt; geschätzt wird aus dem Schritt und der Zeit, nie rückwärts und 100 % erst,
 * wenn die Route fertig ist.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Type } from '@/constants/theme';

/** Bereich je Schritt: von, bis, Zeitkonstante in ms (nähert sich dem Ende, ohne es zu erreichen) */
export type LoadStage = { label: string; from: number; to: number; tau: number };

export function LoadingButton({ stage, done }: { stage: LoadStage; done?: boolean }) {
  const [raw, setPct] = useState(stage.from);
  const pct = done ? 100 : raw;
  const pctRef = useRef(stage.from);
  const fill = useSharedValue(stage.from / 100);

  useEffect(() => {
    if (done) return;
    const t0 = Date.now();
    const base = Math.max(pctRef.current, stage.from);
    const id = setInterval(() => {
      const k = 1 - Math.exp(-(Date.now() - t0) / stage.tau);
      const p = Math.min(99, Math.round(base + (stage.to - base) * k));
      if (p > pctRef.current) {
        pctRef.current = p;
        setPct(p);
      }
    }, 120);
    return () => clearInterval(id);
  }, [stage, done]);

  useEffect(() => {
    fill.value = withTiming(Math.max(0.04, pct / 100), { duration: done ? 200 : 350, easing: Easing.out(Easing.cubic) });
  }, [pct, done, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true, busy: !done }}
      accessibilityLabel={`Losfahren, ${stage.label}, ${pct} Prozent`}
      accessibilityLiveRegion="polite"
      style={styles.box}>
      <Animated.View style={[styles.fill, fillStyle]} />
      <View style={styles.row}>
        <AppText style={styles.label} numberOfLines={1}>{done ? 'Losfahren' : stage.label}</AppText>
        {!done && <AppText style={styles.pct}>{pct} %</AppText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signalDeep, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: Colors.signal },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  label: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal, flexShrink: 1 },
  pct: { fontFamily: Fonts.bold, fontSize: Type.button, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'], minWidth: 44 },
});
