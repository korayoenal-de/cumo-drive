/**
 * Nachrichten: Unterhaltungen mit anderen Fahrern und die Chats der Ausfahrten in einer Liste (Koray 18.11.),
 * neueste oben, ungelesene mit Plakette.
 *
 * Filter als Chips (Koray 20.11., Rückmeldung aus der Testgruppe): Alle, Ausfahrten, Chats. Unter Alle fallen die
 * Chats vergangener Ausfahrten nach 14 Tagen heraus, solange nichts Ungelesenes drin steht; unter Ausfahrten
 * bleiben sie, mit dem Datum der Ausfahrt.
 */
import { BackLink } from '@/components/ui/back-link';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community/ride-bits';
import { Chip, ChipRow } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing, Type, Radius } from '@/constants/theme';
import { clock, listRideChats, shortDate, type RideChat } from '@/lib/ausfahrten';
import { listConversations, refreshUnread, type Conversation } from '@/lib/drivers';
import { enablePush } from '@/lib/push';
import { t, tr } from '@/i18n';

type Row = { kind: 'direct'; at: Date; c: Conversation } | { kind: 'ride'; at: Date; r: RideChat };

type Filter = 'alle' | 'ausfahrten' | 'chats';
/** Chats vergangener Ausfahrten verschwinden nach so vielen Tagen aus Alle */
const PAST_DAYS = 14;

const unreadOf = (r: Row) => (r.kind === 'ride' ? r.r.unread : r.c.unread);
function visible(r: Row, f: Filter, now = Date.now()): boolean {
  if (f === 'chats') return r.kind === 'direct';
  if (f === 'ausfahrten') return r.kind === 'ride';
  if (r.kind === 'direct' || unreadOf(r) > 0) return true;
  const day = r.r.startsAt ?? r.at;
  return now - day.getTime() < PAST_DAYS * 86400000;
}

const when = (d: Date) => (d.toDateString() === new Date().toDateString() ? clock(d) : shortDate(d));

export default function Nachrichten() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('alle');

  useFocusEffect(
    useCallback(() => {
      const load = () =>
        // Die Chats der Ausfahrten dürfen fehlen (ältere Datenbank, kurzer Fehler), die Unterhaltungen nicht
        Promise.all([listConversations(), listRideChats().catch(() => [] as RideChat[])])
          .then(([direct, rides]) => {
            const rows: Row[] = [...direct.map((c) => ({ kind: 'direct' as const, at: c.lastAt, c })), ...rides.map((r) => ({ kind: 'ride' as const, at: r.lastAt, r }))];
            setList(rows.sort((x, y) => y.at.getTime() - x.at.getTime()));
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
        <BackLink label={t('Community')} fallback="/community" />
      </View>
      <AppText variant="display">{t('Nachrichten')}</AppText>
      {!!list?.length && (
        <ChipRow>
          {(
            [
              ['alle', t('Alle')],
              ['ausfahrten', t('Ausfahrten')],
              ['chats', t('Chats')],
            ] as const
          ).map(([key, label]) => {
            const n = list.filter((r) => visible(r, key)).reduce((sum, r) => sum + unreadOf(r), 0);
            return <Chip key={key} label={n && key !== 'alle' ? `${label} ${n}` : label} active={filter === key} onPress={() => setFilter(key)} />;
          })}
        </ChipRow>
      )}
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {list?.length === 0 && (
        <View style={styles.card}>
          <AppText variant="title">{t('Noch keine Nachrichten')}</AppText>
          <AppText muted>{t('Unter Community, Drivers findest du andere Mitglieder und kannst ihnen eine Nachricht schreiben.')}</AppText>
        </View>
      )}
      {!!list?.length && !list.some((r) => visible(r, filter)) && (
        <AppText muted>{filter === 'chats' ? t('Noch keine Unterhaltungen mit anderen Fahrern.') : t('Keine aktuellen Chats von Ausfahrten.')}</AppText>
      )}
      {list?.filter((r) => visible(r, filter)).map((row) => {
        if (row.kind === 'ride') {
          const r = row.r;
          return (
            <Pressable
              key={`ride-${r.rideId}`}
              accessibilityRole="button"
              accessibilityLabel={`${tr('Ausfahrt')} ${r.name}${r.unread ? `, ${r.unread} ungelesen` : ''}, ${r.lastBody}`}
              onPress={() => router.push({ pathname: '/ausfahrt/chat', params: { id: r.rideId, name: r.name, from: 'nachrichten' } })}
              style={styles.row}>
              {/* Gruppe statt Person: das Symbol der Ausfahrt im Kreis, gleiche Größe wie ein Profilbild */}
              <View style={styles.group}>
                <SymbolView name="car.2" size={20} weight="semibold" tintColor={Colors.text} />
              </View>
              <View style={styles.flex}>
                <View style={styles.line}>
                  <AppText style={[styles.name, styles.flex]} numberOfLines={1}>
                    {r.name}
                    {filter === 'ausfahrten' && r.startsAt ? <AppText muted style={styles.rideDay}>{`  ${shortDate(r.startsAt)}`}</AppText> : null}
                  </AppText>
                  <AppText style={[styles.time, r.unread ? styles.timeUnread : null]}>{when(r.lastAt)}</AppText>
                </View>
                <View style={styles.line}>
                  <AppText muted={!r.unread} style={[styles.flex, styles.preview, r.unread ? styles.unreadText : null]} numberOfLines={1}>
                    {r.lastFromMe ? tr('Du') : r.lastName}: {r.lastBody}
                  </AppText>
                  {r.unread > 0 && (
                    <View style={styles.badge}>
                      <AppText style={styles.badgeText}>{r.unread}</AppText>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }
        const c = row.c;
        return (
          <Pressable
            key={c.partner}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}${c.unread ? `, ${c.unread} ungelesen` : ''}, ${c.lastBody}`}
            onPress={() => router.push({ pathname: '/nachrichten/[id]', params: { id: c.partner, name: c.name } })}
            style={styles.row}>
            <Avatar name={c.name} userId={c.partner} />
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
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.m },
  head: { flexDirection: 'row' },
  flex: { flex: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64 },
  group: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  name: { fontFamily: Fonts.bold, fontSize: Type.title },
  rideDay: { fontFamily: Fonts.semibold, fontSize: Type.caption },
  // Vorschau wie bei WhatsApp: letzte Nachricht in 15 pt, Zeit rechts, ungelesen orange (Koray 10.11.)
  preview: { fontFamily: Fonts.medium, fontSize: Type.body },
  unreadText: { fontFamily: Fonts.bold, color: Colors.text },
  time: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted, fontVariant: ['tabular-nums'] },
  timeUnread: { color: Colors.signal },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: Type.micro, lineHeight: 13 },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
});
