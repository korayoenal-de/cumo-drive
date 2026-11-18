/**
 * Würfel, der einmal umkippt (Joy of Use, Leinwand „Weitere Fälle“, kleine Belohnungen): steht beim Neu würfeln vor
 * dem Titel, während die Runde lädt. Eine Vierteldrehung mit weichem Auslauf, ohne Schleife; bei „Bewegung
 * reduzieren“ steht er still.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { EASE_OUT } from '@/components/ui/motion';
import { Colors } from '@/constants/theme';

export function DiceTip() {
  const reduced = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    r.value = withDelay(120, withTiming(1, { duration: 520, easing: EASE_OUT }));
  }, [r, reduced]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 90}deg` }] }));
  return (
    <Animated.View style={st} accessibilityElementsHidden importantForAccessibility="no">
      <SymbolView name="dice" size={20} weight="semibold" tintColor={Colors.text} />
    </Animated.View>
  );
}
