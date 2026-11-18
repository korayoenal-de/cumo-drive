/**
 * Fahrzeug vor dem Start (Koray 12.11., Konzept B): eine Zeile mit dem aktuellen Auto in seiner Wagenfarbe,
 * der Pfeil Knopf klappt die anderen am Ort auf, Antippen wählt und klappt zu. Bei nur einem Auto ohne Wechseln.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { CarSprite, carLookFor, frameFor } from '@/components/map/car-sprite';
import { EASE_OUT, SOFT_LAYOUT } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type, Pressed } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { selectVehicle, vehicleName, type Vehicle } from '@/lib/vehicle';
import { t } from '@/i18n';

function Car({ v, size }: { v: Vehicle; size: number }) {
  const look = carLookFor(v);
  return (
    <View style={[styles.car, { width: size * 1.2, height: size * 0.8 }]}>
      {look ? <CarSprite look={look} frame={frameFor(215)} size={size} /> : <SymbolView weight="semibold" name="car.side.fill" size={size * 0.55} tintColor={Colors.muted} />}
    </View>
  );
}

/**
 * Die zwei Pfeile drehen sich zum X und zurück (Koray 18.11., Regel „Das Symbol dreht sich zum X“): beide Symbole
 * liegen übereinander, eine Vierteldrehung blendet vom einen ins andere.
 */
function SwapIcon({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(open ? 1 : 0, { duration: reduced ? 0 : Motion.enter, easing: EASE_OUT });
  }, [open, p, reduced]);
  const arrows = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [{ rotate: `${p.value * 90}deg` }] }));
  const cross = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ rotate: `${(p.value - 1) * 90}deg` }] }));
  return (
    <View style={styles.swap}>
      <Animated.View style={[styles.swapLayer, arrows]}>
        <SymbolView name="arrow.left.arrow.right" size={20} weight="semibold" tintColor={Colors.text} />
      </Animated.View>
      <Animated.View style={[styles.swapLayer, cross]}>
        <SymbolView name="xmark" size={20} weight="semibold" tintColor={Colors.text} />
      </Animated.View>
    </View>
  );
}

export function VehiclePick({ list, current }: { list: Vehicle[]; current: Vehicle | null }) {
  const [open, setOpen] = useState(false);
  const cur = current ?? list[0] ?? null;
  if (!cur) return null;
  const others = list.filter((v) => v.id !== cur.id);
  return (
    <Animated.View layout={SOFT_LAYOUT} style={styles.wrap}>
      <View style={styles.row}>
        <Car v={cur} size={44} />
        <View style={styles.flex}>
          <AppText variant="caption" muted>{t('Du fährst')}</AppText>
          <AppText style={styles.name} numberOfLines={1}>{vehicleName(cur) || t('Fahrzeug')}</AppText>
        </View>
        {others.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? t('Fahrzeugwahl schließen') : t('Fahrzeug wechseln')}
            onPress={() => setOpen((o) => !o)}
            hitSlop={4}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
            {/* Symbol statt Wort (Koray 18.11.): zwei Pfeile, offen das X wie beim Aufklappen (Regel 2) */}
            <SwapIcon open={open} />
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
              <AppText style={styles.optionText} numberOfLines={1}>{vehicleName(v) || t('Fahrzeug')}</AppText>
            </Pressable>
          </Animated.View>
        ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  swap: { width: 24, height: 24 },
  swapLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  wrap: { backgroundColor: Colors.surface2, borderRadius: Radius.l, padding: Spacing.m, gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  flex: { flex: 1 },
  car: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: Fonts.bold, fontSize: Type.title },
  btn: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 52 },
  optionText: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body },
  pressed: Pressed,
});
