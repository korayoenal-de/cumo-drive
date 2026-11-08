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

/** icon: eigenes Navigationssymbol (Bild im App Paket, etwa nav-links), symbol: SF Symbol als Ersatz */
type Update = {
  key: string; text: string; symbol: string; icon?: string; distM: number; secs: number; restKm: number; restSecs: number;
  /** Manöver danach ("Dann"), ab Build 10 */
  thenText?: string; thenSymbol?: string; thenIcon?: string;
};
type Sub = { remove: () => void };
type CarPlayModule = {
  isConnected(): Promise<boolean>;
  setTour(name: string, coords: number[][], km: number, minutes: number): Promise<void>;
  clearTour(): Promise<void>;
  startGuidance(): Promise<void>;
  update(p: Update): Promise<void>;
  stopGuidance(arrived: boolean): Promise<void>;
  alert(title: string, subtitle: string): Promise<void>;
  // ab Build 10, in älteren Builds fehlen sie (darum immer mit ?. aufrufen)
  alertImage?(title: string, subtitle: string, image: string): Promise<void>;
  setRejoin?(coords: number[][]): Promise<void>;
  camera?(lat: number, lon: number, heading: number): Promise<void>;
  setVoice?(on: boolean): Promise<void>;
  // ab Build 11
  setMapStyle?(style: string): Promise<void>;
  addListener(event: CarPlayEvent, cb: () => void): Sub;
};
type CarPlayEvent = 'onConnect' | 'onDisconnect' | 'onStart' | 'onEnd' | 'onVoice';

const native: CarPlayModule | null = Platform.OS === 'ios' ? requireOptionalNativeModule<CarPlayModule>('CumoCarPlay') : null;

export const carPlayAvailable = !!native;
/** Build mit gestricheltem Rückweg (ab Build 10) */
export const carPlayHasRejoin = !!native?.setRejoin;

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

let lastTour: (Tour & { minutes?: number }) | null = null;
/**
 * Während der Führung zeigt das Autodisplay die Navigationsroute (mit Anfahrt und Weg zurück zur
 * Tour), nicht die gespeicherte Tour. Sonst passen Linie und Ansagen nicht zusammen (Testfahrt 7.11.).
 */
let guide: { line: [number, number][]; km: number; minutes: number } | null = null;

function thin(pts: readonly (readonly [number, number])[]): number[][] {
  const step = Math.max(1, Math.ceil(pts.length / 1500));
  const out: number[][] = [];
  for (let i = 0; i < pts.length; i += step) out.push([pts[i][0], pts[i][1]]);
  const last = pts[pts.length - 1];
  if (last && (out.length === 0 || out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1])) out.push([last[0], last[1]]);
  return out;
}

function send() {
  if (!native) return;
  const tour = lastTour;
  if (!tour) return quiet(native.clearTour());
  if (guide) return quiet(native.setTour(tour.name, thin(guide.line), guide.km, guide.minutes));
  quiet(native.setTour(tour.name, linePoints(tour), tour.laenge_km, tour.minutes ?? (tour.laenge_km / 55) * 60));
}

export function carPlaySetTour(tour: (Tour & { minutes?: number }) | null) {
  lastTour = tour;
  send();
}

/** Linie der laufenden Führung; null zurück zur Tour */
export function carPlaySetGuide(line: readonly (readonly [number, number])[] | null, km = 0, minutes = 0) {
  guide = line && line.length > 1 ? { line: line.map((p) => [p[0], p[1]] as [number, number]), km, minutes } : null;
  send();
}

/** nach dem Einstecken alles neu schicken */
export function carPlayResend() {
  send();
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

/** image: Bild im App Paket, etwa fun-4 für das Logo als Pegel; ältere Builds zeigen den Hinweis ohne Bild */
export function carPlayAlert(title: string, subtitle: string, image?: string) {
  if (image && native?.alertImage) return quiet(native.alertImage(title, subtitle, image));
  quiet(native?.alert(title, subtitle));
}

/** Rückweg zur Tour gestrichelt (leer: keiner) */
export function carPlaySetRejoin(line: readonly (readonly [number, number])[] | null) {
  quiet(native?.setRejoin?.(line && line.length > 1 ? thin(line) : []));
}

/** Kamera wie in der App: Position und Fahrtrichtung */
export function carPlayCamera(p: readonly [number, number], heading: number) {
  quiet(native?.camera?.(p[0], p[1], heading));
}

/** Kartendarstellung wie in der App (standard, satellit, 3d); ältere Builds bleiben dunkel standard */
export function carPlaySetMapStyle(style: string) {
  quiet(native?.setMapStyle?.(style));
}

export function carPlaySetVoice(on: boolean) {
  quiet(native?.setVoice?.(on));
}

// "Los" auf dem Autodisplay: merken, bis die Navigation bereit ist
let pendingStart = false;
export function takeCarPlayStart(): boolean {
  const p = pendingStart;
  pendingStart = false;
  return p;
}

/** Ereignisse von CarPlay; der Rückruf darf sich ändern, ohne neu zu abonnieren. */
export function useCarPlayEvent(event: CarPlayEvent, cb: () => void) {
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
