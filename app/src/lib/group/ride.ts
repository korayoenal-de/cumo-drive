/**
 * Gruppenfahrt über Supabase Realtime.
 *
 * In der App lädt der Ersteller einer Tour die Mitfahrer mit Namen ein (siehe invites.ts), die Fahrt
 * hat dann eine ID in public.rides und läuft im Kanal `ride-<rideId>` (startRide). Der Web Planer
 * nutzt noch den alten Weg mit Fahrtcode (createRide, joinRide), Kanal `ride-<code>`.
 *
 * Im Kanal:
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
export type Member = Me & { role: Role; p: LatLon | null; heading: number | null; speedKmh: number | null; seenAt: number | null; /** gerade abseits der Tour */ off?: boolean; /** fährt bewusst eine eigene Route (Koray 11.11.) */ own?: boolean };
export type RideMsg = { id: string; from: string; name: string; text: string; at: number };
/** Gründe für eine zentrale Halt Ansage der Lead */
export type StopReason = 'sammeln' | 'parkplatz' | 'tanken' | 'pause' | 'foto';
export const STOP_REASONS: { id: StopReason; label: string; title: string }[] = [
  { id: 'sammeln', label: 'Sammeln', title: 'Wir sammeln uns, bitte aufschließen' },
  { id: 'parkplatz', label: 'Parkplatz', title: 'Wir fahren gleich auf einen Parkplatz' },
  { id: 'tanken', label: 'Tanken', title: 'Wir fahren gleich zum Tanken' },
  { id: 'pause', label: 'Pause', title: 'Gleich machen wir Pause' },
  { id: 'foto', label: 'Fotostopp', title: 'Gleich halten wir für Fotos' },
];
/** Halt Ansage: wo die Lead war, als sie getippt hat, und warum */
export type RideStop = { id: string; from: string; name: string; reason: StopReason; p: LatLon | null; at: number };

export type RideState = {
  status: 'aus' | 'verbinde' | 'aktiv' | 'fehler';
  /** alter Fahrtcode (nur Web Planer), sonst null */
  code: string | null;
  /** ID der Fahrt in public.rides bei Fahrten mit Einladung */
  rideId: string | null;
  /** Name der Fahrt (meist der Tourname) */
  name: string | null;
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

let state: RideState = { status: 'aus', code: null, rideId: null, name: null, me: null, myRole: 'mitfahrer', members: [], messages: [], tourCode: null, stop: null, error: null };
const listeners = new Set<() => void>();
let channel: RealtimeChannel | null = null;
let watch: Location.LocationSubscription | null = null;
let lastSent: { p: LatLon; at: number } | null = null;
const positions = new Map<string, Pick<Member, 'p' | 'heading' | 'speedKmh' | 'seenAt' | 'off' | 'own'>>();
/**
 * Zuletzt per Presence gesehene Mitglieder. Fällt jemand ins Funkloch, entfernt der Realtime Server
 * die Presence nach etwa einer Minute; ohne diese Liste verschwände er dann samt letzter Position
 * von der Karte (Simulation G10, 10.11.). Wer bewusst geht, meldet sich mit `bye` ab.
 */
const known = new Map<string, Pick<Member, 'name' | 'car' | 'role'>>();
/** So lange bleibt ein Mitglied ohne Verbindung mit seiner letzten Position sichtbar */
const LOST_KEEP_MS = 10 * 60000;

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
  const present = new Set<string>();
  for (const entries of Object.values(pres)) {
    const e = entries[0];
    if (!e) continue;
    present.add(e.id);
    known.set(e.id, { name: e.name, car: e.car, role: e.role });
    const pos = positions.get(e.id);
    list.push({ id: e.id, name: e.name, car: e.car, role: e.role, p: pos?.p ?? null, heading: pos?.heading ?? null, speedKmh: pos?.speedKmh ?? null, seenAt: pos?.seenAt ?? null, off: pos?.off ?? false, own: pos?.own ?? false });
  }
  // ohne Verbindung, aber nicht abgemeldet: mit letzter Position (seenAt zeigt das Alter)
  for (const [id, k] of known) {
    const pos = positions.get(id);
    if (present.has(id) || !pos?.p || pos.seenAt == null || Date.now() - pos.seenAt > LOST_KEEP_MS) continue;
    list.push({ id, ...k, p: pos.p, heading: pos.heading, speedKmh: pos.speedKmh, seenAt: pos.seenAt, off: pos.off ?? false, own: pos.own ?? false });
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
export function sendPosition(p: LatLon, heading: number | null, speedKmh: number | null, off = false) {
  const me = state.me;
  if (!channel || !me) return;
  // höchstens alle 2 Sekunden, auch wenn GPS und Navigation beide senden
  const now = Date.now();
  if (now - lastPosAt < 2000) return;
  lastPosAt = now;
  positions.set(me.id, { p, heading, speedKmh, seenAt: Date.now(), off, own: ownRoute });
  rebuildMembers();
  void channel.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, lat: p[0], lon: p[1], h: heading, v: speedKmh, off, own: ownRoute } });
}

/**
 * Eigene Route in der Gruppe (Koray 11.11.): wer bewusst anders fährt, bleibt in der Gruppe (Karte, Funk),
 * ist aber nicht mehr auf der gemeinsamen Strecke. Die anderen bekommen eine Kurznachricht und sehen ihn grau.
 */
let ownRoute = false;
export function setOwnRoute(on: boolean) {
  if (ownRoute === on) return;
  ownRoute = on;
  const me = state.me;
  if (!me) return;
  sendMessage(on ? `${me.name} fährt eine eigene Route` : `${me.name} ist wieder auf der Tour`);
  const cur = positions.get(me.id);
  if (cur) {
    positions.set(me.id, { ...cur, own: on });
    rebuildMembers();
  }
  lastPosAt = 0;
}
export function isOwnRoute() {
  return ownRoute;
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
  connect(`ride-${c}`, me, role, { code: c, rideId: null, name: null, tourCode });
}

/**
 * Einer Fahrt mit Einladung beitreten (Ersteller als Lead, Eingeladene als Mitfahrer).
 * Name und Fahrzeug kommen aus dem Profil und der Garage. Ist man schon in dieser Fahrt, passiert nichts.
 */
export async function startRide(rideId: string, role: Role, opts: { name: string; car: string; rideName?: string | null }) {
  if (state.rideId === rideId && (state.status === 'aktiv' || state.status === 'verbinde')) return;
  await leaveRide();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    set({ status: 'fehler', error: 'Bitte anmelden, um mitzufahren.' });
    return;
  }
  const me: Me = { id: data.user.id, name: opts.name.trim() || 'Fahrer', car: opts.car.trim() };
  connect(`ride-${rideId}`, me, role, { code: null, rideId, name: opts.rideName ?? null, tourCode: null });
}

function connect(topic: string, me: Me, role: Role, info: { code: string | null; rideId: string | null; name: string | null; tourCode: string | null }) {
  positions.clear();
  known.clear();
  set({ status: 'verbinde', ...info, me, myRole: role, members: [], messages: [], stop: null, error: null });

  const ch = supabase.channel(topic, { config: { broadcast: { self: false }, presence: { key: me.id } } });
  channel = ch;
  ch.on('presence', { event: 'sync' }, rebuildMembers);
  ch.on('presence', { event: 'join' }, () => {
    // Neue Mitfahrer bekommen die Tour von der Lead
    if (state.myRole === 'lead' && state.tourCode) void ch.send({ type: 'broadcast', event: 'tour', payload: { code: state.tourCode } });
  });
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
    const x = payload as { id: string; lat: number; lon: number; h: number | null; v: number | null; off?: boolean; own?: boolean };
    positions.set(x.id, { p: [x.lat, x.lon], heading: x.h, speedKmh: x.v, seenAt: Date.now(), off: !!x.off, own: !!x.own });
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
  ch.on('broadcast', { event: 'bye' }, ({ payload }) => {
    const id = (payload as { id: string }).id;
    known.delete(id);
    positions.delete(id);
    rebuildMembers();
  });
  ch.on('broadcast', { event: 'ende' }, () => {
    // Lead hat die Fahrt für alle beendet
    void leaveRide().then(() => set({ error: 'Die Lead hat die Gruppenfahrt beendet.' }));
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
      // auch nach dem Wiederverbinden: alten Verbindungsfehler löschen (Simulation G10)
      set({ status: 'aktiv', error: null });
      void startWatching();
      // Wer beim Beenden oder beim Rollenwechsel kein Netz hatte, hat das Broadcast verpasst (Simulation G6, G12)
      if (state.rideId) void syncWithRide(state.rideId);
    } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
      set({ status: 'fehler', error: 'Keine Verbindung zur Gruppe. Netz prüfen und nochmal versuchen.' });
    }
  });
}

/**
 * Nach jedem Beitritt mit der Fahrt in der Datenbank abgleichen: schon beendet heißt verlassen wie beim
 * Broadcast `ende`, eine inzwischen vergebene Rolle (setRole schreibt sie in ride_members) übernehmen.
 */
async function syncWithRide(rideId: string) {
  try {
    const { data } = await supabase.from('rides').select('status').eq('id', rideId).maybeSingle();
    if (state.rideId !== rideId) return;
    if ((data as { status?: string } | null)?.status === 'beendet') {
      await leaveRide();
      set({ error: 'Die Lead hat die Gruppenfahrt beendet.' });
      return;
    }
    const me = state.me;
    if (!me) return;
    const { data: row } = await supabase.from('ride_members').select('role').eq('ride_id', rideId).eq('user_id', me.id).maybeSingle();
    const role = (row as { role?: Role } | null)?.role;
    if (role && role !== state.myRole && state.rideId === rideId && channel) {
      set({ myRole: role });
      void channel.track({ id: me.id, name: me.name, car: me.car, role });
    }
  } catch {
    // ohne Netz beim nächsten Beitritt
  }
}

/** Neue Fahrt anlegen; wer sie anlegt, fährt vorne (Lead). */
export async function createRide(name: string, car: string, tourCode: string | null = null): Promise<string> {
  const code = newRideCode();
  await joinRide(code, name, car, 'lead', tourCode);
  return code;
}

export async function leaveRide() {
  ownRoute = false;
  watch?.remove();
  watch = null;
  lastSent = null;
  if (channel) {
    try {
      // bewusst gehen: die anderen nehmen einen sofort von der Karte (sonst bliebe man als „ohne Verbindung“)
      if (state.me) await channel.send({ type: 'broadcast', event: 'bye', payload: { id: state.me.id } });
      await channel.untrack();
      await supabase.removeChannel(channel);
    } catch {
      // egal, wir gehen ohnehin
    }
  }
  channel = null;
  positions.clear();
  known.clear();
  set({ status: 'aus', code: null, rideId: null, name: null, members: [], messages: [], tourCode: null, stop: null, error: null, myRole: 'mitfahrer' });
}

/** Lead beendet die Fahrt für alle: die anderen verlassen den Kanal. */
export async function endRideForAll() {
  if (channel && state.myRole === 'lead') {
    try {
      await channel.send({ type: 'broadcast', event: 'ende', payload: {} });
    } catch {
      // die anderen merken es spätestens, wenn keine Positionen mehr kommen
    }
  }
  await leaveRide();
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
  // bei Fahrten mit Einladung auch in der Fahrt merken (die ID ist dort die Konto ID)
  if (state.rideId) {
    void supabase
      .from('ride_members')
      .update({ role })
      .eq('ride_id', state.rideId)
      .eq('user_id', memberId)
      .then(() => undefined);
  }
}
