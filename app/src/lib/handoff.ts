/**
 * Übergabe einer fertig geplanten Tour vom Web Planer an die App über einen kurzen Code.
 * Der Planer legt die komplette Tour in Supabase ab (7 Tage gültig), der QR Code enthält nur
 * den Code. Die App bekommt so exakt die geplante Strecke samt Etappen Check.
 */
import { supabase } from './supabase';
import type { Profile, Tour } from './tour';
import type { Avoid } from './valhalla';
import { packTour, unpackTour, type Packed } from './tour-pack';

export { packTour, unpackTour, type Packed };

export const HANDOFF_PREFIX = 'h:';

export async function createHandoff(tour: Tour & { minutes?: number }, profile: Profile, avoid?: Avoid): Promise<string> {
  const packed = packTour(tour, profile, avoid);
  const { data, error } = await supabase.rpc('create_handoff', { payload: packed });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Übergabe fehlgeschlagen');
  return HANDOFF_PREFIX + data;
}

export function isHandoffCode(code: string): boolean {
  return code.startsWith(HANDOFF_PREFIX) && /^h:[a-z0-9]{8}$/.test(code);
}

export async function fetchHandoff(code: string): Promise<{ tour: Tour & { minutes?: number }; profile: Profile; avoid?: Avoid } | null> {
  const { data, error } = await supabase.rpc('get_handoff', { code: code.slice(HANDOFF_PREFIX.length) });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return unpackTour(data as Packed);
}
