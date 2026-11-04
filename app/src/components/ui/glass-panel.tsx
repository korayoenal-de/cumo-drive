/**
 * Fläche über der Karte: ab iOS 26 aus Liquid Glass (dunkel getönt, damit Schrift im Auto lesbar bleibt),
 * sonst die bisherige fast deckende dunkle Fläche. Bei „Transparenz reduzieren“ immer deckend.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

type GlassMod = {
  GlassView: React.ComponentType<{ style?: StyleProp<ViewStyle>; glassEffectStyle?: 'regular' | 'clear'; tintColor?: string; colorScheme?: 'dark'; children?: ReactNode }>;
  isLiquidGlassAvailable: () => boolean;
  isGlassEffectAPIAvailable?: () => boolean;
};

let glass: GlassMod | null | undefined;
function getGlass(): GlassMod | null {
  if (glass !== undefined) return glass;
  glass = null;
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-glass-effect') as GlassMod;
    if (m.isLiquidGlassAvailable() && (m.isGlassEffectAPIAvailable?.() ?? true)) glass = m;
  } catch {
    glass = null;
  }
  return glass;
}

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

export function GlassPanel({ style, fallback, tint = 'rgba(11,11,12,0.55)', children }: { style?: StyleProp<ViewStyle>; fallback: string; tint?: string; children?: ReactNode }) {
  const reduce = useReduceTransparency();
  const g = getGlass();
  if (!g || reduce) return <View style={[style, { backgroundColor: fallback }]}>{children}</View>;
  return (
    <g.GlassView style={[style, { overflow: 'hidden' }]} glassEffectStyle="regular" tintColor={tint} colorScheme="dark">
      {children}
    </g.GlassView>
  );
}
