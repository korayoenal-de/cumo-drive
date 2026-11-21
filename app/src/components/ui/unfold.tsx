/**
 * Unfold: Inhalt klappt am Ort auf und zu (Regel 2 und 3), wie das Accordion im Planer, aber von außen gesteuert.
 * Die Höhe wächst und schrumpft mit EASE_OUT (Motion.enter), der Inhalt blendet mit, alles darunter rückt weich nach.
 * Beim Schließen bleibt der Inhalt stehen, bis die Fläche zu ist.
 *
 * Anlass (Koray 21.11.2026): Die Wahl Kurvig oder Schnell je Etappe ging nach dem Gleiten mit einem Schlag zu und
 * wirkte abgehackt.
 */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE_OUT } from '@/components/ui/motion';
import { Motion } from '@/constants/theme';

export function Unfold({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const h = useSharedValue(0);
  const p = useSharedValue(open ? 1 : 0);
  // beim Öffnen sofort einhängen (abgeleiteter Zustand im Rendern statt im Effekt)
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    const tm = { duration: reduced ? 0 : Motion.enter, easing: EASE_OUT };
    if (open) p.set(withTiming(1, tm));
    else p.set(withTiming(0, tm, (ok) => ok && runOnJS(setMounted)(false)));
  }, [open, reduced, p]);
  const body = useAnimatedStyle(() => ({ height: h.get() * p.get(), opacity: Math.min(1, p.get() * 1.6) }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * -8 }] }));
  if (!mounted) return null;
  return (
    <Animated.View style={[{ overflow: 'hidden' }, body]}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, inner]} onLayout={(e) => h.set(e.nativeEvent.layout.height)}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}
