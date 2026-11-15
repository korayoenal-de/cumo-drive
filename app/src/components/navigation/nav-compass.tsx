/**
 * Kompass neben der Tempopille (Koray 15.11., Tester: nachts mit mitdrehender Karte ging die Orientierung
 * verloren). Die Nadel zeigt immer nach Norden und dreht mit der Karte. Ein Tipp wechselt zwischen
 * „Fahrtrichtung oben“ und „Norden oben“; genordet ist der Kreis orange getönt. Bleibt immer sichtbar, auch
 * im Stand, ohne Tempoanzeige und während der Bremsempfehlung. Kurz nach dem Wechsel steht der Modus daneben.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius } from '@/constants/theme';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const SIZE = 56;

export function NavCompass({ heading, northUp, onToggle }: { /** Fahrtrichtung in Grad, null ohne Kurs */ heading: number | null; northUp: boolean; onToggle: () => void }) {
  const reduced = useReducedMotion();
  // Nadel: Norden auf dem Bildschirm. Fahrtrichtung oben heißt Norden liegt bei minus Kurs.
  const target = northUp ? 0 : -(heading ?? 0);
  const rot = useSharedValue(target);
  useEffect(() => {
    // kürzester Weg, damit die Nadel bei 359 nach 1 Grad nicht einmal herumdreht
    const cur = rot.get();
    const d = ((((target - cur) % 360) + 540) % 360) - 180;
    rot.set(withTiming(cur + d, { duration: reduced ? 0 : 450, easing: EASE }));
  }, [target, reduced, rot]);
  const needle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));

  // Modus nach dem Wechsel kurz anzeigen
  const [label, setLabel] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLabel(northUp ? 'Norden oben' : 'Fahrtrichtung oben');
    const id = setTimeout(() => setLabel(null), 2000);
    return () => clearTimeout(id);
  }, [northUp]);

  return (
    <View style={styles.row} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: northUp }}
        accessibilityLabel={northUp ? 'Kompass, Karte genordet' : 'Kompass, Karte in Fahrtrichtung'}
        accessibilityHint={northUp ? 'Antippen dreht die Karte wieder in Fahrtrichtung' : 'Antippen nordet die Karte'}
        onPress={onToggle}
        style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: Motion.pressScale }] }]}>
        <View style={[styles.dial, northUp && styles.dialOn]}>
          <Animated.View style={needle}>
            <Svg width={28} height={28} viewBox="0 0 30 30">
              <Path d="M15 4 L19 15 L11 15 Z" fill={Colors.signal} />
              <Path d="M15 26 L19 15 L11 15 Z" fill={Colors.muted} />
            </Svg>
          </Animated.View>
        </View>
      </Pressable>
      {label && (
        <Animated.View entering={FadeIn.duration(Motion.enter)} exiting={FadeOut.duration(160)} style={styles.label} pointerEvents="none">
          <AppText style={styles.labelText}>{label}</AppText>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' },
  dial: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  dialOn: { backgroundColor: Colors.signalTint, borderWidth: 2, borderColor: Colors.signal },
  label: { height: 32, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Colors.overlay, justifyContent: 'center' },
  labelText: { fontFamily: Fonts.bold, fontSize: 15, color: Colors.text },
});
