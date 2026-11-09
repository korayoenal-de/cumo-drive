/**
 * Garage: mehrere Fahrzeuge mit Modell, Breite, Bodenfreiheit, Reichweite und Sprit.
 * Liegt auf dem Gerät und, wenn angemeldet, im Profil (profiles.vehicles), dazu das Hauptfahrzeug
 * als profiles.car, damit die Gruppe sieht, wer was fährt. Pro Fahrt wählt man das Fahrzeug,
 * die gefahrenen Kilometer landen dann bei diesem Fahrzeug.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

export type Fuel = 'super_plus' | 'super' | 'diesel' | 'elektro';

export type Vehicle = {
  id: string;
  /** Marke, etwa Porsche (seit 9.11. eigenes Feld) */
  brand?: string;
  model: string;
  /** Breite ohne Spiegel in Metern */
  widthM: number | null;
  /** Bodenfreiheit in Zentimetern */
  clearanceCm: number | null;
  /** Reichweite mit vollem Tank in Kilometern */
  rangeKm: number | null;
  fuel: Fuel;
  /** Symbol auf der Karte: Pfeil oder das eigene Auto (gts997 war der Test vom 6.11., gilt wie auto) */
  mapSymbol?: 'pfeil' | 'gts997' | 'auto';
  /** Form und Lackfarbe des Kartensymbols (components/map/car-sprite.tsx) */
  look?: { form: 'coupe' | 'coupe-fluegel' | 'cabrio' | 'fastback' | 'limousine' | 'gelaende'; color: string };
};

export const FUELS: { id: Fuel; label: string }[] = [
  { id: 'super_plus', label: 'Super Plus' },
  { id: 'super', label: 'Super' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'elektro', label: 'Elektro' },
];

export const newVehicle = (): Vehicle => ({ id: Math.random().toString(36).slice(2, 10), model: '', widthM: null, clearanceCm: null, rangeKm: null, fuel: 'super_plus' });

type Garage = { list: Vehicle[]; /** Fahrzeug für die nächste Fahrt */ currentId: string | null; updatedAt: number };

const KEY = 'cumo.drive.garage.v2';
const OLD_KEY = 'cumo.drive.fahrzeug.v1';
let state: Garage = { list: [], currentId: null, updatedAt: 0 };
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw) as Garage;
    else {
      // altes Einzelprofil übernehmen
      const old = await AsyncStorage.getItem(OLD_KEY);
      if (old) {
        const v = { ...newVehicle(), ...(JSON.parse(old) as Partial<Vehicle>) };
        if (v.model.trim()) state = { list: [v], currentId: v.id, updatedAt: Date.now() };
      }
    }
    emit();
  } catch {
    // ohne Speicher bleibt die Garage leer
  }
}

function useGarage(): Garage {
  void load();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
}

export function useVehicles(): { list: Vehicle[]; current: Vehicle | null } {
  const g = useGarage();
  return { list: g.list, current: g.list.find((v) => v.id === g.currentId) ?? g.list[0] ?? null };
}

/** Fahrzeug, das gerade gewählt ist (für Tankstopps nach Reichweite und das Speichern der Fahrt). */
export function currentVehicle(): Vehicle | null {
  return state.list.find((v) => v.id === state.currentId) ?? state.list[0] ?? null;
}

async function persist(next: Garage, push = true) {
  state = next;
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // nur Komfort
  }
  if (!push) return;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const main = next.list.find((v) => v.id === next.currentId) ?? next.list[0];
    await supabase.from('profiles').upsert({ id: data.user.id, vehicles: next.list, car: main?.model.trim().slice(0, 80) || null });
  } catch {
    // Konto ist optional
  }
}

export async function saveVehicle(v: Vehicle) {
  await load();
  const exists = state.list.some((x) => x.id === v.id);
  const list = exists ? state.list.map((x) => (x.id === v.id ? v : x)) : [...state.list, v];
  await persist({ list, currentId: state.currentId ?? v.id, updatedAt: Date.now() });
}

export async function deleteVehicle(id: string) {
  await load();
  const list = state.list.filter((x) => x.id !== id);
  await persist({ list, currentId: state.currentId === id ? (list[0]?.id ?? null) : state.currentId, updatedAt: Date.now() });
}

export async function selectVehicle(id: string) {
  await load();
  if (state.currentId === id) return;
  await persist({ ...state, currentId: id, updatedAt: Date.now() });
}

/** Nach der Anmeldung: Fahrzeuge aus dem Konto holen und mit denen auf dem Gerät zusammenführen. */
export async function syncVehicles() {
  await load();
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from('profiles').select('vehicles').eq('id', u.user.id).maybeSingle();
    const remote = ((data as { vehicles?: Vehicle[] } | null)?.vehicles ?? []).filter((v) => v && v.id);
    const ids = new Set(state.list.map((v) => v.id));
    const merged = [...state.list, ...remote.filter((v) => !ids.has(v.id))];
    const changed = merged.length !== state.list.length || remote.length !== merged.length;
    await persist({ ...state, list: merged, currentId: state.currentId ?? merged[0]?.id ?? null }, changed);
  } catch {
    // Konto ist optional
  }
}

/** Kurzbeschreibung für Listen, zum Beispiel "1,85 m breit, 10 cm Bodenfreiheit, Super Plus". */
/** Marke und Modell zusammen, ohne doppelte Marke (ältere Einträge haben sie im Modell) */
export function vehicleName(v: Vehicle): string {
  const b = (v.brand ?? '').trim();
  const m = v.model.trim();
  return b && !m.toLowerCase().startsWith(b.toLowerCase()) ? `${b} ${m}`.trim() : m || b;
}

export function vehicleSummary(v: Vehicle, withModel = true): string {
  // Sprit wird seit 9.11. nicht mehr gewählt und nicht mehr angezeigt
  return withModel ? vehicleName(v) : '';
}
