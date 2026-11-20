/**
 * Tab Bereich mit der Tableiste von iOS (Koray 15.11.): echte Glaslinse beim Wechsel, wie andere Apps.
 * Die Leiste bleibt immer voll stehen (minimizeBehavior "never"); das Verkleinern beim Scrollen entfällt.
 * Vorher eigene Leiste (components/app-tabs.tsx), weil die Systemleiste beim Scrollen auf ein Symbol schrumpft.
 *
 * Symbole: unsere eigenen (components/ui/tab-icons.tsx) als Bilder in assets/tabs, von iOS eingefärbt.
 * Neue Nachrichten und Einladungen als Plakette am Community Tab, die laufende Gruppenfahrt als Zeile über der
 * Leiste (bottom accessory, wie der Mini Player in Apple Music). Ohne Gruppenfahrt steht dort ab 24 Stunden vorher
 * die nächste Ausfahrt (Ausfahrt im Fokus, 20.11.2026).
 */
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Slot, router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';

import { AusfahrtBar, useAusfahrtBar } from '@/components/group/ausfahrt-bar';
import { useInviteCount, useInvitesWatcher } from '@/components/group/invites-banner';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useUnreadMessages, useUnreadSplit, useUnreadWatcher } from '@/lib/drivers';
import { useFresh } from '@/lib/fly';
import { useRide, type RideState } from '@/lib/group/ride';
import { t } from '@/i18n';

export default function TabsLayout() {
  // Im Browser ohne Tableiste: dort steht unter / die Landingpage
  if (Platform.OS === 'web') return <Slot />;
  return <IosTabs />;
}

function IosTabs() {
  useUnreadWatcher(useSession()?.user.id);
  useInvitesWatcher();
  const messages = useUnreadMessages();
  const invites = useInviteCount();
  // Plaketten je Tab (20.11.2026): Ausfahrten zählt Einladungen, Chats der Ausfahrten und Neues dort, Community die
  // privaten Nachrichten und Neues dort
  const split = useUnreadSplit();
  const unread = split.direct + useFresh('community');
  const rideBadge = split.ride + invites + useFresh('ausfahrten');
  // Zahl am App Symbol wie bei anderen Apps (Koray 20.11.2026): ungelesene Nachrichten (auch Chats der Ausfahrten,
  // dort landet seitdem auch das Anpingen) und offene Einladungen. Ohne Erlaubnis für Mitteilungen bleibt sie aus.
  useEffect(() => {
    void Notifications.setBadgeCountAsync(messages + invites).catch(() => undefined);
  }, [messages, invites]);
  // Neu in Touren (gespeichert, gemerkt, gefahren), bis der Tab geöffnet wird (Aktionen mit Ziel, 17.11.)
  const freshTours = useFresh('touren');
  const ride = useRide();
  const riding = ride.status === 'aktiv' || ride.status === 'verbinde';
  // Ausfahrt im Fokus (Koray 20.11.2026): die nächste Ausfahrt ab 24 Stunden vorher; die laufende Gruppenfahrt geht vor
  const bar = useAusfahrtBar();
  return (
    <NativeTabs
      minimizeBehavior="never"
      tintColor={Colors.text}
      iconColor={{ default: Colors.muted, selected: Colors.text }}
      labelStyle={{ default: { color: Colors.muted }, selected: { color: Colors.text } }}
      badgeBackgroundColor={Colors.signal}>
      {riding ? (
        <NativeTabs.BottomAccessory>
          <RideAccessory ride={ride} />
        </NativeTabs.BottomAccessory>
      ) : bar ? (
        <NativeTabs.BottomAccessory>
          <AusfahrtBar state={bar} />
        </NativeTabs.BottomAccessory>
      ) : null}
      {/* eigene Abstände der Ansichten bleiben (Screen, MapSheet), darum keine automatischen Einzüge */}
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets accessibilityLabel={t('Planen')}>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/planen.png'), selected: require('../../../assets/tabs/planen-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden>{t('Planen')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="touren" disableAutomaticContentInsets accessibilityLabel={t('Touren')}>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/touren.png'), selected: require('../../../assets/tabs/touren-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden>{t('Touren')}</NativeTabs.Trigger.Label>
        {freshTours > 0 && <NativeTabs.Trigger.Badge>{freshTours > 9 ? '9+' : String(freshTours)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ausfahrten" disableAutomaticContentInsets accessibilityLabel={t('Ausfahrten')}>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/ausfahrten.png'), selected: require('../../../assets/tabs/ausfahrten-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden>{t('Ausfahrten')}</NativeTabs.Trigger.Label>
        {rideBadge > 0 && <NativeTabs.Trigger.Badge>{rideBadge > 9 ? '9+' : String(rideBadge)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community" disableAutomaticContentInsets accessibilityLabel={t('Community')}>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/community.png'), selected: require('../../../assets/tabs/community-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden>{t('Community')}</NativeTabs.Trigger.Label>
        {/* ohne Neues gar keine Plakette (Koray 15.11.: "hidden" zeigte trotzdem eine 0) */}
        {unread > 0 && <NativeTabs.Trigger.Badge>{unread > 9 ? '9+' : String(unread)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="einstellungen" disableAutomaticContentInsets accessibilityLabel={t('Einstellungen')}>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/einstellungen.png'), selected: require('../../../assets/tabs/einstellungen-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label hidden>{t('Einstellungen')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/** Gruppenfahrt läuft: Zeile über der Leiste. Tippen öffnet die Gruppenfahrt. */
function RideAccessory({ ride }: { ride: RideState }) {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const n = ride.members.length;
  const last = ride.messages[0];
  const title = ride.status === 'verbinde' ? t('Gruppe verbindet') : t('Gruppenfahrt, {n} Fahrer', { n });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('{title}, Gruppe öffnen', { title })} onPress={() => router.push('/gruppe')} style={styles.accessory}>
      <View style={styles.dot} />
      <View style={styles.flex}>
        <AppText style={styles.title} numberOfLines={1}>
          {title}
        </AppText>
        {placement === 'regular' && (
          <AppText variant="caption" muted numberOfLines={1}>
            {last ? `${last.name}: ${last.text}` : (ride.name ?? t('Live auf der Karte'))}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accessory: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingHorizontal: Spacing.l },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.good },
  title: { fontFamily: Fonts.semibold, fontSize: Type.small },
});
