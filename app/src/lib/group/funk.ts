/**
 * Funk in der Gruppenfahrt (Funk Konzept, Koray 10.11.) über LiveKit.
 *
 * Jede Gruppenfahrt mit ID ist ein Raum `ride-<rideId>`. Alle sind mit stummem Mikrofon verbunden;
 * gedrückt halten schaltet das Mikrofon an, loslassen wieder aus. Es spricht immer nur einer: wer drückt,
 * während ein anderer spricht, wartet und ist dran, sobald der andere loslässt (die Lead vor allen anderen).
 *
 * Ruhe (Koray 16.11., Kosten): Nach 10 Minuten ohne Sprechen trennt sich der Funk und ruht. Wer dann drückt,
 * weckt über den Kanal der Gruppe alle anderen; sein Mikrofon geht an, sobald jemand zuhört (höchstens 2,5 s).
 * LiveKit rechnet nach verbundenen Minuten, auf einer Ausfahrt wird meist nur selten gesprochen.
 *
 * Das native WebRTC Paket kommt erst mit Build 20. Ältere Builds bekommen dieselben JS Updates;
 * dort fehlt das Modul, dann ist Funk einfach nicht verfügbar statt die App abstürzen zu lassen.
 */
import { NativeModules } from 'react-native';
import { useSyncExternalStore } from 'react';

import { bbLog } from '@/lib/navigation/blackbox';
import { holdAudioSession } from '@/lib/navigation/voice';
import { supabase } from '@/lib/supabase';

import { onFunkSignal, sendFunkSignal } from './ride';

/** ruht: mehrere Versuche ohne Erfolg, die App versucht es nur noch alle zwei Minuten (Koray 14.11.) */
export type FunkStatus = 'nicht' | 'aus' | 'verbinde' | 'an' | 'getrennt' | 'fehler' | 'ruht';
export type FunkState = {
  status: FunkStatus;
  /** Ich spreche gerade (Mikrofon an) */
  talking: boolean;
  /** Ich halte gedrückt, aber ein anderer spricht noch */
  waiting: boolean;
  /** Wer gerade spricht (nicht ich), mit Anzeigename */
  speaker: { id: string; name: string } | null;
  /** Funk hören an oder aus (Teilnehmer Menü) */
  listen: boolean;
  /** Nur die Lead darf sprechen (setzt die Lead für alle) */
  onlyLead: boolean;
  error: string | null;
};

type LK = typeof import('livekit-client');
type RN = typeof import('@livekit/react-native');

/** Natives Modul vorhanden? Nur dann die Pakete laden. */
const available = !!(NativeModules as Record<string, unknown>).WebRTCModule;
let lk: LK | null = null;
let rn: RN | null = null;
if (available) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  rn = require('@livekit/react-native') as RN;
  rn.registerGlobals();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  lk = require('livekit-client') as LK;
}

let state: FunkState = { status: available ? 'aus' : 'nicht', talking: false, waiting: false, speaker: null, listen: true, onlyLead: false, error: null };
const listeners = new Set<() => void>();
function set(p: Partial<FunkState>) {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

let room: import('livekit-client').Room | null = null;
let current: string | null = null;
let isLead = false;
let wantTalk = false;
/** Funk ruht nach langer Stille: getrennt, aber die Fahrt bleibt gemerkt */
const IDLE_MS = 10 * 60 * 1000;
let asleep: { rideId: string } | null = null;
let lastVoice = Date.now();
/** Knopf gedrückt, während der Funk ruhte: nach dem Verbinden sprechen */
let holdWhileWaking = false;
let idleTimer: ReturnType<typeof setInterval> | null = null;
let offSignal: (() => void) | null = null;

function voice() {
  lastVoice = Date.now();
}

/** Ruhen: Raum schließen, Anzeige bleibt an (Drücken weckt) */
async function sleep() {
  const rideId = current;
  if (!rideId || !room || state.talking || state.speaker) return;
  bbLog('funk', ['ruht nach Stille']);
  gen += 1;
  if (retry) clearTimeout(retry);
  retry = null;
  await teardown();
  asleep = { rideId };
  set({ status: 'an', talking: false, waiting: false, speaker: null });
}

/** Aufwachen: selbst gedrückt (andere wecken) oder von einem anderen geweckt */
function wake(self: boolean) {
  const a = asleep;
  if (!a) return;
  asleep = null;
  voice();
  if (self) sendFunkSignal();
  bbLog('funk', [self ? 'weckt' : 'geweckt']);
  void connectFunk(a.rideId, isLead, false);
}

function watchIdle() {
  if (!idleTimer) {
    idleTimer = setInterval(() => {
      if (room && state.status === 'an' && !state.talking && !state.speaker && Date.now() - lastVoice > IDLE_MS) void sleep();
    }, 30000);
  }
  if (!offSignal) offSignal = onFunkSignal(() => wake(false));
}

function stopWatchIdle() {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null;
  offSignal?.();
  offSignal = null;
  asleep = null;
  holdWhileWaking = false;
}
/**
 * Von selbst wieder verbinden (12.11.): Nach einem langen Tunnel oder Funkloch gibt LiveKit auf und meldet
 * Disconnected. Bisher blieb der Funk dann für den Rest der Fahrt aus. Jetzt versuchen wir es erneut,
 * erst nach 3 s, dann 6, 12, 24 und danach alle 30 s, mit frischem Zugang.
 */
let retry: ReturnType<typeof setTimeout> | null = null;
let tries = 0;
/** Zählt jedes Trennen hoch: ein Verbindungsversuch, der danach noch läuft, bricht ab (sonst verband er
 * sich nach dem Verlassen der Gruppe wieder und das Banner blieb stehen, Koray 14.11.) */
let gen = 0;
/** Nach so vielen Fehlversuchen ruht der Funk und versucht es nur noch selten */
const QUIET_AFTER = 3;
const QUIET_MS = 2 * 60 * 1000;
function scheduleReconnect(rideId: string) {
  if (retry || current !== rideId) return;
  const quiet = tries >= QUIET_AFTER;
  const wait = quiet ? QUIET_MS : Math.min(30000, 3000 * 2 ** tries);
  tries += 1;
  if (quiet) set({ status: 'ruht', talking: false, waiting: false, speaker: null });
  const g = gen;
  retry = setTimeout(() => {
    retry = null;
    if (current !== rideId || g !== gen) return;
    current = null;
    void connectFunk(rideId, isLead, true);
  }, wait);
}

export function funkAvailable() {
  return available;
}

/** Mit dem Funk der Fahrt verbinden; mehrfach aufrufbar, verbindet nur einmal. */
export async function connectFunk(rideId: string, lead: boolean, again = false) {
  isLead = lead;
  if (!lk || !rn || current === rideId) return;
  asleep = null;
  voice();
  watchIdle();
  const g = gen;
  await teardown();
  if (g !== gen) return;
  if (!again) tries = 0;
  current = rideId;
  // beim Wiederverbinden bleibt die Anzeige auf getrennt, bis es wirklich steht; ruht er, bleibt es ruhig
  set(again ? { status: state.status === 'ruht' ? 'ruht' : 'getrennt' } : { status: 'verbinde', error: null });
  try {
    const { data, error } = await supabase.functions.invoke('livekit-token', { body: { ride: rideId } });
    if (error || !data?.token) {
      // Fehlertext der Funktion lesen (bei Status 4xx/5xx steckt er im Fehlerobjekt)
      let why = (data as { error?: string } | null)?.error ?? null;
      const ctx = (error as { context?: Response } | null)?.context;
      if (!why && ctx && typeof ctx.json === 'function') why = ((await ctx.json().catch(() => null)) as { error?: string } | null)?.error ?? null;
      throw new Error(why ?? (error instanceof Error ? error.message : 'Funk Zugang fehlgeschlagen.'));
    }
    if (current !== rideId || g !== gen) return;

    holdAudioSession(true);
    await rn.AudioSession.configureAudio({ ios: { defaultOutput: 'speaker' } });
    await rn.AudioSession.startAudioSession();

    const r = new lk.Room({ adaptiveStream: false, dynacast: false });
    room = r;
    r.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const other = speakers.find((p) => p.identity !== r.localParticipant.identity);
      if (speakers.length) voice();
      set({ speaker: other ? { id: other.identity, name: other.name || 'Fahrer' } : null });
      // Wartet jemand und der andere ist fertig: jetzt sprechen
      if (!other && wantTalk && !state.talking) void startTalking();
    });
    r.on(lk.RoomEvent.ParticipantConnected, voice);
    r.on(lk.RoomEvent.TrackSubscribed, (_t, pub) => {
      if (!state.listen) pub.setEnabled(false);
    });
    r.on(lk.RoomEvent.Reconnecting, () => room === r && set({ status: 'getrennt' }));
    r.on(lk.RoomEvent.Reconnected, () => room === r && set({ status: 'an' }));
    r.on(lk.RoomEvent.Disconnected, () => {
      // nur der aktuelle Raum zählt; ein alter Raum, den wir selbst schließen, meldet sich hier auch
      if (room !== r || current !== rideId) return;
      set({ status: 'getrennt', talking: false, waiting: false, speaker: null });
      scheduleReconnect(rideId);
    });
    r.on(lk.RoomEvent.DataReceived, (payload) => {
      try {
        const m = JSON.parse(new TextDecoder().decode(payload)) as { onlyLead?: boolean };
        if (typeof m.onlyLead === 'boolean') set({ onlyLead: m.onlyLead });
      } catch {
        /* fremde Daten ignorieren */
      }
    });
    await r.connect(data.url as string, data.token as string, { autoSubscribe: true });
    if (room !== r || g !== gen) return;
    bbLog('funk', ['an']);
    applyListen();
    tries = 0;
    set({ status: 'an', error: null });
    // Mikrofon vorbereiten (12.11.): stumm veröffentlichen, damit schon das erste Drücken sofort sendet.
    // Bisher wurde das Mikrofon erst beim ersten Drücken geöffnet und angemeldet, die ersten Worte fehlten.
    // Klappt das nicht, bleibt es beim alten Weg über setMicrophoneEnabled.
    try {
      const t = await lk.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      await t.mute();
      if (room === r) {
        await r.localParticipant.publishTrack(t, { source: lk.Track.Source.Microphone });
        bbLog('funk', ['mikro bereit']);
      } else t.stop();
    } catch (e) {
      // dann öffnet das erste Drücken das Mikrofon
      bbLog('funk', ['mikro vorbereiten', e instanceof Error ? e.message.slice(0, 200) : String(e)]);
    }
    // Geweckt durch eigenes Drücken: kurz warten, bis jemand zuhört, dann sprechen
    if (holdWhileWaking && room === r) {
      const until = Date.now() + 2500;
      while (room === r && holdWhileWaking && r.remoteParticipants.size === 0 && Date.now() < until) await new Promise((ok) => setTimeout(ok, 150));
      if (room === r && holdWhileWaking) {
        holdWhileWaking = false;
        wantTalk = true;
        void startTalking();
      }
    }
  } catch (e) {
    if (current !== rideId || g !== gen) return;
    const msg = e instanceof Error ? e.message : 'Funk nicht verfügbar.';
    bbLog('funk', ['fehler', tries, msg.slice(0, 200)]);
    // ohne Netz beim Verbinden: weiter versuchen statt aufgeben
    set({ status: state.status === 'ruht' ? 'ruht' : again ? 'getrennt' : 'fehler', error: msg });
    room = null;
    scheduleReconnect(rideId);
  }
}

export async function disconnectFunk() {
  gen += 1;
  stopWatchIdle();
  if (retry) clearTimeout(retry);
  retry = null;
  tries = 0;
  await teardown();
  set({ status: available ? 'aus' : 'nicht', talking: false, waiting: false, speaker: null, onlyLead: false });
}

/** Raum und Tonsitzung schließen, ohne den Wunsch nach Funk aufzugeben (auch vor dem Wiederverbinden) */
async function teardown() {
  wantTalk = false;
  const r = room;
  room = null;
  current = null;
  if (r) await r.disconnect().catch(() => undefined);
  if (r && rn) await rn.AudioSession.stopAudioSession().catch(() => undefined);
  holdAudioSession(false);
}

async function startTalking() {
  if (!room) return;
  voice();
  set({ talking: true, waiting: false });
  try {
    // hängt das Öffnen, nicht ewig "Du sprichst" zeigen
    await Promise.race([
      room.localParticipant.setMicrophoneEnabled(true),
      new Promise((_, no) => setTimeout(() => no(new Error('Mikrofon reagiert nicht.')), 6000)),
    ]);
    bbLog('funk', ['sendet']);
    if (!wantTalk) await stopTalking();
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Mikrofon nicht verfügbar.';
    bbLog('funk', ['sprechen fehler', msg.slice(0, 200)]);
    set({ talking: false, error: msg });
  }
}
async function stopTalking() {
  set({ talking: false, waiting: false });
  await room?.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
}

/** Funk Knopf gedrückt (true) oder losgelassen (false). */
export function pushToTalk(on: boolean) {
  wantTalk = on;
  if (asleep || holdWhileWaking) {
    holdWhileWaking = on && !(state.onlyLead && !isLead);
    if (on && asleep && holdWhileWaking) wake(true);
    return;
  }
  if (!room || state.status !== 'an') return;
  if (!on) {
    void stopTalking();
    return;
  }
  if (state.onlyLead && !isLead) {
    wantTalk = false;
    return;
  }
  // Lead spricht vor, alle anderen warten, bis der andere loslässt
  if (state.speaker && !isLead) set({ waiting: true });
  else void startTalking();
}

function applyListen() {
  if (!room) return;
  for (const p of room.remoteParticipants.values()) for (const pub of p.audioTrackPublications.values()) pub.setEnabled(state.listen);
}

/** Funk hören an oder aus (das Mikrofon bleibt davon unberührt). */
export function setFunkListen(on: boolean) {
  set({ listen: on });
  applyListen();
}

/** Lead: nur sie darf sprechen; gilt für alle im Raum. */
export function setOnlyLead(on: boolean) {
  set({ onlyLead: on });
  if (room && isLead) void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ onlyLead: on })), { reliable: true }).catch(() => undefined);
}

export function useFunk(): FunkState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
