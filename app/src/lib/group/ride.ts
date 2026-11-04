/**
 * Gruppenfahrt über Supabase Realtime, ohne Konto: Wer den Fahrtcode kennt, ist dabei.
 *
 * Kanal `ride-<code>`:
 * * Presence: wer dabei ist (Name, Auto, Rolle).
 * * Broadcast `pos`: Position, Richtung, Tempo, etwa alle 3 Sekunden oder nach 25 m.
 * * Broadcast `msg`: Kurznachrichten wie „Bitte warten“ oder „Tankstopp“ (Vorstufe zum Funk).
 * * Broadcast `tour`: Die Lead teilt die Tour als Übergabe Code, Mitfahrer laden sie.
 *
 * Der Zustand ist ein Singleton, damit die Fahrt beim Wechsel zwischen Tabs und Navigation bleibt.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';

import { supabase } from '../supabase';
import type { LatLon } from '../tour';

export type Role = 'lead' | 'schluss' | 'mitfahrer';
export type Me = { id: string; name: string; car: string };
export type Member = Me & { role: Role; p: LatLon | null; heading: number | null; speedKmh: number | null; seenAt: number | null };
export type RideMsg = { id: string; from: string; name: string; text: string; at: number };
/** Gründe für eine zentrale Halt Ansage der Lead */
export type StopReason = 'parkplatz' | 'tanken' | 'pause' | 'foto';
export const STOP_REASONS: { id: StopReason; label: string; title: string }[] = [
  { id: 'parkplatz', label: 'Parkplatz', title: 'Wir fahren gleich auf einen Parkplatz' },
  { id: 'tanken', label: 'Tanken', title: 'Wir fahren gleich zum Tanken' },
  { id: 'pause', label: 'Pause', title: 'Gleich machen wir Pause' },
  { id: 'foto', label: 'Fotostopp', title: 'Gleich halten wir für Fotos' },
];
/** Halt Ansage: wo die Lead war, als sie getippt hat, und warum */
export type RideStop = { id: string; from: string; name: string; reason: StopReason; p: LatLon | null; at: number };

export type RideState = {
  status: 'aus' | 'verbinde' | 'aktiv' | 'fehler';
  code: string | null;
  me: Me | null;
  myRole: Role;
  members: Member[];
  messages: RideMsg[];
  /** Übergabe Code der Tour, die die Lead geteilt hat */
  tourCode: string | null;
  /** Aktuelle Halt Ansage der Lead, null wenn keine */
  stop: RideStop | null;
  error: string | null;
};

export const QUICK_MESSAGES = ['Bitte warten', 'Alles ok', 'Tankstopp', 'Pause', 'Achtung Polizei', 'Panne, bitte halten'];

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PROFILE_KEY = 'cumo.drive.fahrer.v1';

let state: RideState = { status: 'aus', code: null, me: null, myRole: 'mitfahrer', members: [], messages: [], tourCode: null, stop: null, error: null };
const listeners = new Set<() => void>();
let channel: RealtimeChannel | null = null;
let watch: Location.LocationSubscription | null = null;
let lastSent: { p: LatLon; at: number } | null = null;
const positions = new Map<string, Pick<Member, 'p' | 'heading' | 'speedKmh' | 'seenAt'>>();

function set(patch: Partial<RideState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useRide(): RideState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function rideState(): RideState {
  return state;
}

export function newRideCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}

export function normalizeCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
}

/** Name und Auto merken, damit man sie nicht jedes Mal eingibt. */
export async function loadProfile(): Promise<{ name: string; car: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { name: string; car: string }) : null;
  } catch {
    return null;
  }
}

async function saveProfile(name: string, car: string) {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ name, car }));
  } catch {
    // nur Komfort
  }
}

function rebuildMembers() {
  if (!channel) return;
  const pres = channel.presenceState<{ id: string; name: string; car: string; role: Role }>();
  const list: Member[] = [];
  for (const entries of Object.values(pres)) {
    const e = entries[0];
    if (!e) continue;
    const pos = positions.get(e.id);
    list.push({ id: e.id, name: e.name, car: e.car, role: e.role, p: pos?.p ?? null, heading: pos?.heading ?? null, speedKmh: pos?.speedKmh ?? null, seenAt: pos?.seenAt ?? null });
  }
  const order: Record<Role, number> = { lead: 0, mitfahrer: 1, schluss: 2 };
  list.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  set({ members: list });
}

async function startWatching() {
  if (watch) return;
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    set({ error: 'Ohne Standort sehen dich die anderen nicht auf der Karte.' });
    return;
  }
  watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 }, (loc) => {
    const p: LatLon = [loc.coords.latitude, loc.coords.longitude];
    const now = Date.now();
    const moved = lastSent ? Math.hypot((p[0] - lastSent.p[0]) * 111320, (p[1] - lastSent.p[1]) * 74000) : Infinity;
    if (lastSent && now - lastSent.at < 3000 && moved < 25) return;
    lastSent = { p, at: now };
    const heading = loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null;
    const speedKmh = loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed * 3.6 : null;
    sendPosition(p, heading, speedKmh);
  });
}

/** Position senden (auch aus der Navigation oder Simulation nutzbar). */
let lastPosAt = 0;
export function sendPosition(p: LatLon, heading: number | null, speedKmh: number | null) {
  const me = state.me;
  if (!channel || !me) return;
  // höchstens alle 2 Sekunden, auch wenn GPS und Navigation beide senden
  const now = Date.now();
  if (now - lastPosAt < 2000) return;
  lastPosAt = now;
  positions.set(me.id, { p, heading, speedKmh, seenAt: Date.now() });
  rebuildMembers();
  void channel.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, lat: p[0], lon: p[1], h: heading, v: speedKmh } });
}

export async function joinRide(code: string, name: string, car: string, role: Role = 'mitfahrer', tourCode: string | null = null) {
  await leaveRide();
  const c = normalizeCode(code);
  if (c.length !== 6) {
    set({ status: 'fehler', error: 'Der Fahrtcode hat 6 Zeichen.' });
    return;
  }
  const me: Me = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || 'Fahrer', car: car.trim() };
  await saveProfile(me.name, me.car);
  positions.clear();
  set({ status: 'verbinde', code: c, me, myRole: role, members: [], messages: [], tourCode, stop: null, error: null });

  const ch = supabase.channel(`ride-${c}`, { config: { broadcast: { self: false }, presence: { key: me.id } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, rebuildMembers);
  ch.on('presence', { event: 'join' }, () => {
    // Neue Mitfahrer bekommen die Tour von der Lead
    if (state.myRole === 'lead' && state.tourCode) void ch.send({ type: 'broadcast', event: 'tour', payload: { code: state.tourCode } });
  });
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
    const x = payload as { id: string; lat: number; lon: number; h: number | null; v: number | null };
    positions.set(x.id, { p: [x.lat, x.lon], heading: x.h, speedKmh: x.v, seenAt: Date.now() });
    rebuildMembers();
  });
  ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
    const m = payload as RideMsg;
    set({ messages: [m, ...state.messages].slice(0, 30) });
  });
  ch.on('broadcast', { event: 'stop' }, ({ payload }) => {
    const s = payload as RideStop | { id: string; clear: true };
    if ('clear' in s) {
      if (state.stop?.id === s.id) set({ stop: null });
    } else set({ stop: s });
  });
  ch.on('broadcast', { event: 'tour' }, ({ payload }) => {
    const t = payload as { code: string };
    if (t.code && t.code !== state.tourCode) set({ tourCode: t.code });
  });
  ch.on('broadcast', { event: 'role' }, ({ payload }) => {
    const r = payload as { id: string; role: Role };
    if (r.id === state.me?.id) {
      set({ myRole: r.role });
      void ch.track({ id: me.id, name: me.name, car: me.car, role: r.role });
    }
  });

  ch.subscribe(async (s) => {
    if (s === 'SUBSCRIBED') {
      await ch.track({ id: me.id, name: me.name, car: me.car, role: state.myRole });
      set({ status: 'aktiv' });
      void startWatching();
    } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
      set({ status: 'fehler', error: 'Keine Verbindung zur Gruppe. Netz prüfen und nochmal versuchen.' });
    }
  });
}

/** Neue Fahrt anlegen; wer sie anlegt, fährt vorne (Lead). */
export async function createRide(name: string, car: string, tourCode: string | null = null): Promise<string> {
  const code = newRideCode();
  await joinRide(code, name, car, 'lead', tourCode);
  return code;
}

export async function leaveRide() {
  watch?.remove();
  watch = null;
  lastSent = null;
  if (channel) {
    try {
      await channel.untrack();
      await supabase.removeChannel(channel);
    } catch {
      // egal, wir gehen ohnehin
    }
  }
  channel = null;
  positions.clear();
  set({ status: 'aus', code: null, members: [], messages: [], tourCode: null, stop: null, error: null, myRole: 'mitfahrer' });
}

export function sendMessage(text: string) {
  const me = state.me;
  if (!channel || !me) return;
  const m: RideMsg = { id: Math.random().toString(36).slice(2, 10), from: me.id, name: me.name, text, at: Date.now() };
  set({ messages: [m, ...state.messages].slice(0, 30) });
  void channel.send({ type: 'broadcast', event: 'msg', payload: m });
}

/** Lead kündigt einen Halt an: alle anderen bekommen ein großes Overlay und eine Ansage. */
export function announceStop(reason: StopReason) {
  const me = state.me;
  if (!channel || !me) return;
  const p = positions.get(me.id)?.p ?? lastSent?.p ?? null;
  const s: RideStop = { id: Math.random().toString(36).slice(2, 10), from: me.id, name: me.name, reason, p, at: Date.now() };
  set({ stop: s });
  void channel.send({ type: 'broadcast', event: 'stop', payload: s });
}

/** Halt Ansage zurücknehmen (Lead) oder nur für sich ausblenden. */
export function clearStop(forAll = false) {
  const s = state.stop;
  if (!s) return;
  set({ stop: null });
  if (forAll && channel) void channel.send({ type: 'broadcast', event: 'stop', payload: { id: s.id, clear: true } });
}

/** Lead teilt eine Tour (Übergabe Code aus handoff.ts) mit allen. */
export function shareTour(tourCode: string) {
  set({ tourCode });
  if (channel && state.myRole === 'lead') void channel.send({ type: 'broadcast', event: 'tour', payload: { code: tourCode } });
}

/** Lead bestimmt, wer das Schlusslicht fährt. */
export function setRole(memberId: string, role: Role) {
  if (!channel || state.myRole !== 'lead') return;
  void channel.send({ type: 'broadcast', event: 'role', payload: { id: memberId, role } });
}
