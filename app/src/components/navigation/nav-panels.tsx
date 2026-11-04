/**
 * Bausteine des Navigationsscreens: Manöver Karte oben, Leiste unten, Zustands Karten.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import type { Maneuver } from '@/lib/navigation/types';

import { formatClock, formatDistance, formatRemaining } from './format';
import { ManeuverIcon, MicIcon, SpeakerIcon } from './maneuver-icon';

export function ManeuverCard({ maneuver, distM, then }: { maneuver: Maneuver; distM: number | null; then?: Maneuver }) {
  const d = formatDistance(distM);
  return (
    <View style={styles.maneuver}>
      <View style={styles.maneuverRow}>
        <View style={styles.arrowBox}>
          <ManeuverIcon kind={maneuver.kind} size={72} />
          {maneuver.kind === 'kreisverkehr' && maneuver.exit != null && (
            <AppText style={styles.exit}>{maneuver.exit}. Ausfahrt</AppText>
          )}
        </View>
        <View style={styles.flex}>
          {d.value !== '' && (
            <AppText style={styles.dist}>
              {d.value}
              <AppText style={styles.distUnit}> {d.unit}</AppText>
            </AppText>
          )}
          <AppText style={styles.instruction} numberOfLines={2}>{maneuver.text}</AppText>
          {maneuver.street ? (
            <AppText style={styles.street} numberOfLines={1}>{maneuver.street}</AppText>
          ) : null}
        </View>
      </View>
      {then && (
        <View style={styles.then}>
          <AppText variant="caption" muted>Dann</AppText>
          <ManeuverIcon kind={then.kind} size={22} color={Colors.muted} />
          <AppText variant="caption" muted numberOfLines={1} style={styles.flex}>{then.text}</AppText>
        </View>
      )}
    </View>
  );
}

export function InfoCard({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'signal' | 'good' }) {
  return (
    <View style={[styles.info, tone === 'signal' && styles.infoSignal, tone === 'good' && styles.infoGood]}>{children}</View>
  );
}

export function Recalculating({ first = false }: { first?: boolean }) {
  return (
    <InfoCard>
      <View style={styles.row}>
        <ActivityIndicator color={Colors.text} />
        <View style={styles.flex}>
          <AppText variant="title">{first ? 'Route wird geladen' : 'Route wird neu berechnet'}</AppText>
          <AppText variant="caption" muted>
            {first ? 'Anweisungen für die Tour werden geholt.' : 'Du bist von der Tour abgewichen.'}
          </AppText>
        </View>
      </View>
    </InfoCard>
  );
}

/** Aktuelle Zeit, jede halbe Minute neu, für die Restzeit. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function BottomBar({
  eta, remainingKm, voice, group, showSim, bottomInset, onEnd, onVoice, onSecret, onSimulate,
}: {
  eta: Date | null;
  remainingKm: number | null;
  voice: boolean;
  group: boolean;
  showSim: boolean;
  bottomInset: number;
  onEnd: () => void;
  onVoice: () => void;
  onSecret: () => void;
  onSimulate: () => void;
}) {
  const now = useNow();
  const [funkHint, setFunkHint] = useState(false);
  useEffect(() => {
    if (!funkHint) return;
    const t = setTimeout(() => setFunkHint(false), 2500);
    return () => clearTimeout(t);
  }, [funkHint]);

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset }]}>
      {funkHint && (
        <View style={styles.funkHint}>
          <AppText variant="caption">Funk folgt bald.</AppText>
        </View>
      )}
      <View style={styles.barRow}>
        <Pressable onLongPress={onSecret} delayLongPress={800} style={styles.flex} accessibilityLabel="Ankunftszeit">
          <AppText style={styles.eta}>{formatClock(eta) || '--:--'}</AppText>
          <AppText variant="caption" muted>
            {remainingKm != null ? `${remainingKm.toFixed(remainingKm < 10 ? 1 : 0).replace('.', ',')} km` : ''}
            {remainingKm != null && eta ? '  ·  ' : ''}
            {formatRemaining(eta, now)}
          </AppText>
        </Pressable>

        {group && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Funk"
            onPress={() => setFunkHint(true)}
            style={({ pressed }) => [styles.funk, pressed && styles.pressed]}>
            <MicIcon />
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voice ? 'Ansagen aus' : 'Ansagen an'}
          onPress={onVoice}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <SpeakerIcon on={voice} color={voice ? Colors.text : Colors.muted} />
        </Pressable>

        <Pressable accessibilityRole="button" onPress={onEnd} style={({ pressed }) => [styles.end, pressed && styles.pressed]}>
          <AppText style={styles.endText}>Beenden</AppText>
        </Pressable>
      </View>
      {showSim && (
        <Pressable accessibilityRole="button" onPress={onSimulate} style={styles.sim}>
          <AppText variant="caption" muted>Simulieren</AppText>
        </Pressable>
      )}
    </View>
  );
}

export function BigButton({ label, onPress, kind = 'signal' }: { label: string; onPress: () => void; kind?: 'signal' | 'ghost' }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [kind === 'signal' ? styles.big : styles.ghost, pressed && styles.pressed]}>
      <AppText style={kind === 'signal' ? styles.bigText : styles.ghostText}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  pressed: { opacity: 0.8 },

  maneuver: { backgroundColor: 'rgba(11,11,12,0.94)', borderRadius: Radius.l, padding: Spacing.l, borderWidth: 1, borderColor: Colors.line, gap: Spacing.m },
  maneuverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l },
  arrowBox: { width: 84, height: 84, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  exit: { position: 'absolute', bottom: 2, fontFamily: Fonts.bold, fontSize: 10, color: Colors.onSignal },
  dist: { fontFamily: Fonts.display, fontSize: 46, lineHeight: 50, fontVariant: ['tabular-nums'] },
  distUnit: { fontFamily: Fonts.displayBold, fontSize: 24, color: Colors.muted },
  instruction: { fontFamily: Fonts.semibold, fontSize: 18, lineHeight: 23 },
  street: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.muted, marginTop: 2 },
  then: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line, paddingTop: Spacing.s },

  info: { backgroundColor: 'rgba(11,11,12,0.94)', borderRadius: Radius.l, padding: Spacing.l, borderWidth: 1, borderColor: Colors.line, gap: Spacing.m },
  infoSignal: { borderColor: Colors.signal },
  infoGood: { borderColor: Colors.good },

  bar: { backgroundColor: 'rgba(11,11,12,0.96)', borderTopLeftRadius: Radius.l, borderTopRightRadius: Radius.l, paddingHorizontal: Spacing.xl, paddingTop: Spacing.l, gap: Spacing.s, borderWidth: 1, borderColor: Colors.line, borderBottomWidth: 0 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  eta: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] },
  round: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: Colors.line, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  funk: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.surface2, borderWidth: 2, borderColor: Colors.good, alignItems: 'center', justifyContent: 'center' },
  funkHint: { position: 'absolute', top: -44, alignSelf: 'center', backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: Spacing.l, height: 34, justifyContent: 'center' },
  end: { height: 52, paddingHorizontal: Spacing.l, borderRadius: Radius.m, backgroundColor: Colors.signal, justifyContent: 'center' },
  endText: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.onSignal },
  sim: { alignSelf: 'flex-start', height: 30, paddingHorizontal: Spacing.m, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.line, justifyContent: 'center' },

  big: { height: 60, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  bigText: { fontFamily: Fonts.display, fontSize: 20, color: Colors.onSignal, textTransform: 'uppercase', letterSpacing: 1 },
  ghost: { height: 52, borderRadius: Radius.m, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: Fonts.semibold, fontSize: 16 },
});
