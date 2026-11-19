/**
 * Rückmeldungen (Koray 16.11.): ein Eingang für alles. Problem melden und schwache Bewertungen landen per Datenbank
 * Trigger darin, Feedback aus den Einstellungen über send_feedback. Claude prüft jede Meldung im Betrieb.
 */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import { t } from '@/i18n';

export type FeedbackArea = 'planen' | 'navigation' | 'karte' | 'community' | 'sonstiges';

export const FEEDBACK_AREAS: { id: FeedbackArea; label: string }[] = [
  { id: 'planen', label: t('Planen') },
  { id: 'navigation', label: t('Navigation') },
  { id: 'karte', label: t('Karte') },
  { id: 'community', label: 'Community' },
  { id: 'sonstiges', label: t('Sonstiges') },
];

/** App Version plus Update, damit klar ist, welcher Stand gemeldet hat (zum Beispiel "1.1.0 · 01a1e3ff") */
export function appVersion(): string {
  const v = Constants.expoConfig?.version ?? '?';
  let id: string | null = null;
  try {
    id = Updates.updateId ?? null;
  } catch {
    id = null;
  }
  return id ? `${v} · ${id.slice(0, 8)}` : v;
}

/**
 * Für die Zeile in den Einstellungen (Koray 19.11.2026): Version und Stand des geladenen Updates mit Datum und
 * Uhrzeit, etwa "1.0.0 · Update 19.11. 23:05". So sieht man auf dem Handy sofort, ob ein neues Update schon da ist.
 */
export function appVersionLine(): string {
  const v = Constants.expoConfig?.version ?? '?';
  let at: Date | null = null;
  try {
    at = Updates.updateId ? (Updates.createdAt ?? null) : null;
  } catch {
    at = null;
  }
  if (!at) return v;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${v} · Update ${at.getDate()}.${at.getMonth() + 1}. ${two(at.getHours())}:${two(at.getMinutes())}`;
}

export async function sendFeedback(area: FeedbackArea, note: string, extra?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('send_feedback', {
    p_area: area,
    p_note: note.trim(),
    p_context: { ...extra, version: appVersion(), os: `${Platform.OS} ${Platform.Version}` },
  });
  if (error) throw new Error(error.message || t('Senden hat nicht geklappt.'));
}
