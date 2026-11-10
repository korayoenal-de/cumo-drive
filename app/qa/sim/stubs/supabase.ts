/**
 * Ersatz für src/lib/supabase.ts im Bundle je Fahrer: der Fake Client kommt beim Laden des Bundles
 * als Parameter __simClient herein (siehe run.ts), so hat jeder virtuelle Fahrer seinen eigenen.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

declare const __simClient: unknown;

export const SUPABASE_URL = 'http://sim.invalid';
export const SUPABASE_KEY = 'sim';
export const supabase = __simClient as SupabaseClient;
