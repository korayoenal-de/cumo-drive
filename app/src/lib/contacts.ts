/**
 * Kontakte unter Drivers (TestFlight Review, Koray 13.11.): Anfrage schicken, die andere Person bestätigt.
 * Kontakte stehen beim Einladen zu Gruppenfahrten oben. Ein gemeinsamer Speicher für alle Bildschirme,
 * gelesen über useSyncExternalStore (der React Compiler friert sonst modulweite Werte ein).
 * Tabellen und Funktionen aus supabase/migrations/20261113200000_kontakte.sql.
 */
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

/** kontakt: bestätigt; angefragt: du hast gefragt; anfrage: die andere Person fragt dich */
export type ContactStatus = 'kontakt' | 'angefragt' | 'anfrage';
export type Contact = { id: string; name: string; car: string | null; status: ContactStatus };

type State = { list: Contact[] | null; byId: Map<string, ContactStatus> };
let state: State = { list: null, byId: new Map() };
const subs = new Set<() => void>();
let loading: Promise<void> | null = null;

function set(list: Contact[]) {
  state = { list, byId: new Map(list.map((c) => [c.id, c.status])) };
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const snapshot = () => state;

function fail(message: string): never {
  throw new Error(/^[A-ZÄÖÜ][^\n]*$/.test(message) && !/violat|permission|function|relation|column|JWT/i.test(message) ? message : 'Das hat nicht geklappt. Bitte nochmal versuchen.');
}

/** Kontakte neu laden (beim Öffnen von Drivers und nach jeder Änderung) */
export function refreshContacts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return set([]);
      const { data, error } = await supabase.rpc('my_contacts');
      if (error) return;
      set(((data ?? []) as { id: string; display_name: string; car: string | null; status: ContactStatus }[]).map((r) => ({ id: r.id, name: r.display_name, car: r.car, status: r.status })));
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Alle Kontakte und Anfragen; null, solange noch nicht geladen */
export function useContacts(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Zu Kontakten hinzufügen. Hat die andere Person schon gefragt, seid ihr sofort Kontakte. */
export async function requestContact(id: string): Promise<ContactStatus> {
  const { data, error } = await supabase.rpc('contact_request', { other: id });
  if (error) fail(error.message);
  await refreshContacts();
  return data as ContactStatus;
}

export async function answerContact(id: string, accept: boolean) {
  const { error } = await supabase.rpc('contact_answer', { other: id, accept });
  if (error) fail(error.message);
  await refreshContacts();
}

/** Kontakt entfernen oder eigene Anfrage zurückziehen */
export async function removeContact(id: string) {
  const { error } = await supabase.rpc('contact_remove', { other: id });
  if (error) fail(error.message);
  await refreshContacts();
}
