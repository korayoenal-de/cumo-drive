/**
 * Overlays in der Navigation:
 * HighlightCard kündigt einen Pass oder eine kuratierte Strecke kurz vorher an
 * (In 500 m, Stilfser Joch, 40 km, 76 Kehren; In 500 m, Zotzenbach, alte Rallyestrecke, 7 km;
 * In 500 m, Schauinsland, ehemalige Bergrennstrecke, 11 km).
 * StopAlert zeigt allen in der Gruppe groß, dass die Lead gleich anhält.
 * LeadStopButton ist der schnelle Knopf der Lead, um den Halt anzusagen.
 * MessageToast zeigt Kurznachrichten der anderen für ein paar Sekunden.
 */
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GlassPanel } from '@/components/ui/glass-panel';
import { AppText } from '@/components/ui/text';
import { WarnLabel, ZigzagIcon } from '@/components/ui/warn-label';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import type { FunkState } from '@/lib/group/funk';
import { STOP_REASONS, type RideMsg, type RideStop, type StopReason } from '@/lib/group/ride';
import { highlightFacts, type Highlight } from '@/lib/navigation/highlights';
import { warnRest, warnSpeech } from '@/lib/passes';
import { formatKm } from '@/lib/tour';

import { formatDistance } from './format';
import type { NavSymbol } from './maneuver-geometry';
import { NavSymbolIcon } from './maneuver-icon';
import { FUN_NAMES, FunGauge, toFunLevel } from '@/components/ui/fun-gauge';

const HIGHLIGHT_SYMBOL: Record<Highlight['kind'], NavSymbol> = { pass: 'passhoehe', rallye: 'kehre', strecke: 'kehre', aussicht: 'aussicht', bergrennen: 'kehre' };

export function HighlightCard({ h, distM }: { h: Highlight; distM: number }) {
  const d = formatDistance(Math.max(0, distM));
  return (
    <GlassPanel style={styles.card} fallback={Colors.overlay}>
      <View style={styles.row} accessible accessibilityRole="alert" accessibilityLabel={`${distM > 50 ? `In ${d.value} ${d.unit === 'm' ? 'Metern' : 'Kilometern'}` : 'Jetzt'} ${h.name}, ${highlightFacts(h)}${h.warn?.length ? `. Warnung: ${warnSpeech(h.warn)}` : ''}`}>
        <NavSymbolIcon symbol={HIGHLIGHT_SYMBOL[h.kind]} size={44} soon />
        <View style={styles.flex}>
          <AppText variant="caption" style={styles.kicker}>
            {`${distM > 50 ? `In ${d.value} ${d.unit}` : 'Jetzt'} · ${FUN_NAMES[toFunLevel(h.level)]}`}
          </AppText>
          {/* Warnung als Label über dem Namen, weitere Gründe vor den Fakten (Konzept 12.11.) */}
          <WarnLabel warn={h.warn} />
          <AppText style={styles.title} numberOfLines={1}>
            {h.name}
          </AppText>
          <AppText variant="caption" muted style={styles.num}>
            {[warnRest(h.warn)?.replace(/\.$/, ''), highlightFacts(h)].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        <FunGauge level={toFunLevel(h.level)} size={44} animate />
      </View>
    </GlassPanel>
  );
}

/**
 * Hinweis während der Fahrt auf einem Highlight (Konzept Highlight Ansage, Variante A, 7.11.2026):
 * schmale Zeile unten in der Routenführung mit Logo, Name, Restlänge und Fortschritt in Orange.
 * Antippen zeigt die Ankündigung noch einmal für 5 s.
 */
export function HighlightStrip({ h, atKm, onPress }: { h: Highlight; atKm: number; onPress?: () => void }) {
  const len = Math.max(0.01, h.endKm - h.startKm);
  const done = Math.min(1, Math.max(0, (atKm - h.startKm) / len));
  const rest = Math.max(0, h.endKm - atKm);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Auf ${h.name}, noch ${formatKm(rest, 1)} Kilometer. Antippen zeigt die Ansage`}
      onPress={onPress}
      style={styles.strip}>
      <View style={styles.stripRow}>
        <FunGauge level={toFunLevel(h.level)} size={20} />
        {/* Im Abschnitt spricht das Highlight, nur das kleine Zeichen erinnert an die Warnung */}
        {h.warn?.length ? <ZigzagIcon size={16} /> : null}
        <AppText style={styles.stripName} numberOfLines={1}>
          {h.name}
        </AppText>
        <AppText style={styles.stripRest}>noch {formatKm(rest, rest < 10 ? 1 : 0)} km</AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(done * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

export function StopAlert({ stop, distM, mine, onDismiss, onCancel }: { stop: RideStop; distM: number | null; mine: boolean; onDismiss: () => void; onCancel: () => void }) {
  const r = STOP_REASONS.find((x) => x.id === stop.reason) ?? STOP_REASONS[0];
  const d = distM != null ? formatDistance(distM) : null;
  return (
    <GlassPanel style={[styles.card, styles.stop]} fallback="rgba(90,30,14,0.97)" tint="rgba(150,45,15,0.75)">
      <View accessible accessibilityRole="alert" style={styles.gapS}>
        <AppText variant="caption" style={styles.stopKicker}>
          {mine ? 'An die Gruppe gesendet' : `${stop.name} hält gleich an`}
        </AppText>
        <AppText style={styles.stopTitle}>{mine ? r.label : 'Gleich anhalten'}</AppText>
        <AppText style={styles.stopText}>
          {r.title}
          {!mine && d && distM! > 30 ? `, Lead ist ${d.value} ${d.unit} vor dir.` : '.'}
        </AppText>
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={onDismiss} style={({ pressed }) => [styles.stopBtn, styles.flex, pressed && styles.pressed]}>
          <AppText style={styles.stopBtnText}>{mine ? 'Ausblenden' : 'Verstanden'}</AppText>
        </Pressable>
        {mine && (
          <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.stopBtn, styles.flex, pressed && styles.pressed]}>
            <AppText style={styles.stopBtnText}>Zurücknehmen</AppText>
          </Pressable>
        )}
      </View>
    </GlassPanel>
  );
}

/**
 * Halt der Lead (Funk Konzept, Koray 10.11.): helle Pille oben rechts unter der Abbiegekarte, getrennt vom
 * Funk. Antippen fächert die Gründe gestaffelt nach unten auf, ein Tipp sendet. Die Pille wird dabei zum Schließen.
 */
export function LeadHaltPill({ onAnnounce }: { onAnnounce: (r: StopReason) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.haltWrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Gründe schließen' : 'Halt an die Gruppe ansagen'}
        accessibilityState={{ expanded: open }}
        hitSlop={4}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.haltPill, pressed && styles.pressed]}>
        {open ? (
          <SymbolView name="xmark" size={14} weight="bold" tintColor={Colors.ground} />
        ) : (
          <View style={styles.haltDot}>
            <View style={styles.haltSquare} />
          </View>
        )}
        <AppText style={styles.haltText}>{open ? 'Schließen' : 'Halt'}</AppText>
      </Pressable>
      {open &&
        STOP_REASONS.map((r, i) => (
          <Animated.View key={r.id} entering={FadeIn.delay(i * 45).duration(Motion.enter)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Halt ansagen: ${r.label}`}
              onPress={() => {
                onAnnounce(r.id);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.haltReason, pressed && styles.pressed]}>
              <AppText style={styles.reasonText}>{r.label}</AppText>
            </Pressable>
          </Animated.View>
        ))}
    </View>
  );
}

/** Funk Banner oben: ich spreche (orange), ein anderer spricht (mit Name) oder der Funk ist kurz getrennt. */
export function FunkBanner({ funk }: { funk: FunkState }) {
  const mine = funk.talking;
  const text = mine ? 'Du sprichst' : funk.speaker ? `${funk.speaker.name} spricht` : 'Funk getrennt, verbinde neu';
  return (
    <Animated.View entering={FadeIn.duration(Motion.enter)} accessibilityLiveRegion="polite" accessibilityLabel={text} style={[styles.funkBanner, mine && styles.funkMine, !mine && !funk.speaker && styles.funkLost]}>
      <SymbolView name={funk.speaker || mine ? 'waveform' : 'wifi.exclamationmark'} size={20} weight="bold" tintColor={mine ? Colors.onSignal : funk.speaker ? Colors.good : Colors.ground} />
      <AppText style={[styles.funkText, mine && { color: Colors.onSignal }, !mine && !funk.speaker && { color: Colors.ground }]} numberOfLines={1}>
        {text}
      </AppText>
    </Animated.View>
  );
}

export function MessageToast({ msg }: { msg: RideMsg }) {
  return (
    <GlassPanel style={[styles.card, styles.toast]} fallback={Colors.overlay}>
      <View accessible accessibilityRole="alert">
        <AppText variant="caption" muted>
          {msg.name}
        </AppText>
        <AppText style={styles.toastText}>{msg.text}</AppText>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapS: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  card: { borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  kicker: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  // Highlight Namen wie Tournamen: Versalien in Archivo Black (Typografie Mittelweg)
  title: { fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: 28, textTransform: 'uppercase' },
  num: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, fontVariant: ['tabular-nums'] },
  stop: { padding: Spacing.xl },
  stopKicker: { fontFamily: Fonts.semibold, color: 'rgba(255,255,255,0.8)' },
  stopTitle: { fontFamily: Fonts.display, fontSize: 32, lineHeight: 36, color: Colors.onSignal },
  stopText: { fontFamily: Fonts.medium, fontSize: Type.title, color: Colors.onSignal },
  stopBtn: { height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stopBtnText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.onSignal },
  funkBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, minHeight: 52, paddingHorizontal: Spacing.l, borderRadius: Radius.l, backgroundColor: Colors.ground },
  funkMine: { backgroundColor: Colors.signal },
  funkLost: { backgroundColor: Colors.warn },
  funkText: { flex: 1, fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  haltWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', gap: Spacing.s },
  haltPill: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 18, borderRadius: Radius.pill, backgroundColor: Colors.text, boxShadow: '0 6px 18px rgba(0,0,0,0.4)' },
  haltDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.ground, alignItems: 'center', justifyContent: 'center' },
  haltSquare: { width: 9, height: 9, borderRadius: 3, backgroundColor: Colors.text },
  haltText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.ground },
  haltReason: { height: 56, minWidth: 150, paddingHorizontal: Spacing.xl, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.4)' },
  reasonText: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.onSignal },
  toast: { paddingVertical: Spacing.m },
  toastText: { fontFamily: Fonts.semibold, fontSize: Type.title },
  pressed: { opacity: 0.75 },
  strip: { gap: Spacing.s, paddingTop: Spacing.m },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  stripName: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.small, color: Colors.text },
  stripRest: { fontFamily: Fonts.semibold, fontSize: Type.small, color: Colors.muted, fontVariant: ['tabular-nums'] },
  track: { height: 3, borderRadius: 2, backgroundColor: Colors.line, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: Colors.signal },
});
