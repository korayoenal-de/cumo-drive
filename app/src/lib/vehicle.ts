/**
 * Fahrzeugprofil: Modell, Breite, Bodenfreiheit, Reichweite und Sprit. Liegt lokal auf dem Gerät
 * und, wenn angemeldet, als Modellname im Konto (profiles.car), damit die Gruppe das Auto sieht.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

export type Fuel = 'super_plus' | 'super' | 'diesel' | 'elektro';

export type Vehicle = {
  model: string;
  /** Breite ohne Spiegel in Metern */
  widthM: number | null;
  /** Bodenfreiheit in Zentimetern */
  clearanceCm: number | null;
  /** Reichweite mit vollem Tank in Kilometern */
  rangeKm: number | null;
  fuel: Fuel;
};

export const FUELS: { id: Fuel; label: string }[] = [
  { id: 'super_plus', label: 'Super Plus' },
  { id: 'super', label: 'Super' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'elektro', label: 'Elektro' },
];

export const EMPTY_VEHICLE: Vehicle = { model: '', widthM: null, clearanceCm: null, rangeKm: null, fuel: 'super_plus' };

const KEY = 'cumo.drive.fahrzeug.v1';
let state: Vehicle = EMPTY_VEHICLE;
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
    if (raw) {
      state = { ...EMPTY_VEHICLE, ...(JSON.parse(raw) as Partial<Vehicle>) };
      emit();
    }
  } catch {
    // ohne Speicher bleibt das leere Profil
  }
}

export function useVehicle(): Vehicle {
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

export async function saveVehicle(v: Vehicle) {
  state = v;
  emit();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // nur Komfort
  }
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user && v.model.trim()) await supabase.from('profiles').upsert({ id: data.user.id, car: v.model.trim().slice(0, 80) });
  } catch {
    // Konto ist optional
  }
}

/** Kurzbeschreibung für Listen, zum Beispiel "Porsche 911 GT3, 1,85 m breit, 10 cm Bodenfreiheit". */
export function vehicleSummary(v: Vehicle): string {
  const n = (x: number, d = 2) => x.toFixed(d).replace('.', ',').replace(/,?0+$/, '');
  return [
    v.model.trim() || null,
    v.widthM ? `${n(v.widthM)} m breit` : null,
    v.clearanceCm ? `${Math.round(v.clearanceCm)} cm Bodenfreiheit` : null,
    v.rangeKm ? `${Math.round(v.rangeKm)} km Reichweite` : null,
    FUELS.find((f) => f.id === v.fuel)?.label,
  ]
    .filter(Boolean)
    .join(', ');
}
