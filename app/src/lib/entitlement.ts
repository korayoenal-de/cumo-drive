/**
 * Mitgliedschaft: ob das Konto gerade alles nutzen darf (Testphase, eigener Plan oder Club).
 * Die Wahrheit liegt im Backend (Funktion my_entitlement in Supabase). Hier wird sie nach der
 * Anmeldung und bei jeder Rückkehr in die App geladen und im Speicher gehalten.
 * Ohne Netz sperren wir niemanden aus: dann gilt der zuletzt bekannte Stand, beim allerersten
 * Laden ohne Netz bleibt die App offen.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

export type EntitlementSource = 'test' | 'plan' | 'club';

export type Entitlement = {
  /** true, bis der erste Stand für das angemeldete Konto da ist */
  loading: boolean;
  active: boolean;
  source: EntitlementSource;
  /** Ende der Testphase, des Plans oder des Clubs */
  until: Date | null;
  /** volle verbleibende Tage, aufgerundet, nie unter 0 */
  daysLeft: number;
  /** größte Gruppe, die dieses Konto anlegen darf */
  maxVehicles: number;
  clubName: string | null;
};

export type PlanId = 'jahr' | 'monat' | 'woche' | 'saison';

export type Price = {
  id: PlanId;
  name: string;
  /** Preis in Euro */
  amount: number;
  priceText: string;
  /** wofür der Preis gilt, für die Karte */
  periodText: string;
  /** umgerechnet pro Monat, nur wo es hilft */
  perMonthText: string | null;
  /** verlängert sich automatisch (Abo) oder läuft einfach aus */
  renews: boolean;
  /** Laufzeit in Tagen */
  days: number;
  highlight: boolean;
};

/** Private Pläne, Reihenfolge wie auf der Paywall. Gruppen privat bis 6 Fahrzeuge. */
export const PRICES: Price[] = [
  { id: 'jahr', name: 'Jahr', amount: 59.99, priceText: '59,99 €', periodText: 'pro Jahr', perMonthText: '5,00 € im Monat', renews: true, days: 365, highlight: true },
  { id: 'monat', name: 'Monat', amount: 14.99, priceText: '14,99 €', periodText: 'pro Monat', perMonthText: null, renews: true, days: 30, highlight: false },
  { id: 'woche', name: 'Woche', amount: 6.99, priceText: '6,99 €', periodText: 'pro Woche', perMonthText: null, renews: true, days: 7, highlight: false },
  { id: 'saison', name: 'Saison Pass', amount: 39, priceText: '39 €', periodText: 'einmalig für 6 Monate', perMonthText: null, renews: false, days: 183, highlight: false },
];

/** Club Angebote laufen auf Rechnung außerhalb der App und werden vom Betreiber zugewiesen. */
export const CLUB_OFFERS = [
  { id: 'club_s', name: 'Club S', priceText: '490 € pro Jahr', maxVehicles: 12 },
  { id: 'club_l', name: 'Club L', priceText: '890 € pro Jahr', maxVehicles: 20 },
  { id: 'event', name: 'Event Pass', priceText: '149 € für eine Tour, 7 Tage', maxVehicles: 20 },
] as const;

export const CONTACT_EMAIL = 'kontakt@rallycumo.de';

/** Private Gruppen: so viele Fahrzeuge gehen ohne Club */
export const PRIVATE_MAX_VEHICLES = 6;

const DAY = 24 * 60 * 60 * 1000;

const LOADING: Entitlement = { loading: true, active: true, source: 'test', until: null, daysLeft: 0, maxVehicles: PRIVATE_MAX_VEHICLES, clubName: null };
const SIGNED_OUT: Entitlement = { loading: false, active: false, source: 'test', until: null, daysLeft: 0, maxVehicles: 0, clubName: null };
/** Erstes Laden ohne Netz: offen lassen, beim nächsten Fokus wird neu gefragt */
const OFFLINE_OPEN: Entitlement = { ...LOADING, loading: false };

let state: Entitlement = SIGNED_OUT;
let userId: string | null = null;
let started = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Entitlement) {
  state = next;
  for (const l of listeners) l();
}

type Raw = { active?: boolean; source?: string; until?: string | null; max_vehicles?: number; club_name?: string | null };

function parse(raw: Raw): Entitlement {
  const until = raw.until ? new Date(raw.until) : null;
  const source: EntitlementSource = raw.source === 'plan' || raw.source === 'club' ? raw.source : 'test';
  return {
    loading: false,
    active: !!raw.active,
    source,
    until,
    daysLeft: until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / DAY)) : 0,
    maxVehicles: typeof raw.max_vehicles === 'number' ? raw.max_vehicles : 0,
    clubName: raw.club_name ?? null,
  };
}

/** Stand neu vom Backend holen, zum Beispiel nach einem Kauf oder einer Club Zuweisung. */
export function refreshEntitlement(): Promise<void> {
  start();
  if (!userId) {
    set(SIGNED_OUT);
    return Promise.resolve();
  }
  if (inflight) return inflight;
  const forUser = userId;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('my_entitlement');
      if (forUser !== userId) return;
      if (error || !data) throw error ?? new Error('leer');
      set(parse(data as Raw));
    } catch {
      // Netz weg oder Backend nicht erreichbar: alten Stand behalten, sonst offen lassen
      if (forUser === userId && state.loading) set(OFFLINE_OPEN);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function onUser(id: string | null) {
  if (id === userId) return;
  userId = id;
  inflight = null;
  if (!id) {
    set(SIGNED_OUT);
    return;
  }
  set(LOADING);
  void refreshEntitlement();
}

function start() {
  if (started) return;
  started = true;
  supabase.auth
    .getSession()
    .then(({ data }) => onUser(data.session?.user.id ?? null))
    .catch(() => {});
  supabase.auth.onAuthStateChange((_e, s) => onUser(s?.user.id ?? null));
  // Bei jeder Rückkehr in die App neu fragen (Testphase kann inzwischen abgelaufen sein)
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && userId) void refreshEntitlement();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  start();
  return () => {
    listeners.delete(l);
  };
}

export function useEntitlement(): Entitlement {
  return useSyncExternalStore(subscribe, () => state, () => SIGNED_OUT);
}

/** Aktueller Stand ohne Hook, etwa für Logik außerhalb von Komponenten. */
export function getEntitlement(): Entitlement {
  start();
  return state;
}

/**
 * Wie viele Fahrzeuge eine Gruppe dieses Kontos haben darf: Club bis 12 oder 20, privat bis 6.
 * Solange der Stand lädt oder unbekannt ist, gilt die private Grenze.
 */
export function maxGroupVehicles(e: Entitlement = getEntitlement()): number {
  if (e.loading || e.maxVehicles <= 0) return PRIVATE_MAX_VEHICLES;
  return e.maxVehicles;
}

/** Datum kurz auf Deutsch, zum Beispiel 19.11.2026 */
export function formatUntil(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
