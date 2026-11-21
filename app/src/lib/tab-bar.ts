/**
 * Scrollrichtung der Ansichten in den Tabs. Die scrollbaren Ansichten (Screen, MapSheet) melden ihre Position über
 * reportScroll.
 *
 * Seit 21.11.2026 (Koray): Nach unten scrollen blendet die Ausfahrt Leiste über der Tableiste aus, nach oben scrollen
 * holt sie zurück und sie bleibt stehen. Vorher lag am Ende eines Blatts der letzte Inhalt dauerhaft hinter ihr.
 * Die Tableiste selbst bleibt immer voll stehen (minimizeBehavior "never", 15.11.).
 */
import { useSyncExternalStore } from 'react';
import { makeMutable, withSpring } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/** 0 oben oder nach oben gescrollt, 1 nach unten gescrollt */
export const tabBarCompact = makeMutable(0);
let lastY = 0;
/** Ziel, auf das es gerade läuft: eine neue Feder nur, wenn es sich ändert (Audit 18.11.) */
let target = 0;
const listeners = new Set<() => void>();
const go = (to: 0 | 1) => {
  if (target === to) return;
  target = to;
  tabBarCompact.set(withSpring(to, Motion.snap));
  for (const l of listeners) l();
};

export function reportScroll(y: number) {
  const dy = y - lastY;
  lastY = y;
  if (y < 40) go(0);
  else if (dy > 6) go(1);
  else if (dy < -6) go(0);
}

/** true, solange nach unten gescrollt wurde: dann tritt die Ausfahrt Leiste zur Seite */
export function useScrolledDown(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => target === 1,
  );
}
