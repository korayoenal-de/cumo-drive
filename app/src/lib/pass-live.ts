/**
 * Live Passstatus aus Supabase (public.pass_status, befüllt von der Edge Function pass-status).
 * Hat ein Pass einen Live Eintrag, gilt dieser; sonst die Faustregel likelyClosed.
 * Die Planung blockiert nie, der Status ist nur ein Hinweis.
 */
import { useSyncExternalStore } from 'react';

import { likelyClosed, type Pass } from './passes';
import { supabase } from './supabase';

export type LiveRow = { pass_id: string; state: 'offen' | 'gesperrt'; until: string | null; info: string | null; checked_at: string };
export type PassState = { closed: boolean; source: 'live' | 'regel'; until: string | null; note: string };

let rows: Map<string, LiveRow> | null = null;
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function load() {
  const { data, error } = await supabase.from('pass_status').select('pass_id,state,until,info,checked_at');
  if (!error && data && data.length) {
    rows = new Map((data as LiveRow[]).map((r) => [r.pass_id, r]));
    for (const l of listeners) l();
  }
  loadedAt = Date.now();
}

function ensure() {
  if (loading || Date.now() - loadedAt < 30 * 60000) return;
  loading = load()
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
}

/** Schon beim Start laden, damit der Status bereit ist, wenn der Planer ihn braucht */
export function prefetchPassLive() {
  ensure();
}

function subscribe(l: () => void) {
  listeners.add(l);
  ensure();
  return () => {
    listeners.delete(l);
  };
}

/** Live Daten, sobald geladen (null, solange keine da sind oder Supabase nicht erreichbar ist). */
export function usePassLive(): Map<string, LiveRow> | null {
  return useSyncExternalStore(subscribe, () => rows, () => null);
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });

export function passState(p: Pass, live: Map<string, LiveRow> | null, month = new Date().getMonth() + 1): PassState {
  const r = live?.get(p.id);
  if (r) {
    if (r.state === 'offen') return { closed: false, source: 'live', until: null, note: 'offen' };
    return { closed: true, source: 'live', until: r.until, note: r.until ? `gesperrt bis ${fmtDate(r.until)}` : 'gesperrt' };
  }
  const closed = likelyClosed(p, month);
  return { closed, source: 'regel', until: null, note: closed ? (p.closed_months ? `meist zu ${p.closed_months}` : 'im Winter meist zu') : '' };
}

/** Hinweis für eine Tour: Titel und Text zu den gesperrten Pässen auf der Strecke, oder null. */
export function closedHint(list: Pass[], live: Map<string, LiveRow> | null): { title: string; text: string } | null {
  const st = list.map((p) => ({ p, s: passState(p, live) })).filter((x) => x.s.closed);
  if (!st.length) return null;
  const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}` : xs[0]);
  const liveClosed = st.filter((x) => x.s.source === 'live');
  const ruled = st.filter((x) => x.s.source === 'regel');
  const parts: string[] = [];
  if (liveClosed.length)
    parts.push(`Laut aktueller Verkehrsmeldung gesperrt: ${join(liveClosed.map((x) => (x.s.until ? `${x.p.name} (${x.s.note})` : x.p.name)))}.`);
  if (ruled.length) parts.push(`${join(ruled.map((x) => x.p.name))} ${ruled.length > 1 ? 'sind' : 'ist'} um diese Jahreszeit meist zu.`);
  parts.push('Planen und speichern geht trotzdem, vor der Fahrt den Status prüfen.');
  return { title: liveClosed.length ? 'Pass gesperrt' : 'Wintersperre möglich', text: parts.join(' ') };
}
