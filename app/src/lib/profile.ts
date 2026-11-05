/**
 * Eigenes Profil im Konto (public.profiles): der Name, unter dem einen andere finden und einladen.
 * Der Name ist eindeutig (Groß und Kleinschreibung zählen nicht), hat 3 bis 30 Zeichen und
 * besteht aus Buchstaben, Ziffern, Leerzeichen, Punkt und Unterstrich.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { signUp } from './auth';
import { supabase } from './supabase';

export type MyProfile = { id: string; displayName: string | null; car: string | null };
export type FoundProfile = { id: string; displayName: string; car: string | null };

export const NAME_MIN = 3;
export const NAME_MAX = 30;
const NAME_RE = /^[A-Za-z0-9À-ÖØ-öø-ÿĀ-ſ ._]+$/;

/** Name so aufbereiten, wie er gespeichert wird (Leerzeichen am Rand weg, doppelte zusammen). */
export function cleanName(n: string): string {
  return n.replace(/\s+/g, ' ').trim();
}

/** Fehlertext für einen Namen, oder null wenn er die Form erfüllt (frei ist er damit noch nicht). */
export function nameProblem(raw: string): string | null {
  const n = cleanName(raw);
  if (n.length < NAME_MIN) return `Der Name braucht mindestens ${NAME_MIN} Zeichen.`;
  if (n.length > NAME_MAX) return `Der Name hat höchstens ${NAME_MAX} Zeichen.`;
  if (!NAME_RE.test(n)) return 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen, Punkt und Unterstrich.';
  return null;
}

/** Profil Zustand: undefined heißt noch nicht geladen, null heißt nicht angemeldet. */
type State = { userId: string | null; profile: MyProfile | null | undefined };
let state: State = { userId: null, profile: undefined };
const listeners = new Set<() => void>();
let loading: string | null = null;

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

/** Name aus der Registrierung, der gleich gespeichert wird (dann nicht nach dem Namen fragen). */
let pendingName: string | null = null;

async function load(userId: string) {
  if (pendingName || loading === userId) return;
  loading = userId;
  try {
    const { data, error } = await supabase.from('profiles').select('id,display_name,car').eq('id', userId).maybeSingle();
    if (error) throw error;
    const row = data as { id: string; display_name: string | null; car: string | null } | null;
    if (state.userId === userId) set({ userId, profile: { id: userId, displayName: row?.display_name ?? null, car: row?.car ?? null } });
  } catch {
    // ohne Netz nicht als „kein Name“ werten, sonst käme die Namensabfrage zu Unrecht; später erneut versuchen
    if (state.userId === userId) set({ userId, profile: undefined });
  } finally {
    loading = null;
  }
}

/** Profil neu laden (zum Beispiel nach dem Zurückkommen in die App). */
export function reloadMyProfile() {
  if (state.userId) void load(state.userId);
}

/**
 * Eigenes Profil für die angemeldete Person. undefined solange es lädt (oder ohne Netz nicht geladen werden konnte).
 * userId kommt aus der Sitzung (useSession), damit sich das Profil beim Kontowechsel neu lädt.
 */
export function useMyProfile(userId: string | null | undefined): MyProfile | null | undefined {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
  const id = userId ?? null;
  useEffect(() => {
    if (state.userId !== id) set({ userId: id, profile: id ? undefined : null });
    if (id && state.profile === undefined) void load(id);
  }, [id]);
  if (s.userId !== id) return id ? undefined : null;
  return s.profile;
}

/** Aktuelles Profil ohne Hook (für Gruppenfahrten). */
export function myProfile(): MyProfile | null {
  return state.profile ?? null;
}

export async function nameAvailable(n: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('name_available', { n: cleanName(n) });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Namen speichern; legt das Profil an, falls es noch keins gibt. */
export async function setDisplayName(raw: string): Promise<string> {
  const n = cleanName(raw);
  const problem = nameProblem(n);
  if (problem) throw new Error(problem);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Bitte zuerst anmelden.');
  const { error } = await supabase.from('profiles').upsert({ id: u.user.id, display_name: n });
  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) throw new Error('Diesen Namen hat schon jemand. Bitte einen anderen wählen.');
    if (error.code === '23514') throw new Error('Dieser Name ist nicht erlaubt.');
    throw new Error(error.message);
  }
  const prev = state.userId === u.user.id ? state.profile : null;
  set({ userId: u.user.id, profile: { id: u.user.id, displayName: n, car: prev?.car ?? null } });
  return n;
}

/** Fahrer per Namensanfang suchen (ab 2 Zeichen, höchstens 10 Treffer, ohne einen selbst). */
export async function findProfiles(q: string): Promise<FoundProfile[]> {
  const needle = cleanName(q);
  if (needle.length < 2) return [];
  const { data, error } = await supabase.rpc('find_profiles', { q: needle });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; display_name: string; car: string | null }[]).map((r) => ({ id: r.id, displayName: r.display_name, car: r.car }));
}

/** Registrieren und gleich danach den Namen im Profil speichern. */
export async function signUpWithName(email: string, password: string, name: string) {
  const n = cleanName(name);
  const problem = nameProblem(n);
  if (problem) throw new Error(problem);
  if (!(await nameAvailable(n))) throw new Error('Diesen Namen hat schon jemand. Bitte einen anderen wählen.');
  pendingName = n;
  try {
    await signUp(email, password);
  } catch (e) {
    pendingName = null;
    throw e;
  }
  try {
    await setDisplayName(n);
  } finally {
    pendingName = null;
    // klappt das Speichern nicht (Name inzwischen vergeben), fragt die App danach
    if (state.profile === undefined && state.userId) void load(state.userId);
  }
}
