/**
 * Kleine Bausteine der Ausfahrten: Datumsblock (SA 14) und Status als getönte Plakette.
 */
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Radius, Type } from '@/constants/theme';
import { freeSeats, initials, weekday, type Ausfahrt } from '@/lib/ausfahrten';

/** Status als getönte Plakette */
export function RideStatus({ r }: { r: Ausfahrt }) {
  let text: string | null = null;
  let tone: 'good' | 'signal' | 'muted' = 'muted';
  if (r.isOwner) {
    text = r.openRequests ? `${r.openRequests} ${r.openRequests === 1 ? 'Anfrage' : 'Anfragen'}` : 'Deine Ausfahrt';
    tone = r.openRequests ? 'signal' : 'muted';
  } else if (r.myStatus === 'zugesagt') {
    text = 'Du bist dabei';
    tone = 'good';
  } else if (r.myStatus === 'eingeladen') {
    text = 'Eingeladen';
    tone = 'signal';
  } else if (r.myStatus === 'angefragt') text = 'Angefragt';
  else if (r.myStatus === 'abgelehnt') text = 'Abgelehnt';
  else if (freeSeats(r) === 0) text = 'Ausgebucht';
  if (!text) return null;
  return (
    <View style={[styles.tag, tone === 'good' ? styles.tagGood : tone === 'signal' ? styles.tagSignal : styles.tagMuted]}>
      <AppText style={[styles.tagText, { color: tone === 'good' ? Colors.good : tone === 'signal' ? Colors.signal : Colors.muted }]}>{text}</AppText>
    </View>
  );
}

export function DateBlock({ d }: { d: Date }) {
  return (
    <View style={styles.date} accessible={false}>
      <AppText style={styles.dateWd}>{weekday(d).toUpperCase()}</AppText>
      <AppText style={styles.dateDay}>{d.getDate()}</AppText>
    </View>
  );
}

/** Initialen im Kreis als Profilbild */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <AppText style={[styles.avatarText, { fontSize: size < 40 ? 12 : 15 }]}>{initials(name)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Fonts.extrabold, color: Colors.text },
  tag: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  tagGood: { backgroundColor: Colors.goodTint },
  tagSignal: { backgroundColor: Colors.signalTint },
  tagMuted: { backgroundColor: Colors.surface2 },
  tagText: { fontFamily: Fonts.bold, fontSize: Type.caption },
  date: { width: 52, borderRadius: Radius.m, backgroundColor: Colors.signalTint, alignItems: 'center', paddingVertical: 6 },
  dateWd: { fontFamily: Fonts.bold, fontSize: 12, lineHeight: 14, color: Colors.signal },
  dateDay: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, color: Colors.signal },
});
