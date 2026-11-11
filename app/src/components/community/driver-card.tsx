/**
 * Karte eines Mitglieds unter Drivers: Name, Wohnort, Auto. Groß (gewählt auf der Karte) mit
 * Fuhrpark und der Hauptaktion Anschreiben, klein in der Liste mit Symbol zum Anschreiben.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@/components/community/ride-bits';
import { CarSprite, frameFor } from '@/components/map/car-sprite';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { monthYear } from '@/lib/ausfahrten';
import { type Driver } from '@/lib/drivers';

/** Wagenfarbe des ersten Autos als Ring um den Kreis, sonst weiß */
export const ringColor = (d: Driver) => d.garage?.find((g) => g.look)?.look?.color ?? Colors.text;

const write = (d: Driver) => router.push({ pathname: '/nachrichten/[id]', params: { id: d.id, name: d.name } });

export function DriverCard({ d, big, unread = 0, onPress }: { d: Driver; big?: boolean; /** ungelesene Nachrichten von diesem Fahrer (Koray 10.11.) */ unread?: number; onPress?: () => void }) {
  const meta = [d.car, d.homeName ? `Raum ${d.homeName}` : null].filter(Boolean).join('  ·  ');
  const canWrite = !d.isMe && d.allowMessages;

  if (big) {
    return (
      <Animated.View entering={FadeIn.duration(Motion.enter)} style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.ring, { borderColor: ringColor(d) }]}>
            <Avatar name={d.name} size={48} />
          </View>
          <View style={styles.flex}>
            <AppText style={styles.bigName} numberOfLines={1}>{d.name}{d.isMe ? ' (du)' : ''}</AppText>
            {d.birthdayToday ? <AppText variant="caption" style={styles.bday}>Hat heute Geburtstag</AppText> : null}
            <AppText variant="caption" muted numberOfLines={1}>
              {[d.age != null ? `${d.age} Jahre` : null, d.homeName ? `Raum ${d.homeName}` : 'Wohnort nicht angegeben', d.memberSince ? `dabei seit ${monthYear(d.memberSince)}` : null].filter(Boolean).join('  ·  ')}
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
      </Animated.View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${d.name}${meta ? `, ${meta}` : ''}`} onPress={onPress} style={[styles.card, styles.small]}>
      <View style={[styles.ringSmall, { borderColor: ringColor(d) }]}>
        <Avatar name={d.name} size={40} />
      </View>
      <View style={styles.flex}>
        <AppText style={styles.name} numberOfLines={1}>{d.name}{d.isMe ? ' (du)' : ''}</AppText>
        {d.birthdayToday ? <AppText variant="caption" style={styles.bday}>Hat heute Geburtstag</AppText> : null}
        {meta ? <AppText variant="caption" muted numberOfLines={1}>{meta}</AppText> : null}
      </View>
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

const styles = StyleSheet.create({
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
