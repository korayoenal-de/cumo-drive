/**
 * Tour als CUMO DRIVE Link teilen: drive.rallycumo.de/t#s:abcd2345
 * Seit 11.11. kurz (Koray): Der Tour Code (cumo1:...) liegt in Supabase, der Link trägt nur die Kennung.
 * Klappt das Ablegen nicht (offline), geht der lange Link mit dem ganzen Code raus.
 * Wer den Link öffnet, landet auf der Landeseite und holt die Route mit einem Tipp in die App
 * (cumodrive://scan?code=...). Dort steht sie als ungespeicherte Kopie im Planer.
 */
import { Share } from 'react-native';

import { encodeTour, shareUrl } from './share-code';
import { supabase } from './supabase';
import { formatKm, type Profile, type Tour } from './tour';

export const SHORT_PREFIX = 's:';

export function isShortCode(code: string): boolean {
  return /^s:[a-z0-9]{8}$/.test(code);
}

async function createShortCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_share_link', { payload: code });
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Link konnte nicht angelegt werden');
  return SHORT_PREFIX + data;
}

/** Kurzen Code in den Tour Code auflösen; andere Codes kommen unverändert zurück */
export async function resolveShareCode(code: string): Promise<string> {
  if (!isShortCode(code)) return code;
  const { data, error } = await supabase.rpc('get_share_link', { code: code.slice(SHORT_PREFIX.length) });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Diesen Link gibt es nicht mehr.');
  return data;
}

/** Text mit kurzem Link (ohne Netz: langer Link, der trägt alles selbst) */
export async function tourLinkText(tour: Tour, profile: Profile): Promise<string> {
  const code = encodeTour(tour, profile, { full: true });
  let url = shareUrl(code);
  try {
    url = shareUrl(await createShortCode(code));
  } catch {
    // ohne Netz oder Server: langer Link
  }
  return `${tour.name}, ${formatKm(tour.laenge_km, 0)} km mit CUMO DRIVE\n${url}`;
}

export async function shareTourLink(tour: Tour, profile: Profile): Promise<void> {
  await Share.share({ title: tour.name, message: await tourLinkText(tour, profile) });
}

/**
 * Im Browser: kurzen Link in die Zwischenablage (Web Planer, 11.11.). Safari erlaubt das Schreiben nur direkt im
 * Klick, daher geht der noch ausstehende Text als ClipboardItem hinein; sonst nach dem Anlegen mit writeText.
 */
export async function copyTourLink(tour: Tour, profile: Profile): Promise<void> {
  const text = tourLinkText(tour, profile);
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav?.clipboard) throw new Error('Kopieren geht in diesem Browser nicht');
  const Item = (globalThis as { ClipboardItem?: new (d: Record<string, Promise<Blob>>) => unknown }).ClipboardItem;
  if (Item && nav.clipboard.write) {
    try {
      await nav.clipboard.write([new Item({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }) as ClipboardItem]);
      return;
    } catch {
      // ältere Browser kennen ausstehende Inhalte nicht: unten weiter
    }
  }
  await nav.clipboard.writeText(await text);
}
