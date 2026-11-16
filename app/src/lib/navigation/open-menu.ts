/**
 * Immer nur ein Menü offen (Koray 14.11.): Tour Menü unten und Halt Gründe oben überlagerten sich.
 * Wer sein Menü öffnet, meldet das hier; das andere klappt dann zu.
 */
import { useEffect } from 'react';

export type NavMenu = 'tour' | 'halt';
const listeners = new Set<(m: NavMenu) => void>();

export function announceMenuOpen(m: NavMenu) {
  for (const l of listeners) l(m);
}

/** close wird aufgerufen, sobald ein anderes Menü aufgeht */
export function useCloseOnOtherMenu(mine: NavMenu, close: () => void) {
  useEffect(() => {
    const l = (m: NavMenu) => {
      if (m !== mine) close();
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [mine, close]);
}
