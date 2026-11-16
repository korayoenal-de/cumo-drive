/**
 * Tab Bereich mit der Tableiste von iOS (Koray 15.11.): echte Glaslinse beim Wechsel, wie andere Apps.
 * Die Leiste bleibt immer voll stehen (minimizeBehavior "never"); das Verkleinern beim Scrollen entfällt.
 * Vorher eigene Leiste (components/app-tabs.tsx), weil die Systemleiste beim Scrollen auf ein Symbol schrumpft.
 *
 * Symbole: unsere eigenen (components/ui/tab-icons.tsx) als Bilder in assets/tabs, von iOS eingefärbt.
 * Neue Nachrichten und Einladungen als Plakette am Community Tab, die laufende Gruppenfahrt als Zeile über der
 * Leiste (bottom accessory, wie der Mini Player in Apple Music).
 */
import { Slot, router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useInviteCount, useInvitesWatcher } from '@/components/group/invites-banner';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useUnreadMessages, useUnreadWatcher } from '@/lib/drivers';
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
  const unread = useUnreadMessages() + useInviteCount();
  const ride = useRide();
  const riding = ride.status === 'aktiv' || ride.status === 'verbinde';
  return (
    <NativeTabs
      minimizeBehavior="never"
      tintColor={Colors.text}
      iconColor={{ default: Colors.muted, selected: Colors.text }}
      labelStyle={{ default: { color: Colors.muted }, selected: { color: Colors.text } }}
      badgeBackgroundColor={Colors.signal}>
      {riding && (
        <NativeTabs.BottomAccessory>
          <RideAccessory ride={ride} />
        </NativeTabs.BottomAccessory>
      )}
      {/* eigene Abstände der Ansichten bleiben (Screen, MapSheet), darum keine automatischen Einzüge */}
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/planen.png'), selected: require('../../../assets/tabs/planen-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('Planen')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="touren" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/touren.png'), selected: require('../../../assets/tabs/touren-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('Touren')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/community.png'), selected: require('../../../assets/tabs/community-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('Community')}</NativeTabs.Trigger.Label>
        {/* ohne Neues gar keine Plakette (Koray 15.11.: "hidden" zeigte trotzdem eine 0) */}
        {unread > 0 && <NativeTabs.Trigger.Badge>{unread > 9 ? '9+' : String(unread)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="einstellungen" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon src={{ default: require('../../../assets/tabs/einstellungen.png'), selected: require('../../../assets/tabs/einstellungen-on.png') }} renderingMode="template" />
        <NativeTabs.Trigger.Label>{t('Einstellungen')}</NativeTabs.Trigger.Label>
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
