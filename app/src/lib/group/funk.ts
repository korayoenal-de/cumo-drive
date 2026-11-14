/**
 * Funk in der Gruppenfahrt (Funk Konzept, Koray 10.11.) über LiveKit.
 *
 * Jede Gruppenfahrt mit ID ist ein Raum `ride-<rideId>`. Alle sind mit stummem Mikrofon verbunden;
 * gedrückt halten schaltet das Mikrofon an, loslassen wieder aus. Es spricht immer nur einer: wer drückt,
 * während ein anderer spricht, wartet und ist dran, sobald der andere loslässt (die Lead vor allen anderen).
 *
 * Das native WebRTC Paket kommt erst mit Build 20. Ältere Builds bekommen dieselben JS Updates;
 * dort fehlt das Modul, dann ist Funk einfach nicht verfügbar statt die App abstürzen zu lassen.
 */
import { NativeModules } from 'react-native';
import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/** gesperrt: der Organisator hat keine Mitgliedschaft, Funk gibt es dann nicht (Koray 14.11.) */
export type FunkStatus = 'nicht' | 'aus' | 'verbinde' | 'an' | 'getrennt' | 'fehler' | 'gesperrt';
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
/**
 * Von selbst wieder verbinden (12.11.): Nach einem langen Tunnel oder Funkloch gibt LiveKit auf und meldet
 * Disconnected. Bisher blieb der Funk dann für den Rest der Fahrt aus. Jetzt versuchen wir es erneut,
 * erst nach 3 s, dann 6, 12, 24 und danach alle 30 s, mit frischem Zugang.
 */
let retry: ReturnType<typeof setTimeout> | null = null;
let tries = 0;
function scheduleReconnect(rideId: string) {
  if (retry || current !== rideId) return;
  const wait = Math.min(30000, 3000 * 2 ** tries);
  tries += 1;
  retry = setTimeout(() => {
    retry = null;
    if (current !== rideId) return;
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
  await teardown();
  if (!again) tries = 0;
  current = rideId;
  // beim Wiederverbinden bleibt die Anzeige auf getrennt, bis es wirklich steht
  set(again ? { status: 'getrennt' } : { status: 'verbinde', error: null });
  try {
    const { data, error } = await supabase.functions.invoke('livekit-token', { body: { ride: rideId } });
    if ((data as { locked?: boolean } | null)?.locked) {
      if (current === rideId) set({ status: 'gesperrt', error: (data as { error?: string }).error ?? null });
      return;
    }
    if (error || !data?.token) throw new Error((data as { error?: string } | null)?.error ?? 'Funk Zugang fehlgeschlagen.');
    if (current !== rideId) return;

    await rn.AudioSession.configureAudio({ ios: { defaultOutput: 'speaker' } });
    await rn.AudioSession.startAudioSession();

    const r = new lk.Room({ adaptiveStream: false, dynacast: false });
    room = r;
    r.on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const other = speakers.find((p) => p.identity !== r.localParticipant.identity);
      set({ speaker: other ? { id: other.identity, name: other.name || 'Fahrer' } : null });
      // Wartet jemand und der andere ist fertig: jetzt sprechen
      if (!other && wantTalk && !state.talking) void startTalking();
    });
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
    if (room !== r) return;
    applyListen();
    tries = 0;
    set({ status: 'an', error: null });
    // Mikrofon vorbereiten (12.11.): stumm veröffentlichen, damit schon das erste Drücken sofort sendet.
    // Bisher wurde das Mikrofon erst beim ersten Drücken geöffnet und angemeldet, die ersten Worte fehlten.
    // Klappt das nicht, bleibt es beim alten Weg über setMicrophoneEnabled.
    try {
      const t = await lk.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      await t.mute();
      if (room === r) await r.localParticipant.publishTrack(t, { source: lk.Track.Source.Microphone });
      else t.stop();
    } catch {
      /* dann öffnet das erste Drücken das Mikrofon */
    }
  } catch (e) {
    if (current !== rideId) return;
    // ohne Netz beim Verbinden: weiter versuchen statt aufgeben
    set({ status: again ? 'getrennt' : 'fehler', error: e instanceof Error ? e.message : 'Funk nicht verfügbar.' });
    room = null;
    scheduleReconnect(rideId);
  }
}

export async function disconnectFunk() {
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
}

async function startTalking() {
  if (!room) return;
  set({ talking: true, waiting: false });
  try {
    await room.localParticipant.setMicrophoneEnabled(true);
    if (!wantTalk) await stopTalking();
  } catch (e) {
    set({ talking: false, error: e instanceof Error ? e.message : 'Mikrofon nicht verfügbar.' });
  }
}
async function stopTalking() {
  set({ talking: false, waiting: false });
  await room?.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
}

/** Funk Knopf gedrückt (true) oder losgelassen (false). */
export function pushToTalk(on: boolean) {
  wantTalk = on;
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
