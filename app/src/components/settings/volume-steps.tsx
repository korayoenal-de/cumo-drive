/**
 * Lautstärke der Ansagen (Tester Gregor 12.11.): bisher ließ sie sich nur während einer Ansage mit den
 * Tasten des iPhones ändern. Fünf Stufen als steigende Balken, antippen oder darüber ziehen. Nach jeder
 * Änderung kommt eine kurze Hörprobe; währenddessen regeln die Tasten des iPhones die Ansagen insgesamt.
 * In den Einstellungen (Fahren) und in der Navigation per langem Druck auf den Lautsprecher.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Colors, Motion } from '@/constants/theme';
import { setDriveSetting, useDriveSettings } from '@/lib/drive-settings';
import { haptic } from '@/lib/haptics';
import { chosenVoiceId, playSample } from '@/lib/voice-settings';

const STEPS = [0.2, 0.4, 0.6, 0.8, 1];
const LABEL = ['Sehr leise', 'Leise', 'Mittel', 'Laut', 'Volle Lautstärke'];
const PROBE = 'In 300 Metern rechts abbiegen.';

export function stepOf(v: number): number {
  let best = 0;
  STEPS.forEach((s, i) => {
    if (Math.abs(s - v) < Math.abs(STEPS[best] - v)) best = i;
  });
  return best;
}

export function volumeLabel(v: number): string {
  return LABEL[stepOf(v)];
}

export function VolumeSteps({ height = 44 }: { height?: number }) {
  const { volume } = useDriveSettings();
  const cur = stepOf(volume);
  const width = useRef(1);
  const last = useRef(cur);
  const probe = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (probe.current) clearTimeout(probe.current);
  }, []);

  const pick = (x: number) => {
    const i = Math.max(0, Math.min(STEPS.length - 1, Math.floor((x / width.current) * STEPS.length)));
    if (i === last.current) return;
    last.current = i;
    haptic('rastung');
    setDriveSetting('volume', STEPS[i]);
    // Hörprobe erst, wenn der Finger kurz ruht
    if (probe.current) clearTimeout(probe.current);
    probe.current = setTimeout(() => playSample(chosenVoiceId(), PROBE), 350);
  };
  const onTouch = (e: GestureResponderEvent) => pick(e.nativeEvent.locationX);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Lautstärke der Ansagen"
      accessibilityValue={{ text: LABEL[cur] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const i = Math.max(0, Math.min(STEPS.length - 1, cur + (e.nativeEvent.actionName === 'increment' ? 1 : -1)));
        last.current = i;
        setDriveSetting('volume', STEPS[i]);
        playSample(chosenVoiceId(), PROBE);
      }}
      onLayout={(e: LayoutChangeEvent) => {
        width.current = Math.max(1, e.nativeEvent.layout.width);
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        last.current = -1;
        onTouch(e);
      }}
      onResponderMove={onTouch}
      style={[styles.row, { height }]}>
      {STEPS.map((_, i) => (
        <Bar key={i} on={i <= cur} h={height * (0.36 + (0.64 * i) / (STEPS.length - 1))} />
      ))}
    </View>
  );
}

function Bar({ on, h }: { on: boolean; h: number }) {
  const style = useAnimatedStyle(() => ({
    height: withSpring(on ? h : h * 0.86, Motion.snap),
    backgroundColor: on ? Colors.signal : Colors.line,
  }));
  return <Animated.View pointerEvents="none" style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, flex: 1 },
  bar: { flex: 1, borderRadius: 4 },
});
