/**
 * Eigenes Fahrzeug als Kartensymbol (Koray 9.11., Variante B1): vorgerenderte Ansichten aus 3D Modellen,
 * Platzhalter aus dem Kenney Car Kit (CC0, kenney.nl). Je Form zwei Bogen mit 37 Ansichten zu 144 px:
 * Ansicht 0 ist die Draufsicht (Front oben), 1 bis 36 schauen schräg von hinten oben (42 Grad) in
 * Schritten von 10 Grad Fahrtrichtung relativ zur Kamera. Der Lack ist eine eigene Maske und wird mit
 * tintColor gefärbt, darüber liegen Schatten, Scheiben, Lichter und Räder.
 * Erzeugt mit scratchpad/sprites (three.js), Quelle der Modelle: assets/cars/README.md.
 */
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

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
export function CarPreview({ look, size, bare }: { look: CarLook; size: number; bare?: boolean }) {
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
        <View style={bare ? styles.stageBare : styles.stage} accessible accessibilityRole="image" accessibilityLabel="Dein Auto auf der Karte, zum Drehen seitlich ziehen">
          <CarSprite look={look} frame={frameFor(heading)} size={size} />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/**
 * Formwahl als Bühne mit Leiste (Koray 9.11., Konzept B): oben das gewählte Auto groß auf einer Bühne mit
 * Bodenschatten, Name und 360° in einer Zeile darunter (nie über dem Auto), unten sechs Kacheln ohne Abstand.
 * Tippen auf die Bühne öffnet die 3D Ansicht.
 */
const STAGE_CAR = 230;
export function CarStagePicker({ look, onForm }: { look: CarLook; onForm: (f: CarForm) => void }) {
  const label = CAR_FORMS.find((f) => f.id === look.form)?.label ?? '';
  return (
    <View style={styles.picker}>
      {/* Das Auto dreht sich direkt auf der Bühne (Koray 9.11.: kein eigener 3D Knopf, kein Bodenschatten) */}
      <View style={styles.stage2}>
        <CarPreview look={look} size={STAGE_CAR} bare />
        <View style={styles.stageFoot}>
          <AppText style={styles.stageName} numberOfLines={1}>{label}</AppText>
          <AppText style={styles.stageHint}>Zum Drehen ziehen</AppText>
        </View>
      </View>
      <View style={styles.strip} accessibilityRole="radiogroup">
        {CAR_FORMS.map((f) => {
          const on = f.id === look.form;
          return (
            <Pressable key={f.id} accessibilityRole="radio" accessibilityLabel={f.label} accessibilityState={{ selected: on }} onPress={() => onForm(f.id)} style={[styles.thumb, on && styles.thumbOn]}>
              <View style={{ opacity: on ? 1 : 0.5 }}>
                <CarSprite look={{ ...look, form: f.id }} frame={frameFor(215)} size={52} />
              </View>
              {on && <View style={styles.thumbBar} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  picker: { gap: 10 },
  stage2: { borderRadius: 20, backgroundColor: Colors.surface2, overflow: 'hidden' },
  stageFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  stageName: { flex: 1, fontFamily: Fonts.display, fontSize: 20, lineHeight: 24, color: Colors.text, textTransform: 'uppercase' },
  stageHint: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  stageBare: { alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  strip: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden' },
  thumb: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1D', borderRightWidth: 1, borderRightColor: Colors.ground },
  thumbOn: { backgroundColor: '#2A2A2E' },
  thumbBar: { position: 'absolute', left: 10, right: 10, bottom: 4, height: 3, borderRadius: 2, backgroundColor: Colors.text },
  coverLabel: { textAlign: 'center', fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  stage: { alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#1F1F22', paddingVertical: 4 },
});

/** Kartensymbol für ein Fahrzeug der Garage, null für den normalen Pfeil */
export function carLookFor(v: Vehicle | null): CarLook | null {
  if (!v || v.mapSymbol === 'pfeil') return null;
  if (v.look) return v.look;
  return v.mapSymbol === 'gts997' || v.mapSymbol === 'auto' ? DEFAULT_LOOK : null;
}
