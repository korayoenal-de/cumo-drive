/**
 * Konto über Supabase Auth: vorerst E-Mail und Passwort (ohne Bestätigungsmail).
 * Später kommen Anmeldecodes per Mail und Sign in with Apple dazu.
 */
import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { releaseDevice } from './account-scope';
import { forgetPush } from './push';
import { supabase } from './supabase';
import { LEGAL_VERSION } from '@/content/legal';
import { getLang, t } from '@/i18n';

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
  if (/invalid login credentials/i.test(msg)) return t('E-Mail oder Passwort stimmt nicht.');
  if (/already registered|already exists/i.test(msg)) return t('Diese E-Mail ist schon registriert. Bitte anmelden.');
  if (/password should be at least|weak password/i.test(msg)) return t('Das Passwort braucht mindestens 8 Zeichen.');
  if (/email not confirmed/i.test(msg)) return t('Die E-Mail ist noch nicht bestätigt. Bitte bestätige sie über die Mail, die wir dir geschickt haben.');
  if (/rate limit/i.test(msg)) return t('Zu viele Versuche. Bitte kurz warten.');
  if (/invalid.*email|unable to validate email/i.test(msg)) return t('Das sieht nicht nach einer gültigen E-Mail aus.');
  // Die Mail ging nicht raus oder der Mailserver war zu langsam (Koray 19.11.: englische Rohmeldungen im Formular)
  if (/error sending|sending confirmation|context deadline|request_timeout/i.test(msg)) return t('Die Bestätigungsmail ging gerade nicht raus. Bitte versuch es in einer Minute noch einmal.');
  if (/abort|network request failed|failed to fetch|timeout/i.test(msg)) return t('Das hat zu lange gedauert. Bitte prüf deine Verbindung und versuch es noch einmal.');
  return t(msg);
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(german(error.message));
}

/** Registrierung hat geklappt, die Adresse muss noch bestätigt werden */
export class SignUpPending extends Error {
  constructor() {
    super('Registriert. Bitte die Bestätigungsmail öffnen und dann anmelden.');
    this.name = 'SignUpPending';
  }
}

/** Einwilligungen bei der Registrierung (Koray 17.11.: Opt in), landen per Trigger in der Tabelle consents */
export type SignUpConsent = { terms: true; news: boolean };

export async function signUp(email: string, password: string, consent: SignUpConsent) {
  if (password.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    // lang: Sprache der Bestätigungsmail (Vorlage in supabase/templates); emailRedirectTo: Seite nach dem Klick
    options: {
      data: { lang: getLang(), consent: { ...consent, version: LEGAL_VERSION, source: Platform.OS === 'web' ? 'web' : 'app' } },
      emailRedirectTo: 'https://cumodrive.de/bestaetigt',
    },
  });
  if (error) throw new Error(german(error.message));
  // Kein Fehler: das Konto ist angelegt und wartet auf den Klick in der Mail. Eigene Klasse, damit das Formular es
  // grün als Erfolg zeigt statt rot (Koray 19.11.)
  if (!data.session) throw new SignUpPending();
}

/**
 * Konto endgültig löschen (Apple Regel 5.1.1 v): Funktion delete_my_account in der Datenbank,
 * die Daten im Konto fallen per Kaskade mit. Danach abmelden; lokale Touren räumt der Aufrufer auf.
 */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(german(error.message));
  // Tokens fallen per Kaskade mit, hier nur den lokalen Stand räumen
  await forgetPush();
  await supabase.auth.signOut();
  await releaseDevice();
}

export async function signOut() {
  await forgetPush();
  await supabase.auth.signOut();
  // Garage, Touren und zuletzt gesuchte Orte vom Gerät nehmen: sie liegen im Konto, und das nächste Konto auf
  // diesem Gerät darf sie nicht sehen (account-scope.ts)
  await releaseDevice();
}
