/**
 * Nachrichten: Unterhaltungen mit anderen Fahrern, neueste oben, ungelesene mit Plakette.
 */
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community/ride-bits';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Size, Spacing, Type, Radius } from '@/constants/theme';
import { clock, shortDate } from '@/lib/ausfahrten';
import { listConversations, refreshUnread, type Conversation } from '@/lib/drivers';
import { enablePush } from '@/lib/push';

const when = (d: Date) => (d.toDateString() === new Date().toDateString() ? clock(d) : shortDate(d));

export default function Nachrichten() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const load = () =>
        listConversations()
          .then((l) => {
            setList(l);
            setErr(null);
          })
          .catch((e: Error) => setErr(e.message));
      void load();
      void refreshUnread();
      // Beim ersten Öffnen der Nachrichten nach der Erlaubnis für Mitteilungen fragen (iOS fragt nur einmal)
      void enablePush(true);
      const t = setInterval(() => void load(), 20000);
      return () => clearInterval(t);
    }, []),
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.s, paddingBottom: insets.bottom + Spacing.xxxl }]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zurück" hitSlop={4} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/community'))} style={styles.round}>
          <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={Colors.text} />
        </Pressable>
      </View>
      <AppText variant="display">Nachrichten</AppText>
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {list?.length === 0 && (
        <View style={styles.card}>
          <AppText variant="title">Noch keine Nachrichten</AppText>
          <AppText muted>Unter Community, Drivers findest du andere Mitglieder und kannst sie anschreiben.</AppText>
        </View>
      )}
      {list?.map((c) => (
        <Pressable
          key={c.partner}
          accessibilityRole="button"
          accessibilityLabel={`${c.name}${c.unread ? `, ${c.unread} ungelesen` : ''}, ${c.lastBody}`}
          onPress={() => router.push({ pathname: '/nachrichten/[id]', params: { id: c.partner, name: c.name } })}
          style={styles.row}>
          <Avatar name={c.name} />
          <View style={styles.flex}>
            <View style={styles.line}>
              <AppText style={[styles.name, styles.flex]} numberOfLines={1}>{c.name}</AppText>
              <AppText style={[styles.time, c.unread ? styles.timeUnread : null]}>{when(c.lastAt)}</AppText>
            </View>
            <View style={styles.line}>
              <AppText muted={!c.unread} style={[styles.flex, styles.preview, c.unread ? styles.unreadText : null]} numberOfLines={1}>
                {c.lastFromMe ? 'Du: ' : ''}
                {c.lastBody}
              </AppText>
              {c.unread > 0 && (
                <View style={styles.badge}>
                  <AppText style={styles.badgeText}>{c.unread}</AppText>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.m },
  head: { flexDirection: 'row' },
  round: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  name: { fontFamily: Fonts.bold, fontSize: Type.title },
  // Vorschau wie bei WhatsApp: letzte Nachricht in 15 pt, Zeit rechts, ungelesen orange (Koray 10.11.)
  preview: { fontFamily: Fonts.medium, fontSize: Type.body },
  unreadText: { fontFamily: Fonts.bold, color: Colors.text },
  time: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted, fontVariant: ['tabular-nums'] },
  timeUnread: { color: Colors.signal },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: 11, lineHeight: 13 },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
