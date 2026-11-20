/**
 * Chip: kleine Auswahltaste als Pille, aktiv weiß.
 *
 * Gleitende Auswahl (Koray 17.11., Leinwand „Gleitende Auswahl“, Variante Gleiten): in einer ChipRow gibt es eine
 * einzige weiße Fläche, sie gleitet zur neuen Wahl (Motion.enter, EASE_OUT, ohne Feder) wie die Linse der
 * Tableiste und die Leiste oben in der Community. Die grauen Flächen zeichnet die Reihe darunter, die Chips selbst
 * sind dann durchsichtig, damit die weiße Fläche zwischen Grund und Schrift liegt. Außerhalb einer ChipRow (Gründe
 * zum Ankreuzen, umgebrochen) wechselt ein Chip wie bisher ohne Bewegung.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE_OUT } from '@/components/ui/motion';
import { haptic } from '@/lib/haptics';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type, Pressed } from '@/constants/theme';

type Box = { x: number; y: number; w: number; bg: string };
type RowCtx = { report: (id: string, box: Box | null, active: boolean) => void };
const ChipRowContext = createContext<RowCtx | null>(null);

/** onSurface: der Chip liegt auf einer Surface Karte und bekommt deshalb die hellere Füllung. */
export function Chip({
  label, active, onPress, onSurface,
}: { label: string; active: boolean; onPress: () => void; onSurface?: boolean }) {
  const row = useContext(ChipRowContext);
  const id = useId();
  const box = useRef<Box | null>(null);
  const bg = onSurface ? Colors.surface2 : Colors.surface;
  // Schrift wird dunkel, wenn die Fläche ankommt (nicht schon beim Losgleiten)
  const [arrived, setArrived] = useState(active);
  useEffect(() => {
    row?.report(id, box.current, active);
    const t = setTimeout(() => setArrived(active), active && row ? Motion.enter / 2 : 0);
    return () => clearTimeout(t);
  }, [active, row, id]);
  const dark = row ? active && arrived : active;
  const onLayout = (e: LayoutChangeEvent) => {
    const { x, y, width } = e.nativeEvent.layout;
    box.current = { x, y, w: width, bg };
    row?.report(id, box.current, active);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => {
        // Wechsel der Auswahl rastet ein wie ein iOS Picker (Audit 20.11.2026: Haptik im Baustein statt an jeder Stelle)
        if (!active) haptic('rastung');
        onPress();
      }}
      onLayout={onLayout}
      // gedrückt wie alle Tasten (Regel Druck)
      style={({ pressed }) => [styles.chip, row ? styles.clear : active ? styles.on : { backgroundColor: bg }, pressed && styles.pressed]}>
      <AppText style={[styles.label, dark && styles.labelOn]}>{label}</AppText>
    </Pressable>
  );
}

/**
 * Reihe von Auswahl Chips, die seitlich wischt statt umzubrechen (Koray 15.11., W3). Läuft bis an den Rand
 * der Fläche: bleed ist der Innenabstand des Containers (Blatt Spacing.xl, Karte Spacing.l).
 * Gründe zum Ankreuzen in Bewertungen und Meldungen bleiben umgebrochen, dort soll man alles sehen.
 */
export function ChipRow({ children, bleed = Spacing.xl }: { children: ReactNode; bleed?: number }) {
  const { ctx, layer } = useSlide();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ marginHorizontal: -bleed, flexGrow: 0 }}
      contentContainerStyle={[styles.row, { paddingHorizontal: bleed }]}>
      {layer}
      <ChipRowContext.Provider value={ctx}>{children}</ChipRowContext.Provider>
    </ScrollView>
  );
}

/**
 * Umbrechende Gruppe für EINE Wahl (Strecke oder Fahrzeit, Meldegrund, Bereich; Koray 18.11.): dieselbe gleitende
 * Fläche wie in der ChipRow. Gründe zum Ankreuzen mit mehreren Treffern (Bewertung) bleiben einzelne Chips.
 */
export function ChipGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { ctx, layer } = useSlide();
  return (
    <View style={[styles.group, style]}>
      {layer}
      <ChipRowContext.Provider value={ctx}>{children}</ChipRowContext.Provider>
    </View>
  );
}

/** Die gleitende weiße Fläche: unten die grauen Flächen, darüber die weiße, oben die Chips mit ihrer Schrift */
function useSlide() {
  const reduced = useReducedMotion();
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const activeId = useRef<string | null>(null);
  const known = useRef<Record<string, Box>>({});
  const on = useRef<Record<string, boolean>>({});
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);
  const [ctx] = useState<RowCtx>(() => ({
    report: (id, box, active) => {
      if (box) {
        const old = known.current[id];
        if (!old || old.x !== box.x || old.y !== box.y || old.w !== box.w || old.bg !== box.bg) {
          known.current = { ...known.current, [id]: box };
          setBoxes(known.current);
        }
      }
      on.current[id] = active;
      if (active) activeId.current = id;
      else if (activeId.current === id) {
        // abgewählt ohne neue Wahl (Chip zum Abwählen): Fläche weg, sobald klar ist, dass keine andere kam
        setTimeout(() => {
          if (activeId.current === id && !on.current[id]) {
            activeId.current = null;
            placed.current = false;
            w.value = 0;
          }
        }, 0);
        return;
      }
      const b = activeId.current ? known.current[activeId.current] : undefined;
      if (!b) return;
      if (!placed.current || reduced) {
        x.value = b.x;
        y.value = b.y;
        w.value = b.w;
        placed.current = true;
      } else {
        const tm = { duration: Motion.enter, easing: EASE_OUT };
        x.value = withTiming(b.x, tm);
        y.value = withTiming(b.y, tm);
        w.value = withTiming(b.w, tm);
      }
    },
  }));
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }], width: w.value, opacity: w.value > 0 ? 1 : 0 }));
  const layer = (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Object.entries(boxes).map(([k, b]) => (
        <View key={k} style={[styles.under, { left: b.x, top: b.y, width: b.w, backgroundColor: b.bg }]} />
      ))}
      <Animated.View style={[styles.under, styles.on, { left: 0, top: 0 }, pill]} />
    </View>
  );
  return { ctx, layer };
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.s },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  chip: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, justifyContent: 'center' },
  // Aktiv weiß wie die Reiter der Suche; Orange bleibt der Hauptaktion vorbehalten (Koray 9.11.)
  on: { backgroundColor: Colors.text },
  clear: { backgroundColor: 'transparent' },
  under: { position: 'absolute', height: Size.chip, borderRadius: Radius.pill },
  pressed: Pressed,
  label: { fontSize: Type.body, fontFamily: Fonts.semibold },
  labelOn: { color: Colors.ground, fontFamily: Fonts.bold },
});
