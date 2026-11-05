/**
 * Overlays in der Navigation:
 * HighlightCard kündigt einen Pass oder eine kuratierte Strecke kurz vorher an
 * (In 500 m, Stilfser Joch, 40 km, 76 Kehren; In 500 m, Zotzenbach, alte Rallyestrecke, 7 km;
 * In 500 m, Schauinsland, ehemalige Bergrennstrecke, 11 km).
 * StopAlert zeigt allen in der Gruppe groß, dass die Lead gleich anhält.
 * LeadStopButton ist der schnelle Knopf der Lead, um den Halt anzusagen.
 * MessageToast zeigt Kurznachrichten der anderen für ein paar Sekunden.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassPanel } from '@/components/ui/glass-panel';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { STOP_REASONS, type RideMsg, type RideStop, type StopReason } from '@/lib/group/ride';
import { highlightFacts, type Highlight } from '@/lib/navigation/highlights';

import { formatDistance } from './format';
import type { NavSymbol } from './maneuver-geometry';
import { NavSymbolIcon } from './maneuver-icon';
import { FUN_NAMES, FunGauge, toFunLevel } from '@/components/ui/fun-gauge';

const HIGHLIGHT_SYMBOL: Record<Highlight['kind'], NavSymbol> = { pass: 'passhoehe', rallye: 'kehre', strecke: 'kehre', aussicht: 'aussicht', bergrennen: 'kehre' };

export function HighlightCard({ h, distM }: { h: Highlight; distM: number }) {
  const d = formatDistance(Math.max(0, distM));
  return (
    <GlassPanel style={styles.card} fallback="rgba(11,11,12,0.94)">
      <View style={styles.row} accessible accessibilityRole="alert" accessibilityLabel={`${distM > 50 ? `In ${d.value} ${d.unit === 'm' ? 'Metern' : 'Kilometern'}` : 'Jetzt'} ${h.name}, ${highlightFacts(h)}`}>
        <NavSymbolIcon symbol={HIGHLIGHT_SYMBOL[h.kind]} size={44} soon />
        <View style={styles.flex}>
          <AppText variant="caption" style={styles.kicker}>
            {`${distM > 50 ? `In ${d.value} ${d.unit}` : 'Jetzt'} · ${FUN_NAMES[toFunLevel(h.level)]}`}
          </AppText>
          <AppText style={styles.title} numberOfLines={1}>
            {h.name}
          </AppText>
          <AppText variant="caption" muted style={styles.num}>
            {highlightFacts(h)}
          </AppText>
        </View>
        <FunGauge level={toFunLevel(h.level)} size={44} animate />
      </View>
    </GlassPanel>
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

/** Großer Knopf der Lead: einmal tippen öffnet die Gründe, zweites Tippen sendet. */
export function LeadStopButton({ onAnnounce }: { onAnnounce: (r: StopReason) => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Halt an die Gruppe ansagen" onPress={() => setOpen(true)} style={({ pressed }) => [styles.leadBtn, pressed && styles.pressed]}>
        <AppText style={styles.leadText}>Halt ansagen</AppText>
      </Pressable>
    );
  return (
    <GlassPanel style={styles.card} fallback="rgba(11,11,12,0.94)">
      <AppText variant="label">Halt an die Gruppe</AppText>
      <View style={styles.grid}>
        {STOP_REASONS.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => {
              onAnnounce(r.id);
              setOpen(false);
            }}
            style={({ pressed }) => [styles.reason, pressed && styles.pressed]}>
            <AppText style={styles.reasonText}>{r.label}</AppText>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.cancel}>
        <AppText variant="caption" muted>
          Abbrechen
        </AppText>
      </Pressable>
    </GlassPanel>
  );
}

export function MessageToast({ msg }: { msg: RideMsg }) {
  return (
    <GlassPanel style={[styles.card, styles.toast]} fallback="rgba(11,11,12,0.94)">
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
  kicker: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.signal },
  title: { fontFamily: Fonts.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  num: { fontFamily: Fonts.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  stop: { padding: Spacing.xl },
  stopKicker: { fontFamily: Fonts.semibold, color: 'rgba(255,255,255,0.8)' },
  stopTitle: { fontFamily: Fonts.display, fontSize: 32, lineHeight: 36, color: Colors.onSignal },
  stopText: { fontFamily: Fonts.medium, fontSize: 17, color: Colors.onSignal },
  stopBtn: { height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  stopBtnText: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.onSignal },
  leadBtn: { alignSelf: 'flex-end', height: 52, paddingHorizontal: Spacing.xl, borderRadius: 26, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  leadText: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.onSignal },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  reason: { flexGrow: 1, flexBasis: '45%', height: 56, borderRadius: Radius.m, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  reasonText: { fontFamily: Fonts.bold, fontSize: 17, color: Colors.onSignal },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.l },
  toast: { paddingVertical: Spacing.m },
  toastText: { fontFamily: Fonts.semibold, fontSize: 17 },
  pressed: { opacity: 0.75 },
});
