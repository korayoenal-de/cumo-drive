/**
 * Eigenes Fahrzeug als Kartensymbol (Koray 9.11., Variante B1): vorgerenderte Ansichten aus 3D Modellen,
 * Platzhalter aus dem Kenney Car Kit (CC0, kenney.nl). Je Form zwei Bogen mit 37 Ansichten zu 144 px:
 * Ansicht 0 ist die Draufsicht (Front oben), 1 bis 36 schauen schräg von hinten oben (42 Grad) in
 * Schritten von 10 Grad Fahrtrichtung relativ zur Kamera. Der Lack ist eine eigene Maske und wird mit
 * tintColor gefärbt, darüber liegen Schatten, Scheiben, Lichter und Räder.
 * Erzeugt mit scratchpad/sprites (three.js), Quelle der Modelle: assets/cars/README.md.
 */
import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Type } from '@/constants/theme';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Vehicle } from '@/lib/vehicle';

export type CarForm = 'coupe' | 'coupe-fluegel' | 'cabrio' | 'fastback' | 'limousine' | 'gelaende';
export type CarLook = { form: CarForm; color: string };

export const CAR_FORMS: { id: CarForm; label: string }[] = [
  { id: 'coupe', label: 'Coupé' },
  { id: 'coupe-fluegel', label: 'Coupé mit Flügel' },
  { id: 'cabrio', label: 'Cabrio' },
  { id: 'fastback', label: 'Fastback' },
  { id: 'limousine', label: 'Limousine' },
  { id: 'gelaende', label: 'Geländewagen' },
];

export const CAR_COLORS: { id: string; label: string }[] = [
  { id: '#C4161C', label: 'Rot' },
  { id: '#E2461C', label: 'Orange' },
  { id: '#F2C230', label: 'Gelb' },
  { id: '#2F7D4F', label: 'Grün' },
  { id: '#2457C5', label: 'Blau' },
  { id: '#B9BDC2', label: 'Silber' },
  { id: '#F1F1EE', label: 'Weiß' },
  { id: '#26272A', label: 'Schwarz' },
];

export const DEFAULT_LOOK: CarLook = { form: 'coupe', color: '#C4161C' };

type Sheet = { o: number; m: number; ol: number; ml: number };
/** Je Form ein Bogen für die Karte (144 px je Ansicht) und einer für die Vorschau in der Garage (288 px) */
const SHEETS: Record<CarForm, Sheet> = {
  coupe: { o: require('@/assets/cars/coupe-o.png'), m: require('@/assets/cars/coupe-m.png'), ol: require('@/assets/cars/coupe-o-l.png'), ml: require('@/assets/cars/coupe-m-l.png') },
  'coupe-fluegel': { o: require('@/assets/cars/sedan-sports-o.png'), m: require('@/assets/cars/sedan-sports-m.png'), ol: require('@/assets/cars/sedan-sports-o-l.png'), ml: require('@/assets/cars/sedan-sports-m-l.png') },
  cabrio: { o: require('@/assets/cars/cabrio-o.png'), m: require('@/assets/cars/cabrio-m.png'), ol: require('@/assets/cars/cabrio-o-l.png'), ml: require('@/assets/cars/cabrio-m-l.png') },
  fastback: { o: require('@/assets/cars/hatchback-sports-o.png'), m: require('@/assets/cars/hatchback-sports-m.png'), ol: require('@/assets/cars/hatchback-sports-o-l.png'), ml: require('@/assets/cars/hatchback-sports-m-l.png') },
  limousine: { o: require('@/assets/cars/sedan-o.png'), m: require('@/assets/cars/sedan-m.png'), ol: require('@/assets/cars/sedan-o-l.png'), ml: require('@/assets/cars/sedan-m-l.png') },
  gelaende: { o: require('@/assets/cars/suv-o.png'), m: require('@/assets/cars/suv-m.png'), ol: require('@/assets/cars/suv-o-l.png'), ml: require('@/assets/cars/suv-m-l.png') },
};

/** Ansicht für die Fahrtrichtung relativ zur Kamera in Grad (0 = von hinten, Auto fährt nach oben) */
export const frameFor = (relHeading: number) => 1 + (Math.round((((relHeading % 360) + 360) % 360) / 10) % 36);
export const TOP_FRAME = 0;

/** Ein Bild aus dem Bogen: Ausschnitt per overflow, Lack gefärbt, Details darüber */
export function CarSprite({ look, frame, size, rotation }: { look: CarLook; frame: number; size: number; rotation?: number }) {
  const sheet = SHEETS[look.form] ?? SHEETS.coupe;
  const col = frame % 8;
  const row = Math.floor(frame / 8);
  const img = { position: 'absolute' as const, width: size * 8, height: size * 5, left: -col * size, top: -row * size };
  return (
    <View style={[styles.box, { width: size, height: size }, rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null]} pointerEvents="none">
      {/* ab 80 pt der scharfe Bogen (Vorschau), auf der Karte der kleine */}
      <Image source={size > 80 ? sheet.ml : sheet.m} style={[img, { tintColor: look.color }]} fadeDuration={0} />
      <Image source={size > 80 ? sheet.ol : sheet.o} style={img} fadeDuration={0} />
    </View>
  );
}

/** Vorschau in der Garage: zum Drehen seitlich ziehen */
export function CarPreview({ look, size }: { look: CarLook; size: number }) {
  const [heading, setHeading] = useState(215);
  const [base, setBase] = useState(215);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart(() => setBase(heading))
    .onUpdate((e) => setHeading(base - e.translationX * 0.9));
  return (
    <GestureHandlerRootView>
      <GestureDetector gesture={pan}>
        <View style={styles.stage} accessible accessibilityRole="image" accessibilityLabel="Dein Auto auf der Karte, zum Drehen seitlich ziehen">
          <CarSprite look={look} frame={frameFor(heading)} size={size} />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/**
 * Formwahl als leicht dreidimensionaler Cover Swipe (Koray 9.11.): die gewählte Form groß in der Mitte,
 * die Nachbarn kleiner, gedreht und blasser. Wischen wählt, Tippen auf einen Nachbarn auch.
 */
const ITEM = 170;
export function CarCoverFlow({ look, onForm }: { look: CarLook; onForm: (f: CarForm) => void }) {
  const win = useWindowDimensions();
  const [w, setW] = useState(win.width - 72);
  const x = useSharedValue(0);
  const idx = Math.max(0, CAR_FORMS.findIndex((f) => f.id === look.form));
  const [shown, setShown] = useState(idx);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  const pad = Math.max(0, (w - ITEM) / 2);
  const settle = (offset: number) => {
    const i = Math.max(0, Math.min(CAR_FORMS.length - 1, Math.round(offset / ITEM)));
    setShown(i);
    if (CAR_FORMS[i].id !== look.form) onForm(CAR_FORMS[i].id);
  };
  return (
    <View style={styles.cover} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        contentOffset={{ x: idx * ITEM, y: 0 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
        contentContainerStyle={{ paddingHorizontal: pad }}
        accessibilityRole="adjustable"
        accessibilityLabel={`Form: ${CAR_FORMS[shown]?.label}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = Math.max(0, Math.min(CAR_FORMS.length - 1, shown + (e.nativeEvent.actionName === 'increment' ? 1 : -1)));
          ref.current?.scrollTo({ x: next * ITEM, animated: true });
          settle(next * ITEM);
        }}>
        {CAR_FORMS.map((f, i) => (
          <CoverItem key={f.id} i={i} x={x} onPress={() => { ref.current?.scrollTo({ x: i * ITEM, animated: true }); settle(i * ITEM); }}>
            <CarSprite look={{ ...look, form: f.id }} frame={frameFor(215)} size={ITEM} />
          </CoverItem>
        ))}
      </Animated.ScrollView>
      <AppText style={styles.coverLabel}>{CAR_FORMS[shown]?.label}</AppText>
    </View>
  );
}

function CoverItem({ i, x, onPress, children }: { i: number; x: SharedValue<number>; onPress: () => void; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const r = [(i - 1) * ITEM, i * ITEM, (i + 1) * ITEM];
    return {
      opacity: interpolate(x.value, r, [0.45, 1, 0.45], 'clamp'),
      transform: [
        { perspective: 600 },
        { scale: interpolate(x.value, r, [0.7, 1, 0.7], 'clamp') },
        { rotateY: `${interpolate(x.value, r, [38, 0, -38], 'clamp')}deg` },
      ],
    };
  });
  return (
    <Pressable onPress={onPress} accessible={false}>
      <Animated.View style={[{ width: ITEM, height: ITEM }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  cover: { borderRadius: 14, backgroundColor: '#1F1F22', paddingTop: 8, paddingBottom: 14, gap: 4, alignItems: 'stretch' },
  coverLabel: { textAlign: 'center', fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  stage: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#1F1F22', paddingVertical: 4 },
});

/** Kartensymbol für ein Fahrzeug der Garage, null für den normalen Pfeil */
export function carLookFor(v: Vehicle | null): CarLook | null {
  if (!v || v.mapSymbol === 'pfeil') return null;
  if (v.look) return v.look;
  return v.mapSymbol === 'gts997' || v.mapSymbol === 'auto' ? DEFAULT_LOOK : null;
}
