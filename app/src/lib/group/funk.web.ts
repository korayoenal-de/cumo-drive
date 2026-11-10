/** Funk gibt es nur in der App; im Web Planer tun diese Funktionen nichts. */
import { useSyncExternalStore } from 'react';

export type FunkStatus = 'nicht' | 'aus' | 'verbinde' | 'an' | 'getrennt' | 'fehler';
export type FunkState = { status: FunkStatus; talking: boolean; waiting: boolean; speaker: { id: string; name: string } | null; listen: boolean; onlyLead: boolean; error: string | null };

const state: FunkState = { status: 'nicht', talking: false, waiting: false, speaker: null, listen: true, onlyLead: false, error: null };

export const funkAvailable = () => false;
export async function connectFunk(_rideId: string, _lead: boolean) {}
export async function disconnectFunk() {}
export function pushToTalk(_on: boolean) {}
export function setFunkListen(_on: boolean) {}
export function setOnlyLead(_on: boolean) {}
export function useFunk(): FunkState {
  return useSyncExternalStore(
    () => () => undefined,
    () => state,
    () => state,
  );
}
