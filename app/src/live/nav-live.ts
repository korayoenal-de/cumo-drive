/**
 * Steuert die Live Activity der Navigation: starten, bei Änderungen aktualisieren, am Ende beenden.
 * Nur iOS. Fehlt das native Modul (ältere App Version), passiert einfach nichts.
 */
import { Platform } from 'react-native';

import type { ManeuverKind } from '@/lib/navigation/types';

import type { NavActivityProps } from './NavActivity';

type Instance = { update: (p: NavActivityProps) => Promise<void>; end: (policy?: unknown, p?: NavActivityProps) => Promise<void> };
type Factory = { start: (p: NavActivityProps, url?: string) => Instance; getInstances: () => Instance[] };

let factory: Factory | null | undefined;
function getFactory(): Factory | null {
  if (factory !== undefined) return factory;
  factory = null;
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory = require('./NavActivity').default as Factory;
  } catch {
    factory = null;
  }
  return factory;
}

/** SF Symbol je Manöver (die eigenen Pfeile laufen im Widget Prozess nicht). */
export function symbolForKind(kind: ManeuverKind, exit?: number): string {
  switch (kind) {
    case 'rechts':
    case 'scharf_rechts':
      return 'arrow.turn.up.right';
    case 'links':
    case 'scharf_links':
      return 'arrow.turn.up.left';
    case 'leicht_rechts':
    case 'rechts_halten':
    case 'auffahrt':
    case 'auffahrt_rechts':
    case 'abfahrt':
    case 'abfahrt_rechts':
      return 'arrow.up.right';
    case 'leicht_links':
    case 'links_halten':
    case 'auffahrt_links':
    case 'abfahrt_links':
      return 'arrow.up.left';
    case 'einfaedeln_rechts':
    case 'einfaedeln_links':
      return 'arrow.merge';
    case 'wenden':
      return 'arrow.uturn.left';
    case 'wenden_rechts':
      return 'arrow.uturn.right';
    case 'kreisverkehr':
    case 'kreisverkehr_verlassen':
      return exit && exit <= 50 ? `${exit}.circle` : 'arrow.counterclockwise.circle';
    case 'faehre_an_bord':
    case 'faehre_verlassen':
      return 'ferry.fill';
    case 'ziel':
    case 'ziel_links':
    case 'ziel_rechts':
      return 'flag.checkered';
    case 'zwischenziel':
      return 'mappin.circle.fill';
    case 'start':
      return 'location.north.fill';
    default:
      return 'arrow.up';
  }
}

let current: Instance | null = null;
let last = '';

/** Live Activity mit neuem Stand zeigen (startet sie beim ersten Aufruf). */
export function showNavActivity(p: NavActivityProps) {
  const f = getFactory();
  if (!f) return;
  const key = JSON.stringify(p);
  if (key === last) return;
  last = key;
  try {
    if (!current) {
      // eine alte Activity aus einem früheren Start aufräumen
      for (const old of f.getInstances()) void old.end('immediate').catch(() => undefined);
      current = f.start(p, 'cumodrive://navigation');
    } else {
      void current.update(p).catch(() => undefined);
    }
  } catch {
    current = null;
  }
}

/** Live Activity beenden, zum Beispiel bei Ankunft oder Beenden. */
export function endNavActivity(final?: NavActivityProps) {
  const c = current;
  current = null;
  last = '';
  if (!c) return;
  void c.end('immediate', final).catch(() => undefined);
}
