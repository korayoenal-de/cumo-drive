/**
 * Bausteine des Navigationsscreens: Manöver Karte oben, Leiste unten, Zustands Karten.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/action-bar';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Shadow, Spacing, Type } from '@/constants/theme';
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
export function ManeuverCard({ maneuver, distM, then, soon = false, footer }: { maneuver: Maneuver; distM: number | null; then?: Maneuver; soon?: boolean; footer?: ReactNode }) {
  const d = formatDistance(distM);
  return (
    <GlassPanel style={styles.maneuver} fallback={Colors.overlay}>
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
      {footer}
    </GlassPanel>
  );
}

export function InfoCard({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'signal' | 'good' }) {
  return (
    <GlassPanel
      style={styles.info}
      fallback={tone === 'signal' ? SIGNAL_OVERLAY : tone === 'good' ? GOOD_OVERLAY : Colors.overlay}
      tint={tone === 'signal' ? 'rgba(90,30,14,0.6)' : tone === 'good' ? 'rgba(20,60,42,0.6)' : undefined}>
      {children}
    </GlassPanel>
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
  /** Anteil der Route, der schon gefahren ist, 0 bis 100 */
  donePct: number;
  /** Lage der Zwischenziele auf der Route, 0 bis 100 */
  viaPct: number[];
};

/**
 * Leiste unten (Entwurf B, 6.11.): Ankunft in Titelgröße, daneben Restzeit und Strecke, darunter
 * der Fortschritt als Balken mit dezenten Marken für die Zwischenziele. Rechts Ton und ein runder Knopf,
 * der Pausieren und Beenden aufklappt (Aufklappen statt Wechseln).
 */
export function BottomBar({
  eta, remainingKm, extra, voice, group, paused, showSim, bottomInset, onEnd, onPause, onVoice, onSecret, onSimulate, onFunk,
}: {
  eta: Date | null;
  remainingKm: number | null;
  extra?: NavExtra;
  voice: boolean;
  group: boolean;
  paused: boolean;
  showSim: boolean;
  bottomInset: number;
  onEnd: () => void;
  onPause: (on: boolean) => void;
  onVoice: () => void;
  onSecret: () => void;
  onSimulate: () => void;
  /** Gruppenfahrt aktiv: Funk Knopf öffnet die Kurznachrichten */
  onFunk?: () => void;
}) {
  const now = useNow();
  const [funkHint, setFunkHint] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!funkHint) return;
    const t = setTimeout(() => setFunkHint(false), 2500);
    return () => clearTimeout(t);
  }, [funkHint]);
  // Aufgeklappte Aktionen klappen nach 4 Sekunden von selbst zu
  useEffect(() => {
    if (!menu) return;
    const t = setTimeout(() => setMenu(false), 4000);
    return () => clearTimeout(t);
  }, [menu]);

  const km = remainingKm != null ? `${remainingKm.toFixed(remainingKm < 10 ? 1 : 0).replace('.', ',')} km` : '';
  const rest = paused ? 'Pausiert' : [formatRemaining(eta, now), km].filter(Boolean).join(' · ');
  const done = extra ? Math.max(0, Math.min(100, extra.donePct)) : null;
  const actions = [
    paused
      ? { key: 'weiter', label: 'Fortsetzen', icon: 'play.fill' as const, signal: false, run: () => onPause(false) }
      : { key: 'pause', label: 'Pausieren', icon: 'pause.fill' as const, signal: false, run: () => onPause(true) },
    { key: 'ende', label: 'Fahrt beenden', icon: 'stop.fill' as const, signal: true, run: onEnd },
  ];

  return (
    <View>
      {menu && (
        <View style={[styles.menu, { bottom: '100%' }]} pointerEvents="box-none">
          {actions.map((a, i) => (
            <Animated.View key={a.key} entering={softEnter(i)}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMenu(false);
                  a.run();
                }}
                style={({ pressed }) => [styles.pill, a.signal && styles.pillSignal, pressed && styles.pressed]}>
                <SymbolView name={a.icon} size={16} tintColor={a.signal ? Colors.onSignal : Colors.text} />
                <AppText style={[styles.pillText, a.signal && { color: Colors.onSignal }]}>{a.label}</AppText>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
      <GlassPanel style={[styles.bar, { paddingBottom: bottomInset }]} fallback="rgba(11,11,12,0.96)">
        {funkHint && (
          <View style={styles.funkHint}>
            <AppText variant="caption">Funk folgt bald.</AppText>
          </View>
        )}
        <View style={styles.barRow}>
          <Pressable onLongPress={onSecret} delayLongPress={800} style={styles.etaBox} accessibilityLabel={`Ankunft ${formatClock(eta)}, ${rest}`}>
            <View style={styles.etaLine}>
              <AppText style={styles.eta}>{formatClock(eta) || '--:--'}</AppText>
              <AppText style={[styles.rest, paused && { color: Colors.warn }]} numberOfLines={1}>
                {rest}
              </AppText>
            </View>
            {done != null && (
              <View style={styles.track} accessibilityLabel={`${done} Prozent gefahren`}>
                <View style={[styles.fill, { width: `${done}%` }]} />
                {extra!.viaPct.map((v) => (
                  <View key={v} style={[styles.via, { left: `${v}%` }, v <= done && styles.viaDone]} />
                ))}
              </View>
            )}
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={menu ? 'Schließen' : 'Fahrt pausieren oder beenden'}
            onPress={() => setMenu(!menu)}
            style={({ pressed }) => [styles.round, menu ? styles.roundOpen : styles.roundSignal, pressed && styles.pressed]}>
            <SymbolView
              name={menu ? 'xmark' : paused ? 'play.fill' : 'stop.fill'}
              size={menu ? 18 : 17}
              weight="bold"
              tintColor={menu ? Colors.ground : Colors.onSignal}
            />
          </Pressable>
        </View>
        {showSim && (
          <Pressable accessibilityRole="button" onPress={onSimulate} style={styles.sim}>
            <AppText variant="caption" muted>Simulieren</AppText>
          </Pressable>
        )}
      </GlassPanel>
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

  maneuver: { borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  maneuverRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l },
  arrowBox: { width: 84, height: 84, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  exit: { position: 'absolute', bottom: 2, fontFamily: Fonts.bold, fontSize: 10, color: Colors.onSignal },
  dist: { fontFamily: Fonts.display, fontSize: 46, lineHeight: 50, fontVariant: ['tabular-nums'] },
  distUnit: { fontFamily: Fonts.display, fontSize: Type.h2, color: Colors.muted, textTransform: 'uppercase' },
  instruction: { fontFamily: Fonts.bold, fontSize: Type.button, lineHeight: 23 },
  street: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, marginTop: 2 },
  then: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingTop: Spacing.m },

  info: { borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },

  bar: { borderTopLeftRadius: Radius.l, borderTopRightRadius: Radius.l, paddingHorizontal: Spacing.xl, paddingTop: Spacing.l, gap: Spacing.s },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  etaBox: { flex: 1, minWidth: 0, gap: Spacing.s, paddingVertical: Spacing.xs },
  etaLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.s },
  eta: { fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: 28, fontVariant: ['tabular-nums'] },
  rest: { flexShrink: 1, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.surface2, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: Colors.signal },
  via: { position: 'absolute', width: 2, height: 6, marginLeft: -1, backgroundColor: Colors.muted, opacity: 0.7 },
  viaDone: { backgroundColor: Colors.onSignal, opacity: 0.6 },
  round: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  roundSignal: { backgroundColor: Colors.signal },
  roundOpen: { backgroundColor: Colors.text },
  menu: { position: 'absolute', right: Spacing.xl, paddingBottom: Spacing.m, alignItems: 'flex-end', gap: Spacing.s },
  pill: { height: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingLeft: Spacing.l, paddingRight: Spacing.xl, borderRadius: 26, backgroundColor: Colors.surface2, boxShadow: Shadow.sheet },
  pillSignal: { backgroundColor: Colors.signal },
  pillText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.text },
  funk: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.surface2, borderWidth: 2, borderColor: Colors.good, alignItems: 'center', justifyContent: 'center' },
  funkHint: { position: 'absolute', top: -44, alignSelf: 'center', backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: Spacing.l, height: 34, justifyContent: 'center' },
  sim: { alignSelf: 'flex-start', height: 30, paddingHorizontal: Spacing.m, borderRadius: Radius.pill, backgroundColor: Colors.surface, justifyContent: 'center' },

  big: { height: 60, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  bigText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  ghost: { height: 52, borderRadius: Radius.m, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: Fonts.semibold, fontSize: Type.input },
});
