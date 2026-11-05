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
import { GlassPanel } from '@/components/ui/glass-panel';

/**
 * Zustands Karten über der Karte: Colors.signalTint und Colors.goodTint auf Ground verrechnet,
 * damit die Fläche deckend genug bleibt und die Karte nicht durchscheint.
 */
const SIGNAL_OVERLAY = 'rgba(41,19,14,0.96)';
const GOOD_OVERLAY = 'rgba(19,33,27,0.96)';

/** soon: das Manöver steht kurz bevor (etwa 150 m), dann stupst der Pfeil an. */
export function ManeuverCard({ maneuver, distM, then, soon = false }: { maneuver: Maneuver; distM: number | null; then?: Maneuver; soon?: boolean }) {
  const d = formatDistance(distM);
  return (
    <GlassPanel style={styles.maneuver} fallback="rgba(11,11,12,0.94)">
      <View style={styles.maneuverRow}>
        <View style={styles.arrowBox}>
          <ManeuverIcon kind={maneuver.kind} exit={maneuver.exit} size={72} soon={soon} />
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
          <ManeuverIcon kind={then.kind} exit={then.exit} size={22} color={Colors.muted} />
          <AppText variant="caption" muted numberOfLines={1} style={styles.flex}>{then.text}</AppText>
        </View>
      )}
    </GlassPanel>
  );
}

export function InfoCard({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'signal' | 'good' }) {
  return (
    <GlassPanel
      style={styles.info}
      fallback={tone === 'signal' ? SIGNAL_OVERLAY : tone === 'good' ? GOOD_OVERLAY : 'rgba(11,11,12,0.94)'}
      tint={tone === 'signal' ? 'rgba(90,30,14,0.6)' : tone === 'good' ? 'rgba(20,60,42,0.6)' : undefined}>
      {children}
    </GlassPanel>
  );
}

function Extra({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.extra}>
      <AppText style={styles.extraValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" muted numberOfLines={1}>
        {label}
      </AppText>
    </View>
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

export type NavExtra = {
  /** Anteil der Route, der schon gefahren ist */
  donePct: number;
  nextLabel: string;
  nextKm: number;
  nextMin: number;
  drivenKm: number;
  startedAt: number | null;
};

export function BottomBar({
  eta, remainingKm, extra, voice, group, showSim, bottomInset, onEnd, onVoice, onSecret, onSimulate, onFunk,
}: {
  eta: Date | null;
  remainingKm: number | null;
  /** Zusätzliche Werte über der Ankunftszeit */
  extra?: NavExtra;
  voice: boolean;
  group: boolean;
  showSim: boolean;
  bottomInset: number;
  onEnd: () => void;
  onVoice: () => void;
  onSecret: () => void;
  onSimulate: () => void;
  /** Gruppenfahrt aktiv: Funk Knopf öffnet die Kurznachrichten */
  onFunk?: () => void;
}) {
  const now = useNow();
  const [funkHint, setFunkHint] = useState(false);
  useEffect(() => {
    if (!funkHint) return;
    const t = setTimeout(() => setFunkHint(false), 2500);
    return () => clearTimeout(t);
  }, [funkHint]);

  return (
    <GlassPanel style={[styles.bar, { paddingBottom: bottomInset }]} fallback="rgba(11,11,12,0.96)">
      {funkHint && (
        <View style={styles.funkHint}>
          <AppText variant="caption">Funk folgt bald.</AppText>
        </View>
      )}
      {extra && (
        <View style={styles.extraRow}>
          <Extra value={`${Math.max(0, Math.min(100, extra.donePct))} %`} label="gefahren" />
          <Extra
            value={`${extra.nextKm.toFixed(extra.nextKm < 10 ? 1 : 0).replace('.', ',')} km`}
            label={`${extra.nextLabel}, ${extra.nextMin < 60 ? `${Math.max(1, Math.round(extra.nextMin))} min` : `${Math.floor(extra.nextMin / 60)}:${String(Math.round(extra.nextMin % 60)).padStart(2, '0')} h`}`}
          />
          <Extra
            value={(() => {
              const h = extra.startedAt ? (now - extra.startedAt) / 3600000 : 0;
              return h > 0.02 && extra.drivenKm > 0.3 ? `${Math.round(extra.drivenKm / h)} km/h` : '--';
            })()}
            label="Schnitt"
          />
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
            onPress={() => (onFunk ? onFunk() : setFunkHint(true))}
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
    </GlassPanel>
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

  maneuver: { borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  maneuverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l },
  arrowBox: { width: 84, height: 84, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  exit: { position: 'absolute', bottom: 2, fontFamily: Fonts.bold, fontSize: 10, color: Colors.onSignal },
  dist: { fontFamily: Fonts.display, fontSize: 46, lineHeight: 50, fontVariant: ['tabular-nums'] },
  distUnit: { fontFamily: Fonts.displayBold, fontSize: 24, color: Colors.muted },
  instruction: { fontFamily: Fonts.semibold, fontSize: 18, lineHeight: 23 },
  street: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.muted, marginTop: 2 },
  then: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingTop: Spacing.m },

  info: { borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },

  bar: { borderTopLeftRadius: Radius.l, borderTopRightRadius: Radius.l, paddingHorizontal: Spacing.xl, paddingTop: Spacing.l, gap: Spacing.s },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  eta: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] },
  extraRow: { flexDirection: 'row', gap: Spacing.s, paddingBottom: Spacing.m },
  extra: { flex: 1, minWidth: 0, gap: 2 },
  extraValue: { fontFamily: Fonts.displayBold, fontSize: 18, fontVariant: ['tabular-nums'] },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  funk: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.surface2, borderWidth: 2, borderColor: Colors.good, alignItems: 'center', justifyContent: 'center' },
  funkHint: { position: 'absolute', top: -44, alignSelf: 'center', backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: Spacing.l, height: 34, justifyContent: 'center' },
  end: { height: 52, paddingHorizontal: Spacing.l, borderRadius: Radius.m, backgroundColor: Colors.signal, justifyContent: 'center' },
  endText: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.onSignal },
  sim: { alignSelf: 'flex-start', height: 30, paddingHorizontal: Spacing.m, borderRadius: Radius.pill, backgroundColor: Colors.surface, justifyContent: 'center' },

  big: { height: 60, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  bigText: { fontFamily: Fonts.bold, fontSize: 18, color: Colors.onSignal },
  ghost: { height: 52, borderRadius: Radius.m, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: Fonts.semibold, fontSize: 16 },
});
