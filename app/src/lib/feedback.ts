/**
 * Rückmeldungen (Koray 16.11.): ein Eingang für alles. Problem melden und schwache Bewertungen landen per Datenbank
 * Trigger darin, Feedback aus den Einstellungen über send_feedback. Claude prüft jede Meldung im Betrieb.
 */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type FeedbackArea = 'planen' | 'navigation' | 'karte' | 'community' | 'sonstiges';

export const FEEDBACK_AREAS: { id: FeedbackArea; label: string }[] = [
  { id: 'planen', label: 'Planen' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'karte', label: 'Karte' },
  { id: 'community', label: 'Community' },
  { id: 'sonstiges', label: 'Sonstiges' },
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

export async function sendFeedback(area: FeedbackArea, note: string, extra?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('send_feedback', {
    p_area: area,
    p_note: note.trim(),
    p_context: { ...extra, version: appVersion(), os: `${Platform.OS} ${Platform.Version}` },
  });
  if (error) throw new Error(error.message || 'Senden hat nicht geklappt.');
}
