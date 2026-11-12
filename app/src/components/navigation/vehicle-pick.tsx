/**
 * Fahrzeug vor dem Start (Koray 12.11., Konzept B): eine Zeile mit dem aktuellen Auto in seiner Wagenfarbe,
 * „Wechseln“ klappt die anderen am Ort auf, Antippen wählt und klappt zu. Bei nur einem Auto ohne Wechseln.
 */
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { CarSprite, carLookFor, frameFor } from '@/components/map/car-sprite';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { selectVehicle, vehicleName, type Vehicle } from '@/lib/vehicle';

function Car({ v, size }: { v: Vehicle; size: number }) {
  const look = carLookFor(v);
  return (
    <View style={[styles.car, { width: size * 1.2, height: size * 0.8 }]}>
      {look ? <CarSprite look={look} frame={frameFor(215)} size={size} /> : <SymbolView name="car.side.fill" size={size * 0.55} tintColor={Colors.muted} />}
    </View>
  );
}

export function VehiclePick({ list, current }: { list: Vehicle[]; current: Vehicle | null }) {
  const [open, setOpen] = useState(false);
  const cur = current ?? list[0] ?? null;
  if (!cur) return null;
  const others = list.filter((v) => v.id !== cur.id);
  return (
    <Animated.View layout={LinearTransition.springify().damping(36).stiffness(260)} style={styles.wrap}>
      <View style={styles.row}>
        <Car v={cur} size={44} />
        <View style={styles.flex}>
          <AppText variant="caption" muted>Du fährst</AppText>
          <AppText style={styles.name} numberOfLines={1}>{vehicleName(cur) || 'Fahrzeug'}</AppText>
        </View>
        {others.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? 'Fahrzeugwahl schließen' : 'Fahrzeug wechseln'}
            onPress={() => setOpen((o) => !o)}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            <AppText style={styles.btnText}>{open ? 'Fertig' : 'Wechseln'}</AppText>
          </Pressable>
        )}
      </View>
      {open &&
        others.map((v, i) => (
          <Animated.View key={v.id} entering={FadeIn.duration(Motion.enter).delay(i * 45)}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: false }}
              onPress={() => {
                haptic('rastung');
                void selectVehicle(v.id);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <Car v={v} size={36} />
              <AppText style={styles.optionText} numberOfLines={1}>{vehicleName(v) || 'Fahrzeug'}</AppText>
            </Pressable>
          </Animated.View>
        ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.surface2, borderRadius: Radius.l, padding: Spacing.m, gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  flex: { flex: 1 },
  car: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Fonts.bold, fontSize: Type.title },
  btn: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 52 },
  optionText: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body },
  pressed: { transform: [{ scale: Motion.pressScale }], opacity: 0.85 },
});
