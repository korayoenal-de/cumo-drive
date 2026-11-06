/**
 * CarPlay: Brücke zum inline Modul CumoCarPlay (app/carplay/*.swift).
 * Die App schickt die aktive Tour (Vorschau mit "Los") und während der Führung Manöver,
 * Restweg und Highlights. CarPlay meldet "Los" und "Beenden" zurück.
 * In Builds ohne CarPlay (ältere TestFlight Builds, Web) passiert einfach nichts.
 */
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { flatten, type Tour } from './tour';

type Update = { key: string; text: string; symbol: string; distM: number; secs: number; restKm: number; restSecs: number };
type Sub = { remove: () => void };
type CarPlayModule = {
  isConnected(): Promise<boolean>;
  setTour(name: string, coords: number[][], km: number, minutes: number): Promise<void>;
  clearTour(): Promise<void>;
  startGuidance(): Promise<void>;
  update(p: Update): Promise<void>;
  stopGuidance(arrived: boolean): Promise<void>;
  alert(title: string, subtitle: string): Promise<void>;
  addListener(event: 'onConnect' | 'onDisconnect' | 'onStart' | 'onEnd', cb: () => void): Sub;
};

const native: CarPlayModule | null = Platform.OS === 'ios' ? requireOptionalNativeModule<CarPlayModule>('CumoCarPlay') : null;

export const carPlayAvailable = !!native;

const quiet = (p: Promise<unknown> | undefined) => void p?.catch(() => undefined);

/** Höchstens 1500 Punkte, das reicht für die Linie auf dem Autodisplay. */
function linePoints(tour: Tour): number[][] {
  const pts = flatten(tour).map((x) => x.p);
  const step = Math.max(1, Math.ceil(pts.length / 1500));
  const out: number[][] = [];
  for (let i = 0; i < pts.length; i += step) out.push([pts[i][0], pts[i][1]]);
  const last = pts[pts.length - 1];
  if (last && out[out.length - 1] !== last) out.push([last[0], last[1]]);
  return out;
}

export function carPlaySetTour(tour: (Tour & { minutes?: number }) | null) {
  if (!native) return;
  if (!tour) return quiet(native.clearTour());
  quiet(native.setTour(tour.name, linePoints(tour), tour.laenge_km, tour.minutes ?? (tour.laenge_km / 55) * 60));
}

export function carPlayStart() {
  quiet(native?.startGuidance());
}

export function carPlayUpdate(p: Update) {
  quiet(native?.update(p));
}

export function carPlayStop(arrived: boolean) {
  quiet(native?.stopGuidance(arrived));
}

export function carPlayAlert(title: string, subtitle: string) {
  quiet(native?.alert(title, subtitle));
}

// "Los" auf dem Autodisplay: merken, bis die Navigation bereit ist
let pendingStart = false;
export function takeCarPlayStart(): boolean {
  const p = pendingStart;
  pendingStart = false;
  return p;
}

/** Ereignisse von CarPlay; der Rückruf darf sich ändern, ohne neu zu abonnieren. */
export function useCarPlayEvent(event: 'onConnect' | 'onDisconnect' | 'onStart' | 'onEnd', cb: () => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!native) return;
    const sub = native.addListener(event, () => ref.current());
    return () => sub.remove();
  }, [event]);
}

/** Für das Layout: "Los" merken, damit die Navigation nach dem Öffnen sofort startet. */
export function markCarPlayStart() {
  pendingStart = true;
}
