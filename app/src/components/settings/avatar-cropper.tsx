/**
 * Ausschnitt für das Profilfoto im Kreis (Koray 13.11.): Bild mit zwei Fingern vergrößern und mit einem Finger
 * verschieben, der Kreis zeigt genau, was andere sehen. Das Bild füllt den Kreis immer ganz aus, man kann es
 * nicht so weit schieben, dass ein Rand sichtbar wird. Fertig schneidet in Bildpixeln zu (lib/avatars).
 * Die Gesten laufen auf dem UI Thread (Design Prinzip: der Finger führt).
 */
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect, Circle } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import type { Crop, Picked } from '@/lib/avatars';

const MAX_ZOOM = 5;

export function AvatarCropper({ photo, onCancel, onDone }: { photo: Picked | null; onCancel: () => void; onDone: (crop: Crop) => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const D = Math.min(W - Spacing.l * 2, 360);
  const w = photo?.width || 1;
  const h = photo?.height || 1;
  // Grundmaß: das Bild bedeckt den Kreis gerade ganz
  const base = D / Math.min(w, h);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Verschiebung so begrenzen, dass der Kreis immer im Bild liegt
  const clamp = (v: number, s: number, side: number) => {
    'worklet';
    const max = Math.max(0, (side * base * s - D) / 2);
    return Math.min(max, Math.max(-max, v));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.set(scale.get());
    })
    .onUpdate((e) => {
      const s = Math.min(MAX_ZOOM, Math.max(1, startScale.get() * e.scale));
      scale.set(s);
      tx.set(clamp(tx.get(), s, w));
      ty.set(clamp(ty.get(), s, h));
    });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.set(tx.get());
      startY.set(ty.get());
    })
    .onUpdate((e) => {
      tx.set(clamp(startX.get() + e.translationX, scale.get(), w));
      ty.set(clamp(startY.get() + e.translationY, scale.get(), h));
    });
  // Doppeltipp: zurück auf ganz
  const reset = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.set(withTiming(1, { duration: 220 }));
      tx.set(withTiming(0, { duration: 220 }));
      ty.set(withTiming(0, { duration: 220 }));
    });
  const gesture = Gesture.Simultaneous(pinch, pan, reset);

  const img = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  const finish = (s: number, x: number, y: number) => {
    const S = base * s;
    const size = Math.min(w, h, D / S);
    const cx = w / 2 - x / S;
    const cy = h / 2 - y / S;
    const originX = Math.round(Math.min(w - size, Math.max(0, cx - size / 2)));
    const originY = Math.round(Math.min(h - size, Math.max(0, cy - size / 2)));
    onDone({ originX, originY, width: Math.floor(size), height: Math.floor(size) });
  };

  const top = (H - D) / 2;
  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={gesture}>
          <View style={styles.stage} accessible accessibilityLabel="Ausschnitt für dein Profilfoto. Mit zwei Fingern vergrößern, mit einem verschieben.">
            {photo ? (
              <Animated.View style={[{ position: 'absolute', left: (W - w * base) / 2, top: top + (D - h * base) / 2, width: w * base, height: h * base }, img]}>
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="fill" />
              </Animated.View>
            ) : null}
            {/* außerhalb des Kreises abgedunkelt, der Kreis selbst klar */}
            <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <Mask id="loch">
                  <Rect x={0} y={0} width={W} height={H} fill="white" />
                  <Circle cx={W / 2} cy={top + D / 2} r={D / 2} fill="black" />
                </Mask>
              </Defs>
              <Rect x={0} y={0} width={W} height={H} fill="rgba(11,11,12,0.72)" mask="url(#loch)" />
              <Circle cx={W / 2} cy={top + D / 2} r={D / 2} fill="none" stroke="rgba(244,244,242,0.5)" strokeWidth={1.5} />
            </Svg>
          </View>
        </GestureDetector>
        <View style={[styles.head, { paddingTop: insets.top + Spacing.m }]} pointerEvents="none">
          <AppText style={styles.title}>Ausschnitt wählen</AppText>
          <AppText variant="caption" muted>
            Mit zwei Fingern vergrößern, mit einem verschieben.
          </AppText>
        </View>
        <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.l }]}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}>
            <AppText style={styles.btnText}>Abbrechen</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => finish(scale.get(), tx.get(), ty.get())}
            style={({ pressed }) => [styles.btn, styles.btnMain, pressed && styles.pressed]}>
            <AppText style={[styles.btnText, styles.btnMainText]}>Fertig</AppText>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  stage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  head: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.l },
  title: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: Spacing.m, paddingHorizontal: Spacing.l },
  btn: { flex: 1, height: 56, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnQuiet: { backgroundColor: Colors.surface },
  btnMain: { backgroundColor: Colors.signal },
  btnText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  btnMainText: { color: Colors.onSignal },
  pressed: { opacity: 0.85 },
});
