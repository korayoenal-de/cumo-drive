/**
 * Push Benachrichtigungen (Koray 10.11.): neue private Nachricht, neue Nachricht im Chat einer Ausfahrt,
 * Einladung, Anfrage und Antwort. Verschickt werden sie von der Edge Function notify
 * (supabase/functions/notify), ausgelöst von Triggern in der Datenbank.
 *
 * Die App fragt erst nach der Erlaubnis, wenn es Sinn hat: beim Öffnen der Nachrichten, beim Einschalten
 * von „Andere dürfen mich anschreiben“ oder über den Knopf in den Einstellungen, nie beim Start.
 * Ist die Erlaubnis schon da, meldet sie den Expo Push Token bei jedem Start still im Konto an.
 * Tippen auf eine Mitteilung öffnet die Unterhaltung; ist genau diese Unterhaltung offen, erscheint keine.
 * Die Zahl am App Symbol folgt den ungelesenen privaten Nachrichten.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { refreshUnread, useUnreadMessages } from './drivers';
import { supabase } from './supabase';

const TOKEN_KEY = 'cumo.push-token';
/** Nur Ziele in der App, die eine Mitteilung öffnen darf */
const SAFE_URL = /^\/(nachrichten\/[0-9a-f-]{36}|ausfahrt\/[0-9a-f-]{36}|ausfahrt\/chat\?id=[0-9a-f-]{36})?$/i;

export type PushStatus = 'an' | 'aus' | 'offen' | 'nicht';
type PushData = { url?: unknown; chat?: unknown; type?: unknown };

const native = () => Platform?.OS === 'ios' || Platform?.OS === 'android';

// Offene Unterhaltung -----------------------------------------------------------------------------

/** 'dm:<partner>' oder 'ride:<ausfahrt>', solange diese Unterhaltung im Vordergrund offen ist */
let openChat: string | null = null;

export function setOpenChat(key: string | null) {
  openChat = key;
}

// Erlaubnis und Token -----------------------------------------------------------------------------

export async function pushStatus(): Promise<PushStatus> {
  if (!native() || !Device.isDevice) return 'nicht';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'an';
    return p.canAskAgain ? 'offen' : 'aus';
  } catch {
    return 'nicht';
  }
}

let registeredFor: string | null = null;
let pending: Promise<boolean> | null = null;

/**
 * Mitteilungen einschalten: mit ask fragt iOS einmalig nach der Erlaubnis (danach nicht mehr),
 * ohne ask wird nur ein schon erlaubter Token angemeldet. true, wenn das Gerät angemeldet ist.
 */
export function enablePush(ask: boolean): Promise<boolean> {
  if (!native()) return Promise.resolve(false);
  if (pending) return pending.then((ok) => (ok || !ask ? ok : enablePush(true)));
  pending = register(ask).finally(() => {
    pending = null;
  });
  return pending;
}

async function register(ask: boolean): Promise<boolean> {
  try {
    if (!Device.isDevice) return false;
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return false;
    if (registeredFor === uid) return true;
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    }
    if (!perm.granted && perm.ios?.status !== IosAuthorizationStatus.PROVISIONAL) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Nachrichten', importance: AndroidImportance.HIGH, lightColor: '#E2461C' });
    }
    const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return false;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) return false;
    registeredFor = uid;
    await AsyncStorage.setItem(TOKEN_KEY, token);
    void refreshUnread();
    return true;
  } catch {
    // ohne Netz oder ohne APNs: beim nächsten Start nochmal
    return false;
  }
}

/** Vor dem Abmelden: Token aus dem Konto nehmen, damit das Gerät keine Mitteilungen mehr fürs alte Konto bekommt. */
export async function forgetPush() {
  registeredFor = null;
  if (!native()) return;
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Abmelden geht trotzdem; meldet sich ein anderes Konto an, übernimmt es den Token
  }
}

// Empfang und Tippen ------------------------------------------------------------------------------

let handlerSet = false;
function setHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const d = (n.request.content.data ?? {}) as PushData;
      if (d.type === 'dm') void refreshUnread();
      // Unterhaltung ist offen: die Nachricht steht schon da, keine Mitteilung
      const hide = typeof d.chat === 'string' && d.chat === openChat;
      return { shouldShowBanner: !hide, shouldShowList: !hide, shouldPlaySound: !hide, shouldSetBadge: false };
    },
  });
}

const handled = new Set<string>();
function open(r: Notifications.NotificationResponse | null) {
  if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const key = r.notification.request.identifier;
  if (handled.has(key)) return;
  handled.add(key);
  void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  const url = (r.notification.request.content.data as PushData | undefined)?.url;
  if (typeof url !== 'string' || !SAFE_URL.test(url)) return;
  try {
    router.push(url as Href);
  } catch {
    // Navigation noch nicht bereit
  }
}

/**
 * In der Wurzel der App (unter dem Stack): Token still anmelden, Mitteilungen im Vordergrund steuern,
 * Tippen auf eine Mitteilung öffnet ihr Ziel (auch beim Kaltstart), App Symbol zeigt ungelesene Nachrichten.
 */
export function PushHandler({ userId }: { userId: string | undefined }): null {
  const unread = useUnreadMessages();

  useEffect(() => {
    if (!native()) return;
    setHandler();
    let alive = true;
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (alive) open(r);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (userId) void enablePush(false);
  }, [userId]);

  useEffect(() => {
    if (!native() || !userId) return;
    void Notifications.setBadgeCountAsync(unread).catch(() => undefined);
  }, [unread, userId]);

  return null;
}
