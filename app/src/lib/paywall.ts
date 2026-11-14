/**
 * Paywall im Flow (Konzept Koray 14.11., Leinwand „Paywall im Flow“): keine Paywall vorab, sondern ein Blatt
 * genau dort, wo jemand an eine Grenze der kostenlosen Version stößt. Der Fall steht oben, weitere Vorteile
 * darunter, dazu ein ehrlicher Ausweg. Nach dem Kauf geht die Aktion weiter, die das Blatt ausgelöst hat.
 *
 * STUMM: Solange LIMITS_LIVE false ist (Testphase), greift keine Grenze und kein Blatt erscheint von selbst.
 * Im Prüfbereich lassen sich alle Blätter trotzdem ansehen (previewPaywall).
 *
 * Anlässe: ausserhalb (Losfahren außerhalb des Heimatgebiets), gruppe (mehr als drei Autos), funk,
 * heimat (Heimatgebiet ein zweites Mal ändern), testende (letzter Testtag), abgelaufen (Abo vorbei,
 * Ausfahrt mit mehr als drei Autos geplant).
 */
import { useSyncExternalStore } from 'react';

/** Hauptschalter der kostenlosen Version. Auf dem Server gilt dasselbe über public.limits_live(). */
export const LIMITS_LIVE = false;

export type PaywallKind = 'ausserhalb' | 'gruppe' | 'funk' | 'heimat' | 'testende' | 'abgelaufen';

/** Was die Situation konkret macht: Zahlen und Namen für Bild und Text */
export type PaywallCtx = {
  /** Fall ausserhalb: Name der Tour, Kilometer im Gebiet und draußen */
  tourName?: string;
  insideKm?: number;
  outsideKm?: number;
  /** Fall gruppe und abgelaufen: Anzahl Autos, Name der Person, die zu viel wäre */
  vehicles?: number;
  extraName?: string;
  /** Fall heimat */
  homeName?: string;
  /** Fall abgelaufen */
  rideName?: string;
  rideDate?: Date;
  expiredAt?: Date;
  /** Fall testende: der eigene Gebrauch */
  stats?: { tours: number; km: number; drives: number; curves: number };
};

/** member: gekauft oder wiederhergestellt; escape: Ausweg gewählt (etwa „Bis zur Grenze fahren“); closed: weggewischt;
 * repeat: in dieser Fahrt schon gezeigt, kein zweites Blatt (die Stelle zeigt dann nur eine kurze Zeile) */
export type PaywallResult = 'member' | 'escape' | 'escape2' | 'closed' | 'repeat';

type Open = { kind: PaywallKind; ctx: PaywallCtx; resolve: (r: PaywallResult) => void } | null;

let open: Open = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Dasselbe Blatt höchstens einmal je Fahrt (Koray 14.11.); Schlüssel etwa "ausserhalb:<tour>" */
const shown = new Set<string>();

export function usePaywall(): Open {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open,
  );
}

function show(kind: PaywallKind, ctx: PaywallCtx): Promise<PaywallResult> {
  if (open) open.resolve('closed');
  return new Promise((resolve) => {
    open = { kind, ctx, resolve };
    emit();
  });
}

export function closePaywall(r: PaywallResult) {
  const o = open;
  open = null;
  emit();
  o?.resolve(r);
}

/**
 * Blatt zeigen, wenn die Grenzen gelten. Ist dasselbe Blatt in dieser Fahrt schon gekommen, kommt es nicht
 * nochmal und das Ergebnis ist 'repeat' (die Grenze gilt trotzdem).
 */
export function askMembership(kind: PaywallKind, ctx: PaywallCtx = {}, onceKey?: string): Promise<PaywallResult> {
  if (!LIMITS_LIVE) return Promise.resolve('member');
  const key = `${kind}:${onceKey ?? ''}`;
  if (onceKey && shown.has(key)) return Promise.resolve('repeat');
  if (onceKey) shown.add(key);
  return show(kind, ctx);
}

/** Prüfbereich: jedes Blatt ansehen, auch während die Grenzen stumm sind */
export function previewPaywall(kind: PaywallKind): Promise<PaywallResult> {
  const examples: Record<PaywallKind, PaywallCtx> = {
    ausserhalb: { tourName: 'Vogesen Runde', insideKm: 34, outsideKm: 252 },
    gruppe: { vehicles: 4, extraName: 'Sandra' },
    funk: {},
    heimat: { homeName: 'Freiburg' },
    testende: { stats: { tours: 7, km: 612, drives: 4, curves: 1930 } },
    abgelaufen: { rideName: 'Schwarzwaldhochstraße', rideDate: new Date(Date.now() + 7 * 86400000), expiredAt: new Date(Date.now() - 2 * 86400000), vehicles: 5 },
  };
  return show(kind, examples[kind]);
}
