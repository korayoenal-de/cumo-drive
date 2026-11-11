/**
 * Chat einer Ausfahrt: Organisator und angenommene Mitfahrer. Neue Nachrichten kommen live
 * (Supabase Realtime), eigene stehen rechts in getöntem Orange.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community/ride-bits';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { ausfahrtTeilnehmer, clock, listAusfahrten, sendNachricht, shortDate, useNachrichten, type Ausfahrt, type Teilnehmer } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { enablePush, setOpenChat } from '@/lib/push';

export default function AusfahrtChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.name])), [members]);

  const send = async () => {
    if (!id || !text.trim() || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      await sendNachricht(id, text);
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
        <Pressable accessibilityRole="button" accessibilityLabel="Zurück" hitSlop={4} onPress={back} style={styles.roundBtn}>
          <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={Colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <AppText style={styles.title} numberOfLines={1}>{a?.name ?? 'Chat'}</AppText>
          {a && (
            <AppText variant="caption" muted numberOfLines={1}>
              {shortDate(a.startsAt)}, {clock(a.startsAt)}  ·  {members.length} {members.length === 1 ? 'Teilnehmer' : 'Teilnehmer'}
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
            <AppText style={styles.pinnedText} numberOfLines={2}>Treffpunkt {a.meeting.name}, {clock(a.startsAt)} Uhr</AppText>
          </View>
        )}
        {list === null && !error && <ActivityIndicator color={Colors.muted} />}
        {error && <AppText style={styles.error}>{error}</AppText>}
        {list?.length === 0 && <AppText muted style={styles.empty}>Noch keine Nachrichten. Sag Hallo und stimm dich mit der Gruppe ab.</AppText>}
        {list?.map((m, i) => {
          const mine = m.userId === me;
          const prev = list[i - 1];
          const first = !prev || prev.userId !== m.userId;
          const name = names.get(m.userId) ?? 'Fahrer';
          return (
            <Animated.View key={m.id} entering={FadeInDown.duration(Motion.enter)} style={[styles.msgRow, mine && styles.msgRowMine, !first && styles.msgFollow]}>
              {!mine && (first ? <Avatar name={name} size={32} /> : <View style={styles.avatarGap} />)}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                {!mine && first && <AppText style={styles.author}>{name}</AppText>}
                <AppText style={styles.body}>{m.body}</AppText>
                <AppText style={styles.time}>{clock(m.createdAt)}</AppText>
              </View>
            </Animated.View>
          );
        })}
        <AppText variant="caption" muted style={styles.hint}>Am Tag der Ausfahrt startet der Organisator die Gruppenfahrt mit Live Positionen.</AppText>
      </ScrollView>

      {sendErr && <AppText style={[styles.error, styles.sendErr]}>{sendErr}</AppText>}
      <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.s }]}>
        <TextInput maxFontSizeMultiplier={1.2}
          value={text}
          onChangeText={setText}
          placeholder="Nachricht"
          placeholderTextColor={Colors.muted}
          multiline
          maxLength={1000}
          style={styles.input}
          accessibilityLabel="Nachricht schreiben"
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Senden" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={() => void send()} style={[styles.send, !canSend && styles.sendOff]}>
          {sending ? <ActivityIndicator color={Colors.onSignal} /> : <SymbolView name="arrow.up" size={18} weight="bold" tintColor={Colors.onSignal} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.l, paddingBottom: Spacing.m, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  roundBtn: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bold, fontSize: Type.title },
  list: { padding: Spacing.l, gap: Spacing.m },
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
  time: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.muted, alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  hint: { textAlign: 'center', marginTop: Spacing.l },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.s, paddingHorizontal: Spacing.l, paddingTop: Spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: Spacing.l, paddingTop: 12, paddingBottom: 12, backgroundColor: Colors.surface, borderRadius: 22, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: Colors.signalDeep },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
  sendErr: { paddingHorizontal: Spacing.l },
});
