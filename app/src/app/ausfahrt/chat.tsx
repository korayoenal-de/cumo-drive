/**
 * Chat einer Ausfahrt: Organisator und angenommene Mitfahrer. Neue Nachrichten kommen live
 * (Supabase Realtime), eigene stehen rechts in getöntem Orange.
 */
import { meta as fmtMeta, wann } from '@/lib/format';
import { BackLink } from '@/components/ui/back-link';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community/ride-bits';
import { ReportSheet } from '@/components/moderation/report-sheet';
import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Spacing, Type, Layout } from '@/constants/theme';
import { ausfahrtTeilnehmer, clock, deleteNachricht, editNachricht, listAusfahrten, markRideChatSeen, sendNachricht, useNachrichten, type Ausfahrt, type Nachricht, type Teilnehmer } from '@/lib/ausfahrten';
import { ActionSheet } from '@/components/ui/action-sheet';
import { refreshUnread } from '@/lib/drivers';
import { useSession } from '@/lib/auth';
import { enablePush, setOpenChat } from '@/lib/push';
import { WhenSheet } from '@/components/group/when-sheet';
import { t, tr } from '@/i18n';

export default function AusfahrtChat() {
  // name und from kommen aus der Liste der Nachrichten (Koray 18.11.): Titel auch bei vergangenen Ausfahrten, Zurück nennt die Herkunft
  const { id, name: nameParam, from } = useLocalSearchParams<{ id: string; name?: string; from?: string }>();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const me = session?.user.id;
  const { list, error, reload } = useNachrichten(id);
  const [a, setA] = useState<Ausfahrt | null>(null);
  const [members, setMembers] = useState<Teilnehmer[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  // fremde Nachricht lange drücken: melden (Koray 12.11.)
  const [report, setReport] = useState<{ ref: string; userId: string; name: string } | null>(null);
  // eigene Nachricht lange drücken: bearbeiten oder löschen (Koray 20.11.2026)
  const [own, setOwn] = useState<Nachricht | null>(null);
  const [editing, setEditing] = useState<Nachricht | null>(null);
  // „Koray, wann bist du da?“ an mich antippen: dasselbe Blatt wie auf der Ausfahrt (Koray 20.11.2026)
  const [whenOpen, setWhenOpen] = useState(false);

  // Solange der Chat offen ist, keine Mitteilung für ihn; beim ersten Öffnen nach der Erlaubnis fragen
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setOpenChat(`ride:${id}`);
      void enablePush(true);
      return () => setOpenChat(null);
    }, [id]),
  );

  useEffect(() => {
    if (!id) return;
    listAusfahrten()
      .then((l) => setA(l.find((x) => x.id === id) ?? null))
      .catch(() => undefined);
    ausfahrtTeilnehmer(id)
      .then(setMembers)
      .catch(() => undefined);
  }, [id]);

  // Offen heißt gelesen: beim Öffnen und bei jeder neuen Nachricht, solange der Chat sichtbar ist
  const count = list?.length ?? -1;
  useFocusEffect(
    useCallback(() => {
      if (!id || count < 0) return;
      void markRideChatSeen(id).then(() => refreshUnread());
    }, [id, count]),
  );

  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);
  const myFirst = (me && names.get(me)?.trim().split(/\s+/)[0]) || null;
  const askedMe = (m: Nachricht) =>
    !!myFirst && m.userId !== me && a?.rideStatus === 'geplant' && m.body.trim() === tr('{name}, wann bist du da?', { name: myFirst });

  const send = async () => {
    if (!id || !text.trim() || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      if (editing) await editNachricht(editing.id, text);
      else await sendNachricht(id, text);
      setEditing(null);
      setText('');
      void reload();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/community'));
  const canSend = !!text.trim() && !sending;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.head, { paddingTop: insets.top + Spacing.s }]}>
        <BackLink label={from === 'nachrichten' ? t('Nachrichten') : t('Ausfahrt')} onPress={back} />
        <View style={styles.flex}>
          <AppText style={styles.title} numberOfLines={1}>{a?.name ?? nameParam ?? t('Chat')}</AppText>
          {a && (
            <AppText variant="caption" muted numberOfLines={1}>
              {fmtMeta(wann(a.startsAt), `${members.length} Teilnehmer`)}
            </AppText>
          )}
        </View>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled">
        {a?.meeting && (
          <View style={styles.pinned}>
            <SymbolView name="mappin.and.ellipse" size={16} weight="semibold" tintColor={Colors.signal} />
            <AppText style={styles.pinnedText} numberOfLines={2}>{a.meeting.name?.trim() ? `${t('Treffpunkt ')}${a.meeting.name.trim()}` : t('Treffpunkt')}, {clock(a.startsAt)}</AppText>
          </View>
        )}
        {list === null && !error && <ActivityIndicator color={Colors.muted} />}
        {error && <AppText style={styles.error}>{error}</AppText>}
        {list?.length === 0 && <AppText muted style={styles.empty}>{t('Noch keine Nachrichten. Sag Hallo und stimm dich mit der Gruppe ab.')}</AppText>}
        {list?.map((m, i) => {
          const mine = m.userId === me;
          const prev = list[i - 1];
          const first = !prev || prev.userId !== m.userId;
          const name = names.get(m.userId) ?? t('Fahrer');
          const asked = askedMe(m);
          return (
            <Animated.View key={m.id} entering={FadeInDown.duration(Motion.enter)} style={[styles.msgRow, mine && styles.msgRowMine, !first && styles.msgFollow]}>
              {!mine && (first ? <Avatar name={name} userId={m.userId} size={32} /> : <View style={styles.avatarGap} />)}
              <Pressable
                delayLongPress={350}
                onPress={asked ? () => setWhenOpen(true) : undefined}
                accessibilityRole={asked ? 'button' : undefined}
                onLongPress={() => (mine ? setOwn(m) : setReport({ ref: String(m.id), userId: m.userId, name }))}
                accessibilityHint={mine ? t('Lange drücken, um die Nachricht zu bearbeiten oder zu löschen') : t('Lange drücken, um die Nachricht zu melden')}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                {!mine && first && <AppText style={styles.author}>{name}</AppText>}
                <AppText style={styles.body}>{m.body}</AppText>
                {asked && <AppText style={styles.askedHint}>{t('Antippen zum Antworten')}</AppText>}
                <AppText style={styles.time}>{m.editedAt ? `${t('bearbeitet')} · ${clock(m.createdAt)}` : clock(m.createdAt)}</AppText>
              </Pressable>
            </Animated.View>
          );
        })}
        <AppText variant="caption" muted style={styles.hint}>{t('Am Tag der Ausfahrt startet die Lead die Gruppenfahrt mit Live Positionen.')}</AppText>
      </ScrollView>

      {sendErr && <AppText style={[styles.error, styles.sendErr]}>{sendErr}</AppText>}
      {editing && (
        <View style={styles.editRow}>
          <SymbolView name="pencil" size={16} weight="semibold" tintColor={Colors.muted} />
          <AppText muted style={styles.flex} numberOfLines={1}>{t('Nachricht bearbeiten')}</AppText>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { setEditing(null); setText(''); }}>
            <AppText style={styles.editCancel}>{t('Abbrechen')}</AppText>
          </Pressable>
        </View>
      )}
      <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.s }]}>
        <TextField pill maxFontSizeMultiplier={1.2}
          value={text}
          onChangeText={setText}
          placeholder={t('Nachricht')}
          placeholderTextColor={Colors.muted}
          multiline
          maxLength={1000}
          style={styles.input}
          accessibilityLabel={t('Nachricht schreiben')}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('Senden')} accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={() => void send()} style={[styles.send, !canSend && styles.sendOff]}>
          {sending ? <ActivityIndicator color={Colors.onSignal} /> : <SymbolView name="arrow.up" size={20} weight="semibold" tintColor={Colors.onSignal} />}
        </Pressable>
      </View>
      {a && (
        <WhenSheet
          visible={whenOpen}
          rideId={a.id}
          meetAt={a.meeting ? [a.meeting.lat, a.meeting.lon] : a.start}
          meetingName={a.meeting?.name?.trim() || tr('Start der Tour')}
          startsAt={a.startsAt}
          onClose={() => setWhenOpen(false)}
          onSent={() => void reload()}
        />
      )}
      <ActionSheet
        visible={!!own}
        onClose={() => setOwn(null)}
        items={[
          // ob es noch geht (24 Stunden), prüft die Datenbank und meldet es sonst
          ...(own
            ? [{ key: 'edit', icon: 'pencil' as const, label: t('Bearbeiten'), onPress: () => { setEditing(own); setText(own.body); } }]
            : []),
          {
            key: 'delete',
            icon: 'trash' as const,
            label: t('Löschen'),
            danger: true,
            onPress: () => {
              const m = own;
              if (!m) return;
              void deleteNachricht(m.id)
                .then(() => {
                  void reload();
                })
                .catch((e: Error) => setSendErr(e.message));
            },
          },
        ]}
      />
      <ReportSheet visible={!!report} kind="ride_message" refId={report?.ref ?? ''} userId={report?.userId} name={report?.name} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  askedHint: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.signal, marginTop: 2 },
  root: { flex: 1, backgroundColor: Colors.ground },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Layout.page, paddingBottom: Spacing.m },
  title: { fontFamily: Fonts.bold, fontSize: Type.title },
  list: { paddingHorizontal: Layout.page, paddingVertical: Spacing.l, gap: Spacing.m },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, alignSelf: 'center', backgroundColor: Colors.signalTint, borderRadius: Radius.pill, paddingHorizontal: Spacing.l, paddingVertical: Spacing.s },
  pinnedText: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.text },
  empty: { textAlign: 'center', marginTop: Spacing.xl },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.s, maxWidth: '86%' },
  msgRowMine: { alignSelf: 'flex-end' },
  msgFollow: { marginTop: -Spacing.s },
  avatarGap: { width: 32 },
  bubble: { borderRadius: Radius.l, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, gap: 2, flexShrink: 1 },
  bubbleOther: { backgroundColor: Colors.surface, borderBottomLeftRadius: 6 },
  bubbleMine: { backgroundColor: Colors.signalTint, borderBottomRightRadius: 6 },
  author: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.muted },
  body: { fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: Leading.body },
  time: { fontFamily: Fonts.semibold, fontSize: Type.micro, color: Colors.muted, alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  hint: { textAlign: 'center', marginTop: Spacing.l },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.s, paddingHorizontal: Spacing.l, paddingTop: Spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: Spacing.l, paddingTop: 12, paddingBottom: 12, backgroundColor: Colors.surface, borderRadius: 22, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: Colors.signalDeep },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
  sendErr: { paddingHorizontal: Spacing.l },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingHorizontal: Spacing.l, paddingTop: Spacing.s },
  editCancel: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
});
