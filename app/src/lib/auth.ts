/**
 * Konto über Supabase Auth: vorerst E-Mail und Passwort (ohne Bestätigungsmail).
 * Später kommen Anmeldecodes per Mail und Sign in with Apple dazu.
 */
import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

let session: Session | null = null;
/** true, sobald die gespeicherte Sitzung gelesen ist (vorher weiß man nicht, ob angemeldet) */
let ready = false;
let started = false;
const listeners = new Set<() => void>();

function start() {
  if (started) return;
  started = true;
  supabase.auth
    .getSession()
    .then(({ data }) => {
      session = data.session;
    })
    .finally(() => {
      ready = true;
      for (const l of listeners) l();
    });
  supabase.auth.onAuthStateChange((_e, s) => {
    session = s;
    ready = true;
    for (const l of listeners) l();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => {
    listeners.delete(l);
  };
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => session, () => null);
}

/** Wie useSession, dazu ob die Sitzung schon geladen ist (für die Anmeldepflicht beim Start). */
export function useAuthReady(): boolean {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}

function german(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/already registered|already exists/i.test(msg)) return 'Diese E-Mail ist schon registriert. Bitte anmelden.';
  if (/password should be at least|weak password/i.test(msg)) return 'Das Passwort braucht mindestens 8 Zeichen.';
  if (/email not confirmed/i.test(msg)) return 'Die E-Mail ist noch nicht bestätigt. In Supabase „Confirm email“ ausschalten oder die Mail bestätigen.';
  if (/rate limit/i.test(msg)) return 'Zu viele Versuche. Bitte kurz warten.';
  if (/invalid.*email|unable to validate email/i.test(msg)) return 'Das sieht nicht nach einer gültigen E-Mail aus.';
  return msg;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(german(error.message));
}

export async function signUp(email: string, password: string) {
  if (password.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(german(error.message));
  if (!data.session) throw new Error('Registriert. Bitte die Bestätigungsmail öffnen und dann anmelden.');
}

export async function signOut() {
  await supabase.auth.signOut();
}
