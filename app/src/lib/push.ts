/**
 * Push Benachrichtigungen. Die echte Umsetzung liegt in push-native.ts und braucht das native Paket
 * expo-notifications (ab Build 18). Ältere Builds bekommen dieselben JS Updates; dort fehlt das Modul,
 * dann tun diese Funktionen nichts, statt die App beim Start abstürzen zu lassen.
 */
import * as ExpoModules from 'expo-modules-core';

import type * as Native from './push-native';

export type PushStatus = 'an' | 'aus' | 'offen' | 'nicht';

// In Tests ohne native Umgebung fehlt requireOptionalNativeModule ganz
const hasNative = typeof ExpoModules.requireOptionalNativeModule === 'function' && !!ExpoModules.requireOptionalNativeModule('ExpoPushTokenManager');
const impl: typeof Native | null = hasNative
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./push-native') as typeof Native)
  : null;

export const setOpenChat: typeof Native.setOpenChat = (key) => impl?.setOpenChat(key);
export const pushStatus: typeof Native.pushStatus = async () => (impl ? impl.pushStatus() : 'nicht');
export const enablePush: typeof Native.enablePush = (ask) => (impl ? impl.enablePush(ask) : Promise.resolve(false));
export const forgetPush: typeof Native.forgetPush = async () => {
  if (impl) await impl.forgetPush();
};
export const PushHandler: typeof Native.PushHandler = (props) => (impl ? impl.PushHandler(props) : null);
