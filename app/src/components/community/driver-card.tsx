/**
 * Karte eines Mitglieds unter Drivers: Name, Wohnort, Auto. Groß (gewählt auf der Karte) mit
 * Fuhrpark und der Hauptaktion Anschreiben, klein in der Liste mit Symbol zum Anschreiben.
 * Kontakte (Koray 13.11.): Plus schickt eine Anfrage, danach steht dort grau Angefragt; bestätigte
 * Kontakte tragen ein Häkchen am Bild. Die große Karte lädt zu einer eigenen Ausfahrt ein.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/community/ride-bits';
import { BlockSheet, ReportSheet } from '@/components/moderation/report-sheet';
import { CarSprite, frameFor } from '@/components/map/car-sprite';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { ActionSheet, type SheetItem } from '@/components/ui/action-sheet';
import { freeSeats, listAusfahrten, longDate, monthYear, type Ausfahrt } from '@/lib/ausfahrten';
import { answerContact, removeContact, requestContact, useContacts, type Contact } from '@/lib/contacts';
import { inviteToRide } from '@/lib/group/invites';
import { showToast } from '@/lib/toast';
import { type Driver } from '@/lib/drivers';
import { useIsBlocked } from '@/lib/moderation';

/** Wagenfarbe des ersten Autos als Ring um den Kreis, sonst weiß */
export const ringColor = (d: Driver) => d.garage?.find((g) => g.look)?.look?.color ?? Colors.text;

const write = (d: Driver) => router.push({ pathname: '/nachrichten/[id]', params: { id: d.id, name: d.name } });

export function DriverCard({ d, big, unread = 0, onPress }: { d: Driver; big?: boolean; /** ungelesene Nachrichten von diesem Fahrer (Koray 10.11.) */ unread?: number; onPress?: () => void }) {
  const meta = [d.car, d.homeName ?? null].filter(Boolean).join('  ·  ');
  const canWrite = !d.isMe && d.allowMessages;
  const [report, setReport] = useState(false);
  const [block, setBlock] = useState(false);
  // blockiert: sofort weg, bis die Liste neu geladen ist (Koray 12.11.)
  const blocked = useIsBlocked(d.id);
  const status = useContacts().byId.get(d.id) ?? null;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  if (blocked && !d.isMe) return null;
  const contactAction = async () => {
    setContactBusy(true);
    try {
      if (status === 'kontakt' || status === 'angefragt') await removeContact(d.id);
      else {
        const now = await requestContact(d.id);
        showToast(now === 'kontakt' ? `${d.name} ist jetzt dein Kontakt.` : `Anfrage an ${d.name} geschickt.`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' });
    } finally {
      setContactBusy(false);
    }
  };

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.ring, { borderColor: ringColor(d) }]}>
            <Avatar name={d.name} userId={d.id} size={48} />
            {status === 'kontakt' && <ContactCheck />}
          </View>
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={1}>{d.name}{d.isMe ? ' (du)' : ''}</AppText>
            {d.birthdayToday ? <AppText variant="caption" style={styles.bday}>Hat heute Geburtstag</AppText> : null}
            <AppText variant="caption" muted numberOfLines={1}>
              {[d.age != null ? `${d.age} Jahre` : null, d.homeName ?? 'Wohnort nicht angegeben', d.memberSince ? `dabei seit ${monthYear(d.memberSince)}` : null].filter(Boolean).join('  ·  ')}
            </AppText>
          </View>
        </View>
        {d.bio ? <AppText style={styles.bio}>{d.bio}</AppText> : null}
        {d.garage && d.garage.length > 0 ? (
          <View style={styles.garage}>
            <AppText style={styles.label}>Fuhrpark</AppText>
            {d.garage.map((g, i) => (
              <View key={`${g.name}-${i}`} style={styles.car}>
                {g.look ? <CarSprite look={g.look} frame={frameFor(215)} size={44} /> : <SymbolView name="car.side" size={20} weight="semibold" tintColor={Colors.muted} />}
                <AppText style={styles.carName} numberOfLines={1}>{g.name}</AppText>
              </View>
            ))}
          </View>
        ) : d.car ? (
          <View style={styles.garage}>
            <AppText style={styles.label}>Fährt</AppText>
            <AppText style={styles.carName}>{d.car}</AppText>
          </View>
        ) : null}
        {canWrite ? (
          <Pressable accessibilityRole="button" onPress={() => write(d)} style={styles.primary}>
            <AppText style={styles.primaryText}>Anschreiben</AppText>
          </Pressable>
        ) : !d.isMe ? (
          <AppText variant="caption" muted>{d.name} möchte keine Nachrichten bekommen.</AppText>
        ) : (
          <AppText variant="caption" muted>So sehen dich andere. Wohnort, Nachrichten und Fuhrpark stellst du in den Einstellungen ein.</AppText>
        )}
        {!d.isMe && (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={status === 'kontakt' ? `${d.name} aus Kontakten entfernen` : status === 'angefragt' ? `Anfrage an ${d.name} zurückziehen` : `${d.name} zu Kontakten hinzufügen`}
              disabled={contactBusy}
              onPress={() => void contactAction()}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              {contactBusy ? (
                <ActivityIndicator color={Colors.muted} />
              ) : (
                <>
                  <SymbolView name={status === 'kontakt' ? 'person.crop.circle.badge.checkmark' : status === 'angefragt' ? 'clock' : 'person.badge.plus'} size={18} weight="semibold" tintColor={status === 'angefragt' ? Colors.muted : Colors.text} />
                  <AppText style={[styles.secondaryText, status === 'angefragt' && { color: Colors.muted }]}>{status === 'kontakt' ? 'Kontakt' : status === 'angefragt' ? 'Angefragt' : status === 'anfrage' ? 'Bestätigen' : 'Zu Kontakten'}</AppText>
                </>
              )}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${d.name} zur Gruppenfahrt einladen`} onPress={() => setInviteOpen(true)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <SymbolView name="car.2" size={18} weight="semibold" tintColor={Colors.text} />
              <AppText style={styles.secondaryText}>Einladen</AppText>
            </Pressable>
          </View>
        )}
        {!d.isMe && <InviteSheet d={d} visible={inviteOpen} onClose={() => setInviteOpen(false)} />}
        {!d.isMe && (
          <View style={styles.quiet}>
            <Pressable accessibilityRole="button" onPress={() => setReport(true)} style={styles.quietBtn}>
              <AppText style={styles.quietText}>Melden</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setBlock(true)} style={styles.quietBtn}>
              <AppText style={styles.quietText}>Blockieren</AppText>
            </Pressable>
          </View>
        )}
        {!d.isMe && <ReportSheet visible={report} kind="profile" refId={d.id} userId={d.id} name={d.name} onClose={() => setReport(false)} />}
        {!d.isMe && <BlockSheet visible={block} userId={d.id} name={d.name} onClose={() => setBlock(false)} />}
      </Animated.View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${d.name}${meta ? `, ${meta}` : ''}`} onPress={onPress} style={[styles.card, styles.small]}>
      <View style={[styles.ringSmall, { borderColor: ringColor(d) }]}>
        <Avatar name={d.name} userId={d.id} size={40} />
        {status === 'kontakt' && <ContactCheck />}
      </View>
      <View style={styles.flex}>
        <AppText style={styles.name} numberOfLines={1}>{d.name}{d.isMe ? ' (du)' : ''}</AppText>
        {d.birthdayToday ? <AppText variant="caption" style={styles.bday}>Hat heute Geburtstag</AppText> : null}
        {meta ? <AppText variant="caption" muted numberOfLines={1}>{meta}</AppText> : null}
      </View>
      {!d.isMe && status !== 'kontakt' && <ContactButton d={d} status={status} />}
      {(canWrite || unread > 0) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `${unread} ungelesene ${unread === 1 ? 'Nachricht' : 'Nachrichten'} von ${d.name}` : `${d.name} anschreiben`}
          hitSlop={4}
          onPress={() => write(d)}
          style={[styles.round, unread > 0 && styles.roundUnread]}>
          <SymbolView name={unread ? 'bubble.left.fill' : 'bubble.left'} size={18} weight="semibold" tintColor={unread ? Colors.signal : Colors.text} />
          {unread > 0 && (
            <View style={styles.unread}>
              <AppText style={styles.unreadText}>{unread > 9 ? '9+' : unread}</AppText>
            </View>
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

/** Häkchen am Bild für bestätigte Kontakte */
function ContactCheck() {
  return (
    <View style={styles.check} accessibilityLabel="Kontakt">
      <SymbolView name="checkmark" size={9} weight="heavy" tintColor={Colors.ground} />
    </View>
  );
}

/** Plus in der Liste; nach dem Tippen grau Angefragt (Tippen zieht zurück) */
function ContactButton({ d, status }: { d: Driver; status: Contact['status'] | null }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      if (status === 'angefragt') await removeContact(d.id);
      else {
        const now = await requestContact(d.id);
        if (now === 'kontakt') showToast(`${d.name} ist jetzt dein Kontakt.`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  if (status === 'angefragt') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Anfrage an ${d.name} zurückziehen`} hitSlop={4} disabled={busy} onPress={() => void run()} style={styles.pending}>
        {busy ? <ActivityIndicator color={Colors.muted} /> : <AppText style={styles.pendingText}>Angefragt</AppText>}
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${d.name} zu Kontakten hinzufügen`} hitSlop={4} disabled={busy} onPress={() => void run()} style={styles.round}>
      {busy ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name="plus" size={18} weight="semibold" tintColor={Colors.text} />}
    </Pressable>
  );
}

/** Offene Anfragen an mich, oben unter Drivers: Annehmen oder Ablehnen */
export function ContactRequests({ list }: { list: Contact[] | null }) {
  const asks = (list ?? []).filter((c) => c.status === 'anfrage');
  const [busy, setBusy] = useState<string | null>(null);
  if (!asks.length) return null;
  const answer = async (c: Contact, yes: boolean) => {
    setBusy(c.id + yes);
    try {
      await answerContact(c.id, yes);
      if (yes) showToast(`${c.name} ist jetzt dein Kontakt.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
      <AppText variant="title">{asks.length === 1 ? 'Kontaktanfrage' : `${asks.length} Kontaktanfragen`}</AppText>
      {asks.map((c) => (
        <View key={c.id} style={styles.row}>
          <Avatar name={c.name} userId={c.id} size={40} />
          <View style={styles.flex}>
            <AppText style={styles.name} numberOfLines={1}>{c.name}</AppText>
            {c.car ? <AppText variant="caption" muted numberOfLines={1}>{c.car}</AppText> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Anfrage von ${c.name} ablehnen`} hitSlop={4} disabled={!!busy} onPress={() => void answer(c, false)} style={styles.round}>
            {busy === c.id + false ? <ActivityIndicator color={Colors.muted} /> : <SymbolView name="xmark" size={15} weight="bold" tintColor={Colors.muted} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Anfrage von ${c.name} annehmen`} disabled={!!busy} onPress={() => void answer(c, true)} style={styles.accept}>
            {busy === c.id + true ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.acceptText}>Annehmen</AppText>}
          </Pressable>
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * Zur Gruppenfahrt einladen: eigene, anstehende Ausfahrten mit freiem Platz als Auswahl im Blatt.
 * Ohne passende Ausfahrt führt das Blatt zum Anlegen einer neuen.
 */
function InviteSheet({ d, visible, onClose }: { d: Driver; visible: boolean; onClose: () => void }) {
  const [rides, setRides] = useState<Ausfahrt[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    listAusfahrten().then((l) => l.filter((x) => !x.isOver))
      .then((l) => alive && setRides(l.filter((a) => a.isOwner && a.rideStatus !== 'beendet' && freeSeats(a) > 0)))
      .catch(() => alive && setRides([]));
    return () => {
      alive = false;
    };
  }, [visible]);
  const invite = async (a: Ausfahrt) => {
    try {
      await inviteToRide(a.id, d.id);
      showToast(`${d.name} ist zu ${a.name} eingeladen.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' });
    }
  };
  const items: SheetItem[] = [
    ...(rides ?? []).map((a) => ({ key: a.id, icon: 'car.2' as const, label: a.name, hint: longDate(a.startsAt), onPress: () => void invite(a) })),
    { key: 'neu', icon: 'plus' as const, label: 'Neue Ausfahrt erstellen', primary: !rides?.length, onPress: () => router.push('/ausfahrt/neu') },
  ];
  return (
    <ActionSheet
      visible={visible}
      title={`${d.name} einladen`}
      subtitle={rides === null ? 'Deine Ausfahrten werden geladen.' : rides.length ? 'Zu welcher Ausfahrt? Die Einladung ist eine Anfrage, Funk und Live Karte gibt es erst nach der Zusage.' : 'Du hast gerade keine Ausfahrt mit freiem Platz.'}
      items={items}
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.s },
  secondary: { flex: 1, height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, flexDirection: 'row', gap: Spacing.s, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.text },
  pressed: { transform: [{ scale: Motion.pressScale }], opacity: 0.85 },
  check: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.good, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  pending: { minHeight: 44, paddingHorizontal: Spacing.m, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  pendingText: { fontFamily: Fonts.semibold, fontSize: Type.small, color: Colors.muted },
  accept: { minHeight: 44, paddingHorizontal: Spacing.l, borderRadius: 22, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  acceptText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.onSignal },
  quiet: { flexDirection: 'row', gap: Spacing.l },
  quietBtn: { minHeight: 44, justifyContent: 'center' },
  quietText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  bday: { color: Colors.text, fontFamily: Fonts.bold },
  bio: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.text, lineHeight: 21 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  small: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.m },
  ring: { borderWidth: 3, borderRadius: 30, padding: 2 },
  ringSmall: { borderWidth: 2.5, borderRadius: 25, padding: 1.5 },
  bigName: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, textTransform: 'uppercase' },
  name: { fontFamily: Fonts.semibold, fontSize: Type.title },
  label: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: Colors.muted },
  garage: { gap: Spacing.xs },
  car: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 44 },
  carName: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  roundUnread: { backgroundColor: Colors.signalTint },
  unread: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.surface },
  unreadText: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'] },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.button },
});
