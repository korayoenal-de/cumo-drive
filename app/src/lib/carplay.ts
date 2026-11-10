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
  // ab Build 14
  setMenu?(skipLabel: string, paused: boolean): Promise<void>;
  setGroup?(list: GroupPin[]): Promise<void>;
  hint?(title: string, subtitle: string): Promise<void>;
  askRating?(): Promise<void>;
  // ab Build 16: Start im Auto ohne iPhone (Meine Touren, Schnelle Runde)
  setLibrary?(list: CarTourItem[]): Promise<void>;
  endPlanning?(message: string): Promise<void>;
  addListener(event: CarPlayEvent, cb: (e: CarPlayPayload) => void): Sub;
};
type CarPlayEvent =
  | 'onConnect' | 'onDisconnect' | 'onStart' | 'onEnd' | 'onVoice' | 'onSkip' | 'onPause' | 'onMapStyle' | 'onRate'
  | 'onPickTour' | 'onRoundTrip' | 'onRoundCancel';
/** Ereignisse, die es erst ab Build 16 gibt (ältere Builds kennen sie nicht) */
const PICKER_EVENTS: readonly CarPlayEvent[] = ['onPickTour', 'onRoundTrip', 'onRoundCancel'];
/**
 * Nutzdaten der Ereignisse ab Build 14: onPause { on }, onMapStyle { style }, onRate { score };
 * ab Build 16: onPickTour { id }, onRoundTrip { km }
 */
export type CarPlayPayload = { on?: boolean; style?: string; score?: number; id?: string; km?: number };
/** Eintrag der Liste Meine Touren im Auto: fun ist die Stufe 1 bis 5 (Logo als Pegel), 0 ohne Wert */
export type CarTourItem = { id: string; name: string; detail: string; fun: number };
export type GroupPin = { id: string; name: string; lat: number; lon: number; detail?: string };

const native: CarPlayModule | null = Platform.OS === 'ios' ? requireOptionalNativeModule<CarPlayModule>('CumoCarPlay') : null;

export const carPlayAvailable = !!native;
/** Build mit gestricheltem Rückweg (ab Build 10) */
export const carPlayHasRejoin = !!native?.setRejoin;
/** ab Build 13: die Karte im Auto blendet das gefahrene Stück selbst aus, die Linie geht nur einmal hinüber */
export const carPlayTrims = !!(native as { trimsRoute?: boolean } | null)?.trimsRoute;
/** ab Build 16: das Autodisplay bietet Meine Touren und Schnelle Runde an */
export const carPlayHasPicker = !!native?.setLibrary;

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

/** Menü Mehr im Auto: Zwischenziel überspringen (leer: keins) und Pause (ab Build 14) */
export function carPlaySetMenu(skipLabel: string, paused: boolean) {
  quiet(native?.setMenu?.(skipLabel, paused));
}

/** Andere Teilnehmer der Gruppenfahrt als Marker und Liste (ab Build 14) */
export function carPlaySetGroup(list: GroupPin[]) {
  quiet(native?.setGroup?.(list));
}

/** Bremshinweis als kurzer Hinweis (ab Build 14; ältere Builds zeigen nichts, die Ansage reicht) */
export function carPlayHint(title: string, subtitle: string) {
  quiet(native?.hint?.(title, subtitle));
}

/** Nach der Ankunft: Bewertung in drei Stufen auf dem Autodisplay (ab Build 14) */
export function carPlayAskRating() {
  quiet(native?.askRating?.());
}

/** Gespeicherte Touren fürs Autodisplay, neueste zuerst (ab Build 16) */
export function carPlaySetLibrary(list: CarTourItem[]) {
  quiet(native?.setLibrary?.(list));
}

/** Schnelle Runde fertig (leer) oder gescheitert (kurzer Grund fürs Autodisplay) (ab Build 16) */
export function carPlayEndPlanning(message: string) {
  quiet(native?.endPlanning?.(message));
}

// "Los" auf dem Autodisplay: merken, bis die Navigation bereit ist
let pendingStart = false;
export function takeCarPlayStart(): boolean {
  const p = pendingStart;
  pendingStart = false;
  return p;
}

/** Ereignisse von CarPlay; der Rückruf darf sich ändern, ohne neu zu abonnieren. */
export function useCarPlayEvent(event: CarPlayEvent, cb: (e: CarPlayPayload) => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!native) return;
    if (PICKER_EVENTS.includes(event) && !native.setLibrary) return;
    const sub = native.addListener(event, (e) => ref.current(e ?? {}));
    return () => sub.remove();
  }, [event]);
}

/** Für das Layout: "Los" merken, damit die Navigation nach dem Öffnen sofort startet. */
export function markCarPlayStart() {
  pendingStart = true;
}
