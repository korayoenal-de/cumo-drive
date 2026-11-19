/**
 * Kleine Bausteine der Ausfahrten: Datumsblock (SA 14) und Status als getönte Plakette.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';


import { AppText } from '@/components/ui/text';
import { useAvatar } from '@/lib/avatars';
import { Colors, Fonts, Leading, Radius, Type } from '@/constants/theme';
import { freeSeats, initials, weekday, type Ausfahrt } from '@/lib/ausfahrten';
import { t } from '@/i18n';

/** Status als getönte Plakette */
export function RideStatus({ r }: { r: Ausfahrt }) {
  let text: string | null = null;
  let tone: 'good' | 'signal' | 'muted' | 'danger' = 'muted';
  // Abgesagt geht vor jedem anderen Status (Koray 17.11.), rot wie alles Endgültige (Konsistenzprüfung 15.11.)
  if (r.isCancelled) {
    text = t('Abgesagt');
    tone = 'danger';
  } else if (r.isOwner) {
    text = r.openRequests ? `${r.openRequests} ${r.openRequests === 1 ? 'Anfrage' : 'Anfragen'}` : t('Deine Ausfahrt');
    tone = r.openRequests ? 'signal' : 'muted';
  } else if (r.myStatus === 'zugesagt') {
    text = t('Du bist dabei');
    tone = 'good';
  } else if (r.myStatus === 'eingeladen') {
    text = t('Eingeladen');
    tone = 'signal';
  } else if (r.myStatus === 'angefragt') text = t('Angefragt');
  else if (r.myStatus === 'abgelehnt') text = t('Abgelehnt');
  else if (freeSeats(r) === 0) text = t('Ausgebucht');
  if (!text) return null;
  return (
    <View style={[styles.tag, tone === 'good' ? styles.tagGood : tone === 'signal' ? styles.tagSignal : tone === 'danger' ? styles.tagDanger : styles.tagMuted]}>
      <AppText style={[styles.tagText, { color: tone === 'good' ? Colors.good : tone === 'signal' ? Colors.signal : tone === 'danger' ? Colors.danger : Colors.muted }]}>{text}</AppText>
    </View>
  );
}

/** Datumsblock neutral, nur heute in Signal Orange (Konsistenzprüfung 15.11., C3) */
export function DateBlock({ d }: { d: Date }) {
  const now = new Date();
  const today = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return (
    <View style={[styles.date, today && styles.dateToday]} accessible={false}>
      <AppText style={[styles.dateWd, today && styles.dateSignal]}>{weekday(d).toUpperCase()}</AppText>
      <AppText style={[styles.dateDay, today && styles.dateSignal]}>{d.getDate()}</AppText>
    </View>
  );
}

/**
 * Profilfoto im Kreis (Koray 13.11.), ohne Foto die Initialen; das Foto blendet weich über die Initialen.
 * Ab 56 Punkten zeigt der Kreis den Standard Spinner wie in den Suchen, solange das Foto lädt oder busy (Hochladen) gilt.
 */
export function Avatar({ name, userId, size = 44, busy = false }: { name: string; userId?: string | null; size?: number; busy?: boolean }) {
  const url = useAvatar(userId);
  const [loaded, setLoaded] = useState<string | null>(null);
  const r = size / 2;
  const spin = size >= 56 && (busy || (!!url && loaded !== url));
  // Schrift wächst mit dem Kreis, Zeilenhöhe passend dazu (Koray 13.11.: in den Einstellungen waren die
  // Initialen oben abgeschnitten, weil die Standard Zeilenhöhe kleiner war als die Schrift)
  const fs = size < 40 ? 12 : Math.round(size * 0.34);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: r }]}>
      <AppText allowFontScaling={false} style={[styles.avatarText, { fontSize: fs, lineHeight: Math.round(fs * 1.25) }]}>{initials(name)}</AppText>
      {url && (
        <Image
          source={{ uri: url }}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          onLoad={() => setLoaded(url)}
          onError={() => setLoaded(url)}
          accessibilityIgnoresInvertColors
        />
      )}
      {spin && (
        <View style={[StyleSheet.absoluteFill, styles.spinner]}>
          <ActivityIndicator size={size >= 80 ? 'large' : 'small'} color={Colors.text} accessibilityLabel={busy ? t('Foto wird hochgeladen') : t('Foto lädt')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontFamily: Fonts.extrabold, color: Colors.text },
  spinner: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,11,12,0.6)' },
  tag: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  tagGood: { backgroundColor: Colors.goodTint },
  tagSignal: { backgroundColor: Colors.signalTint },
  tagMuted: { backgroundColor: Colors.surface2 },
  tagDanger: { backgroundColor: Colors.dangerTint },
  tagText: { fontFamily: Fonts.bold, fontSize: Type.caption },
  date: { width: 52, borderRadius: Radius.m, backgroundColor: Colors.surface2, alignItems: 'center', paddingVertical: 6 },
  dateToday: { backgroundColor: Colors.signalTint },
  dateWd: { fontFamily: Fonts.bold, fontSize: 13, lineHeight: 16, color: Colors.muted },
  dateDay: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, color: Colors.text },
  dateSignal: { color: Colors.signal },
});
