import { NativeTabs } from 'expo-router/native-tabs';

import { Colors, Fonts } from '@/constants/theme';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Colors.ground}
      shadowColor="transparent"
      indicatorColor={Colors.surface2}
      iconColor={{ default: Colors.muted, selected: Colors.text }}
      labelStyle={{
        default: { color: Colors.muted, fontFamily: Fonts.medium },
        selected: { color: Colors.text, fontFamily: Fonts.semibold },
      }}>
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
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="garage">
        <NativeTabs.Trigger.Label>Garage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="car" md="directions_car" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
