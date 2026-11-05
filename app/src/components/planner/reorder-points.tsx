/**
 * Reihenfolge der Punkte per Drag and Drop: kurz gedrückt halten hebt die Zeile an (sie wird etwas
 * größer und bekommt einen Schatten), dann ziehen; die anderen Zeilen weichen mit einer Feder aus.
 * Beim Loslassen rastet die Zeile ein und die neue Reihenfolge wird geplant. Der erste Punkt ist der
 * Start, der letzte das Ziel, so lassen sich auch Start und Ziel tauschen.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Motion, Radius, Spacing } from '@/constants/theme';

const ROW = 60;
const GAP = 8;
const STEP = ROW + GAP;

export type ReorderItem = { key: string; label: string };

export function ReorderPoints({ items, onReorder }: { items: ReorderItem[]; onReorder: (order: number[]) => void }) {
  // Position je Zeile (Index in der Liste), als ein gemeinsamer Wert, damit alle Zeilen ihn sehen
  const order = useSharedValue<number[]>(items.map((_, i) => i));
  const active = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const keyList = items.map((x) => x.key).join('|');
  // neue Punkte von außen: Reihenfolge zurücksetzen
  useEffect(() => {
    order.set(keyList.split('|').map((_, i) => i));
  }, [keyList, order]);

  return (
    <View style={{ height: items.length * STEP - GAP }} accessibilityLabel="Reihenfolge der Punkte, gedrückt halten und ziehen">
      {items.map((it, i) => (
        <Row key={it.key} index={i} count={items.length} item={it} order={order} active={active} dragY={dragY} onDrop={onReorder} />
      ))}
    </View>
  );
}

function Row({
  index,
  count,
  item,
  order,
  active,
  dragY,
  onDrop,
}: {
  index: number;
  count: number;
  item: ReorderItem;
  order: SharedValue<number[]>;
  active: SharedValue<number>;
  dragY: SharedValue<number>;
  onDrop: (order: number[]) => void;
}) {
  const startSlot = useSharedValue(0);
  const lift = useSharedValue(0);

  const slot = useDerivedValue(() => order.get().indexOf(index));

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      active.set(index);
      startSlot.set(slot.get());
      dragY.set(0);
      lift.set(withSpring(1, Motion.press));
    })
    .onUpdate((e) => {
      dragY.set(e.translationY);
      const target = Math.max(0, Math.min(count - 1, Math.round(startSlot.get() + e.translationY / STEP)));
      const cur = order.get();
      const from = cur.indexOf(index);
      if (target !== from) {
        const next = [...cur];
        next.splice(from, 1);
        next.splice(target, 0, index);
        order.set(next);
      }
    })
    .onEnd(() => {
      const changed = order.get().some((v, i) => v !== i);
      if (changed) runOnJS(onDrop)(order.get());
    })
    .onFinalize(() => {
      lift.set(withSpring(0, Motion.snap));
      active.set(-1);
      dragY.set(0);
    });

  const style = useAnimatedStyle(() => {
    const dragging = active.get() === index;
    const y = dragging ? startSlot.get() * STEP + dragY.get() : withSpring(slot.get() * STEP, Motion.snap);
    return {
      transform: [{ translateY: y }, { scale: 1 + lift.get() * 0.03 }],
      zIndex: dragging ? 10 : 1,
      shadowOpacity: withTiming(dragging ? 0.45 : 0, { duration: 150 }),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.row, style]}>
        <SlotBadge slot={slot} count={count} />
        <AppText variant="title" numberOfLines={1} style={styles.flex}>
          {item.label}
        </AppText>
        <SymbolView name="line.3.horizontal" size={18} tintColor={Colors.muted} weight="medium" />
      </Animated.View>
    </GestureDetector>
  );
}

/** Rolle der Zeile nach ihrer aktuellen Position: Start, Zahl oder Ziel. */
function SlotBadge({ slot, count }: { slot: SharedValue<number>; count: number }) {
  const startOn = useAnimatedStyle(() => ({ opacity: slot.get() === 0 ? 1 : 0 }));
  const zielOn = useAnimatedStyle(() => ({ opacity: slot.get() === count - 1 ? 1 : 0 }));
  const viaOn = useAnimatedStyle(() => ({ opacity: slot.get() > 0 && slot.get() < count - 1 ? 1 : 0 }));
  return (
    <View style={styles.badge}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, startOn]}>
        <View style={styles.startDot} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, zielOn]}>
        <SymbolView name="flag.fill" size={16} tintColor={Colors.signal} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, viaOn]}>
        <View style={styles.viaDot} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    paddingHorizontal: Spacing.l,
    borderRadius: Radius.l,
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  badge: { width: 28, height: 28 },
  startDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 5, borderColor: Colors.text },
  viaDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.muted },
});
