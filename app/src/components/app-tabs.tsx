/**
 * Eigene Tab Leiste statt der iOS 26 Systemleiste. Grund: Die Systemleiste staucht sich beim Scrollen
 * zu einem einzelnen Symbol zusammen. Wir machen es wie Instagram: Scrollt man im Inhalt nach unten,
 * wird die ganze Leiste weich um etwa 20 % kleiner, beim Hochscrollen wieder 100 %. Alle vier Tabs
 * bleiben immer sichtbar und erreichbar.
 *
 * Leiste aus Liquid Glass (GlassPanel), die Markierung des aktiven Tabs gleitet mit einer Feder.
 * Läuft eine Gruppenfahrt, steht darüber eine Zeile mit ihrem Stand, wie der Mini Player in Apple Music.
 */
import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/ui/glass-panel';
import { TabIcon, type TabIconName } from '@/components/ui/tab-icons';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Shadow, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { useUnreadMessages, useUnreadWatcher } from '@/lib/drivers';
import { useInviteCount, useInvitesWatcher } from '@/components/group/invites-banner';
import { useRide, type RideState } from '@/lib/group/ride';
import { expandTabBar, tabBarCompact as compact } from '@/lib/tab-bar';

const BAR_H = 64;
const SHRINK = 0.2;

const TABS: { name: string; href: '/' | '/touren' | '/community' | '/einstellungen'; label: string; icon: TabIconName }[] = [
  { name: 'index', href: '/', label: 'Planen', icon: 'planen' },
  { name: 'touren', href: '/touren', label: 'Touren', icon: 'touren' },
  { name: 'community', href: '/community', label: 'Community', icon: 'community' },
  { name: 'einstellungen', href: '/einstellungen', label: 'Einstellungen', icon: 'einstellungen' },
];

export default function AppTabs() {
  useUnreadWatcher(useSession()?.user.id);
  return (
    <Tabs style={styles.flex}>
      <TabSlot />
      {/* TabList mit asChild: die Trigger müssen direkte Kinder sein, Dock legt sie in die Glasleiste */}
      <TabList asChild>
        <Dock>
          {TABS.map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
              <TabButton tab={t} />
            </TabTrigger>
          ))}
        </Dock>
      </TabList>
    </Tabs>
  );
}

/** Schwebende Leiste unten: Glas, unten verankert, wird beim Scrollen nach unten um 20 % kleiner. */
function Dock({ children }: { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const ride = useRide();
  const active = ride.status === 'aktiv' || ride.status === 'verbinde';
  const barStyle = useAnimatedStyle(() => {
    const c = compact.get();
    return { transform: [{ translateY: (BAR_H * SHRINK * c) / 2 }, { scale: 1 - SHRINK * c }] };
  });
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom - 6, Spacing.s) }]}>
      {active && <RideAccessory ride={ride} />}
      <Animated.View style={[styles.barWrap, barStyle]}>
        <GlassPanel style={styles.bar} fallback={Colors.overlaySurface} tint="rgba(11,11,12,0.5)">
          {children}
        </GlassPanel>
      </Animated.View>
    </View>
  );
}

type TabProps = TabTriggerSlotProps & { tab: (typeof TABS)[number] };

function TabButton({ tab, isFocused, ref: _ref, ...rest }: TabProps) {
  const on = useSharedValue(isFocused ? 1 : 0);
  useEffect(() => {
    on.set(withSpring(isFocused ? 1 : 0, Motion.snap));
    if (isFocused) expandTabBar();
  }, [isFocused, on]);
  const pill = useAnimatedStyle(() => ({ opacity: on.get(), transform: [{ scale: 1 - Motion.pop + on.get() * Motion.pop }] }));
  return (
    <Pressable
      {...rest}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: !!isFocused }}
      style={styles.tab}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.pill, pill]} />
      <View>
        <TabIcon name={tab.icon} on={!!isFocused} color={isFocused ? Colors.text : Colors.muted} size={24} />
        {tab.name === 'community' && <UnreadBubble />}
      </View>
      {/* Leiste hat feste Höhe und vier feste Breiten: Systemschrift vergrößert hier nicht, lange Wörter schrumpfen leicht (Prüfung 11.11.) */}
      <AppText style={[styles.label, isFocused && styles.labelOn]} numberOfLines={1} maxFontSizeMultiplier={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {tab.label}
      </AppText>
    </Pressable>
  );
}

/** Plakette für ungelesene Nachrichten am Community Tab (Koray 10.11.) */
function UnreadBubble() {
  // Nachrichten und Einladungen zu Gruppenfahrten zusammen (Koray 11.11.)
  useInvitesWatcher();
  const n = useUnreadMessages() + useInviteCount();
  if (n <= 0) return null;
  return (
    <View style={styles.bubble} accessible accessibilityLabel={`${n} neue Nachrichten oder Einladungen`}>
      <AppText style={styles.bubbleText}>{n > 9 ? '9+' : n}</AppText>
    </View>
  );
}

/** Gruppenfahrt läuft: Zeile über der Leiste. Tippen öffnet die Gruppenfahrt. */
function RideAccessory({ ride }: { ride: RideState }) {
  const n = ride.members.length;
  const last = ride.messages[0];
  const title = ride.status === 'verbinde' ? 'Gruppe verbindet' : `Gruppenfahrt, ${n} Fahrer`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, Gruppe öffnen`} onPress={() => router.push('/gruppe')}>
      <GlassPanel style={styles.accessory} fallback={Colors.overlaySurface}>
        <View style={styles.dot} />
        <View style={styles.flex}>
          <AppText style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {last ? `${last.name}: ${last.text}` : (ride.name ?? 'Live auf der Karte')}
          </AppText>
        </View>
      </GlassPanel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.l, gap: Spacing.s },
  barWrap: { borderRadius: BAR_H / 2, boxShadow: Shadow.float },
  bar: { height: BAR_H, borderRadius: BAR_H / 2, padding: Spacing.xs, flexDirection: 'row' },
  tab: { flex: 1, height: BAR_H - 8, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: (BAR_H - 8) / 2 },
  pill: { backgroundColor: Colors.pressTint, borderRadius: (BAR_H - 8) / 2 },
  label: { alignSelf: 'stretch', textAlign: 'center', paddingHorizontal: 2, fontFamily: Fonts.medium, fontSize: Type.caption, color: Colors.muted },
  labelOn: { fontFamily: Fonts.semibold, color: Colors.text },
  accessory: { height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingHorizontal: Spacing.l },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.good },
  title: { fontFamily: Fonts.semibold, fontSize: Type.small },
  bubble: { position: 'absolute', top: -5, right: -11, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.ground },
  bubbleText: { fontFamily: Fonts.bold, fontSize: 10, lineHeight: 12, color: Colors.onSignal },
});
