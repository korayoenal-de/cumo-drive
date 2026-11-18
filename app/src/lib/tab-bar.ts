/**
 * Größe der Tab Leiste beim Scrollen (wie Instagram): nach unten scrollen macht sie kleiner,
 * nach oben wieder groß. Die scrollbaren Ansichten melden ihre Position über reportScroll.
 */
import { makeMutable, withSpring } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/** 0 volle Größe, 1 kompakt */
export const tabBarCompact = makeMutable(0);
let lastY = 0;
/** Ziel, auf das die Leiste gerade läuft: eine neue Feder nur, wenn es sich ändert (Audit 18.11.) */
let target = 0;
const go = (to: 0 | 1) => {
  if (target === to) return;
  target = to;
  tabBarCompact.set(withSpring(to, Motion.snap));
};

export function reportScroll(y: number) {
  const dy = y - lastY;
  lastY = y;
  if (y < 40) go(0);
  else if (dy > 6) go(1);
  else if (dy < -6) go(0);
}

