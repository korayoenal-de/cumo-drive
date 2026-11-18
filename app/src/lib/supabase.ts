/**
 * Supabase Client für App und Web Planer.
 * URL und publishable Key sind öffentlich gedacht (Zugriff regeln die Row Level Security Regeln
 * in supabase/migrations). Geheime Schlüssel gehören nie hierher.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const SUPABASE_URL = 'https://onfxnfkhajxvjmmvmzda.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_jjHG7dUhPWLor5lVBkhvRw_KDnuVOSJ';

const isServer = Platform.OS === 'web' && typeof window === 'undefined';

/**
 * Jede Anfrage an Supabase hat eine Frist (Koray 18.11.: Rad am Kontaktknopf drehte sich endlos). Ohne Frist bleibt
 * eine Anfrage für immer offen, wenn iOS die Verbindung still verliert (Wechsel WLAN und Mobilfunk, App im Hintergrund).
 * Nach der Frist endet sie mit einem Fehler, den die Aufrufer wie jeden Netzfehler behandeln.
 */
const FETCH_TIMEOUT_MS = 20_000;
const timedFetch: typeof fetch = (input, init) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer?.aborted) ctrl.abort();
  else outer?.addEventListener('abort', () => ctrl.abort(), { once: true });
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: timedFetch },
  auth: {
    // Beim statischen Export (Server Rendering) gibt es keinen Speicher
    storage: isServer ? undefined : AsyncStorage,
    persistSession: !isServer,
    autoRefreshToken: !isServer,
    detectSessionInUrl: Platform.OS === 'web' && !isServer,
  },
});
