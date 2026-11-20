/**
 * Ersatz für src/lib/supabase.ts im Bundle je Fahrer: der Fake Client kommt beim Laden des Bundles
 * als Parameter __simClient herein (siehe run.ts), so hat jeder virtuelle Fahrer seinen eigenen.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

declare const __simClient: unknown;

export const SUPABASE_URL = 'http://sim.invalid';
export const SUPABASE_KEY = 'sim';
export const supabase = __simClient as SupabaseClient;

let channelSeq = 0;
/** wie in src/lib/supabase.ts: eigener Kanalname je Aufbau */
export function freshChannel(name: string): string {
  channelSeq += 1;
  return `${name}#${channelSeq}`;
}
