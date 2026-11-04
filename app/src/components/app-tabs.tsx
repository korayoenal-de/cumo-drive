import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useRide, type RideState } from '@/lib/group/ride';

/**
 * Die vier Tabs als native iOS Tab Leiste (ab iOS 26 aus Liquid Glass, wird beim Scrollen kleiner).
 * Läuft eine Gruppenfahrt, zeigt die Zusatzleiste über den Tabs ihren Stand, wie der Mini Player in Apple Music.
 */
export default function AppTabs() {
  const ride = useRide();
  const active = ride.status === 'aktiv' || ride.status === 'verbinde';
  return (
    <NativeTabs
      backgroundColor={Colors.ground}
      shadowColor="transparent"
      indicatorColor={Colors.surface2}
      tintColor={Colors.signal}
      minimizeBehavior="onScrollDown"
      iconColor={{ default: Colors.muted, selected: Colors.text }}
      labelStyle={{
        default: { color: Colors.muted, fontFamily: Fonts.medium },
        selected: { color: Colors.text, fontFamily: Fonts.semibold },
      }}>
      {active && (
        <NativeTabs.BottomAccessory>
          <RideAccessory ride={ride} />
        </NativeTabs.BottomAccessory>
      )}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Entdecken</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="safari" md="explore" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="planen">
        <NativeTabs.Trigger.Label>Planen</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="point.topleft.down.to.point.bottomright.curvepath" md="route" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="gruppe">
        <NativeTabs.Trigger.Label>Gruppe</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="mic" md="mic" />
        {active && ride.members.length > 0 && <NativeTabs.Trigger.Badge>{String(ride.members.length)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="garage">
        <NativeTabs.Trigger.Label>Garage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="car" md="directions_car" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/** Inhalt der Zusatzleiste: Gruppenfahrt mit Anzahl Fahrer und letzter Kurznachricht. Tippen öffnet den Tab Gruppe. */
function RideAccessory({ ride }: { ride: RideState }) {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const n = ride.members.length;
  const last = ride.messages[0];
  const title = ride.status === 'verbinde' ? 'Gruppe verbindet' : `Gruppenfahrt, ${n} ${n === 1 ? 'Fahrer' : 'Fahrer'}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, Gruppe öffnen`} onPress={() => router.navigate('/gruppe')} style={styles.row}>
      <View style={styles.dot} />
      <View style={styles.flex}>
        <AppText style={styles.title} numberOfLines={1}>
          {title}
        </AppText>
        {placement === 'regular' && (
          <AppText variant="caption" muted numberOfLines={1}>
            {last ? `${last.name}: ${last.text}` : `Code ${ride.code?.toUpperCase() ?? ''}`}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingHorizontal: Spacing.l },
  flex: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.good },
  title: { fontFamily: Fonts.semibold, fontSize: 14 },
});
