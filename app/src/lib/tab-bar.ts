/**
 * Größe der Tab Leiste beim Scrollen (wie Instagram): nach unten scrollen macht sie kleiner,
 * nach oben wieder groß. Die scrollbaren Ansichten melden ihre Position über reportScroll.
 */
import { makeMutable, withSpring } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/** 0 volle Größe, 1 kompakt */
export const tabBarCompact = makeMutable(0);
let lastY = 0;

export function reportScroll(y: number) {
  const dy = y - lastY;
  lastY = y;
  if (y < 40) tabBarCompact.set(withSpring(0, Motion.snap));
  else if (dy > 6) tabBarCompact.set(withSpring(1, Motion.snap));
  else if (dy < -6) tabBarCompact.set(withSpring(0, Motion.snap));
}

/** Volle Größe, etwa beim Tabwechsel */
export function expandTabBar() {
  lastY = 0;
  tabBarCompact.set(withSpring(0, Motion.snap));
}
