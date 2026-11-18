/**
 * Fehlertexte für Menschen (Koray 18.11.): Netzfehler nie als „fetch failed: …“ zeigen. Erkennt fehlendes Netz an
 * den üblichen Meldungen von fetch, Supabase und iOS und liefert einen Satz in Du Form. Alles andere bleibt, wie es ist.
 */
import { t } from '@/i18n';

const NET = /fetch|network|netzwerk|abgebrochen|cancel|timed out|zeitüberschreitung|offline|keine verbindung|internet/i;

export function isOffline(e: unknown): boolean {
  return NET.test(e instanceof Error ? e.message : String(e ?? ''));
}

export function friendlyError(e: unknown, offline = t('Keine Verbindung zum Internet. Versuch es gleich nochmal.')): string {
  return isOffline(e) ? offline : e instanceof Error ? e.message : String(e ?? '');
}
