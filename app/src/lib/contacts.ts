/**
 * Kontakte unter Drivers (TestFlight Review, Koray 13.11.): Anfrage schicken, die andere Person bestätigt.
 * Kontakte stehen beim Einladen zu Gruppenfahrten oben. Ein gemeinsamer Speicher für alle Bildschirme,
 * gelesen über useSyncExternalStore (der React Compiler friert sonst modulweite Werte ein).
 * Tabellen und Funktionen aus supabase/migrations/20261113200000_kontakte.sql.
 */
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';
import { tr } from '@/i18n';

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
  throw new Error(/^[A-ZÄÖÜ][^\n]*$/.test(message) && !/violat|permission|function|relation|column|JWT/i.test(message) ? message : tr('Das hat nicht geklappt. Bitte nochmal versuchen.'));
}

/** Kontakte neu laden (beim Öffnen von Drivers und nach jeder Änderung) */
export function refreshContacts(): Promise<void> {
  if (loading) return loading;
  const mine: Promise<void> = (async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return set([]);
      const { data, error } = await supabase.rpc('my_contacts');
      if (error) return;
      set(((data ?? []) as { id: string; display_name: string; car: string | null; status: ContactStatus }[]).map((r) => ({ id: r.id, name: r.display_name, car: r.car, status: r.status })));
    } finally {
      if (loading === mine) loading = null;
    }
  })();
  loading = mine;
  // Hängt der Abruf, gibt er den Platz nach 25 s frei; sonst bekäme jeder spätere Aufruf denselben hängenden Abruf zurück
  setTimeout(() => {
    if (loading === mine) loading = null;
  }, 25_000);
  return mine;
}

/** Alle Kontakte und Anfragen; null, solange noch nicht geladen */
export function useContacts(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Status eines Fahrers sofort im Speicher setzen (null: keine Beziehung), ohne auf den Server zu warten */
function patch(id: string, status: ContactStatus | null) {
  const byId = new Map(state.byId);
  if (status) byId.set(id, status);
  else byId.delete(id);
  const list = state.list ? (status ? state.list.map((c) => (c.id === id ? { ...c, status } : c)) : state.list.filter((c) => c.id !== id)) : state.list;
  state = { list, byId };
  subs.forEach((f) => f());
}

/**
 * Nach einer Änderung frisch laden. refreshContacts teilt sich einen laufenden Abruf; lief der schon vor der Änderung
 * los, kam die alte Liste zurück und der Knopf sprang auf das Plus zurück (Koray 18.11.: „Anfrage geht nicht durch").
 * Darum erst den laufenden Abruf abwarten, dann neu laden. Im Hintergrund: der Knopf zeigt den neuen Stand schon.
 */
function reloadAfterChange() {
  void (loading ?? Promise.resolve()).then(() => refreshContacts()).catch(() => {});
}

/**
 * Eine Änderung sofort zeigen und danach bestätigen lassen (Prinzip 8: erst zeigen, dann laden). Schlägt der Server
 * fehl, steht wieder der alte Stand da und der Aufrufer bekommt den Fehler.
 */
async function change<T>(id: string, shown: ContactStatus | null, run: () => Promise<T>, settled?: (r: T) => ContactStatus | null): Promise<T> {
  const before = state.byId.get(id) ?? null;
  const listBefore = state.list;
  patch(id, shown);
  try {
    const r = await run();
    if (settled) patch(id, settled(r));
    reloadAfterChange();
    return r;
  } catch (e) {
    state = { list: listBefore, byId: new Map(state.byId) };
    if (before) state.byId.set(id, before);
    else state.byId.delete(id);
    subs.forEach((f) => f());
    throw e;
  }
}

/** Zu Kontakten hinzufügen. Hat die andere Person schon gefragt, seid ihr sofort Kontakte. */
export async function requestContact(id: string): Promise<ContactStatus> {
  const waiting = state.byId.get(id) === 'anfrage';
  return change(
    id,
    waiting ? 'kontakt' : 'angefragt',
    async () => {
      const { data, error } = await supabase.rpc('contact_request', { other: id });
      if (error) fail(error.message);
      return data as ContactStatus;
    },
    (now) => now,
  );
}

export async function answerContact(id: string, accept: boolean) {
  await change(id, accept ? 'kontakt' : null, async () => {
    const { error } = await supabase.rpc('contact_answer', { other: id, accept });
    if (error) fail(error.message);
  });
}

/** Kontakt entfernen oder eigene Anfrage zurückziehen */
export async function removeContact(id: string) {
  await change(id, null, async () => {
    const { error } = await supabase.rpc('contact_remove', { other: id });
    if (error) fail(error.message);
  });
}
