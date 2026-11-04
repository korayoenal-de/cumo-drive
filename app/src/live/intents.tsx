/**
 * Empfängt Siri und Kurzbefehle (app-intents/CumoIntents.swift) und führt sie in der App aus.
 * Nur iOS; fehlt das native Modul, passiert nichts.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getActiveTour } from '@/lib/active-tour';
import { QUICK_MESSAGES, rideState, sendMessage } from '@/lib/group/ride';

type Invocation = { id: string; name: string; params: Record<string, unknown> };
type IntentsMod = {
  isAvailable: () => boolean;
  getPendingInvocationsAsync: () => Promise<Invocation[]>;
  removePendingInvocationAsync: (id: string) => Promise<void>;
  addAppIntentListener: (l: (i: Invocation) => void) => { remove: () => void };
};

let mod: IntentsMod | null | undefined;
function getMod(): IntentsMod | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-app-intents') as IntentsMod;
    if (m.isAvailable()) mod = m;
  } catch {
    mod = null;
  }
  return mod;
}

const MESSAGE_TEXT: Record<string, string> = {
  warten: QUICK_MESSAGES[0],
  ok: QUICK_MESSAGES[1],
  tanken: QUICK_MESSAGES[2],
  pause: QUICK_MESSAGES[3],
  polizei: QUICK_MESSAGES[4],
  panne: QUICK_MESSAGES[5],
};

const handled = new Set<string>();

function run(inv: Invocation) {
  if (inv.name === 'startTour') {
    router.navigate(getActiveTour() ? '/navigation' : '/');
  } else if (inv.name === 'planRound') {
    router.navigate('/');
  } else if (inv.name === 'groupMessage') {
    const text = MESSAGE_TEXT[String(inv.params.message)];
    if (text && rideState().status === 'aktiv') sendMessage(text);
    else router.navigate('/gruppe');
  }
}

/** Einmal im Root Layout einhängen. */
export function AppIntentHandler() {
  useEffect(() => {
    const m = getMod();
    if (!m) return;
    const take = async (inv: Invocation) => {
      if (handled.has(inv.id)) return;
      handled.add(inv.id);
      try {
        run(inv);
      } finally {
        await m.removePendingInvocationAsync(inv.id).catch(() => undefined);
      }
    };
    m.getPendingInvocationsAsync()
      .then((list) => list.forEach((i) => void take(i)))
      .catch(() => undefined);
    const sub = m.addAppIntentListener((i) => void take(i));
    return () => sub.remove();
  }, []);
  return null;
}
