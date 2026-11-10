/**
 * Unterhaltung mit einem Fahrer: eigene Nachrichten rechts in getöntem Orange, neue kommen live.
 * Darf der andere nicht angeschrieben werden (und hat selbst noch nicht geschrieben), steht ein Hinweis
 * statt des Eingabefelds.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/community/ride-bits';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { clock, shortDate } from '@/lib/ausfahrten';
import { useSession } from '@/lib/auth';
import { listDrivers, sendDirect, useDirectChat, type Driver } from '@/lib/drivers';

export default function Unterhaltung() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const me = session?.user.id;
  const { list, error } = useDirectChat(me, id);
  const [partner, setPartner] = useState<Driver | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    listDrivers()
      .then((l) => setPartner(l.find((d) => d.id === id) ?? null))
      .catch(() => undefined);
  }, [id]);

  const title = partner?.name ?? name ?? 'Fahrer';
  const theyWrote = !!list?.some((m) => m.sender === id);
  const canWrite = partner ? partner.allowMessages || theyWrote : true;

  const send = async () => {
    if (!id || !text.trim() || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      await sendDirect(id, text);
      setText('');
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const ok = !!text.trim() && !sending;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.head, { paddingTop: insets.top + Spacing.s }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zurück" hitSlop={4} onPress={() => (router.canGoBack() ? router.back() : router.navigate('/nachrichten'))} style={styles.round}>
          <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={Colors.text} />
        </Pressable>
        <Avatar name={title} size={36} />
        <View style={styles.flex}>
          <AppText style={styles.title} numberOfLines={1}>{title}</AppText>
          {partner && (partner.car || partner.homeName) ? (
            <AppText variant="caption" muted numberOfLines={1}>{[partner.car, partner.homeName ? `Raum ${partner.homeName}` : null].filter(Boolean).join('  ·  ')}</AppText>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {list === null && !error && <ActivityIndicator color={Colors.muted} />}
        {error && <AppText style={styles.error}>{error}</AppText>}
        {list?.length === 0 && <AppText muted style={styles.center}>Schreib {title} die erste Nachricht.</AppText>}
        {list?.map((m, i) => {
          const mine = m.sender === me;
          const prev = list[i - 1];
          const newDay = !prev || prev.createdAt.toDateString() !== m.createdAt.toDateString();
          return (
            <View key={m.id} style={styles.gap}>
              {newDay && <AppText variant="caption" muted style={styles.center}>{shortDate(m.createdAt)}</AppText>}
              <Animated.View entering={FadeInDown.duration(Motion.enter)} style={[styles.bubble, mine ? styles.mine : styles.other]}>
                <AppText style={styles.body}>{m.body}</AppText>
                <AppText style={styles.time}>
                  {clock(m.createdAt)}
                  {mine && m.readAt ? '  ·  gelesen' : ''}
                </AppText>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      {sendErr && <AppText style={[styles.error, styles.padH]}>{sendErr}</AppText>}
      {canWrite ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.s }]}>
          <TextInput value={text} onChangeText={setText} placeholder="Nachricht" placeholderTextColor={Colors.muted} multiline maxLength={1000} style={styles.input} accessibilityLabel="Nachricht schreiben" />
          <Pressable accessibilityRole="button" accessibilityLabel="Senden" accessibilityState={{ disabled: !ok }} disabled={!ok} onPress={() => void send()} style={[styles.send, !ok && styles.sendOff]}>
            {sending ? <ActivityIndicator color={Colors.onSignal} /> : <SymbolView name="arrow.up" size={18} weight="bold" tintColor={Colors.onSignal} />}
          </Pressable>
        </View>
      ) : (
        <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.m }]}>
          <AppText muted style={styles.flex}>{title} möchte gerade keine Nachrichten bekommen.</AppText>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.l, paddingBottom: Spacing.m, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  round: { width: Size.icon, height: Size.icon, borderRadius: Size.icon / 2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.bold, fontSize: Type.title },
  list: { padding: Spacing.l, gap: Spacing.s },
  gap: { gap: Spacing.s },
  center: { textAlign: 'center', marginVertical: Spacing.s },
  bubble: { maxWidth: '82%', borderRadius: Radius.l, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, gap: 2 },
  other: { alignSelf: 'flex-start', backgroundColor: Colors.surface, borderBottomLeftRadius: 6 },
  mine: { alignSelf: 'flex-end', backgroundColor: Colors.signalTint, borderBottomRightRadius: 6 },
  body: { fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: Leading.body },
  time: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.muted, alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.s, paddingHorizontal: Spacing.l, paddingTop: Spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: Spacing.l, paddingTop: 12, paddingBottom: 12, backgroundColor: Colors.surface, borderRadius: 22, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: Colors.signalDeep },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
  padH: { paddingHorizontal: Spacing.l },
});
