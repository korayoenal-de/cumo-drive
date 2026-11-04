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

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Beim statischen Export (Server Rendering) gibt es keinen Speicher
    storage: isServer ? undefined : AsyncStorage,
    persistSession: !isServer,
    autoRefreshToken: !isServer,
    detectSessionInUrl: Platform.OS === 'web' && !isServer,
  },
});
