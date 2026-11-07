/**
 * Aktionsleiste (Konzept Aktionsleiste im Planer, 7.11.2026): eine Hauptaktion als große Taste, daneben
 * ein runder Knopf ⋯ für alles Weitere als schwebendes Menü. Noch nicht gespeichert: darüber eine Zeile
 * mit Speichern (sekundär, breit) und ⋯, die Hauptaktion bleibt in voller Breite. Kein Lesezeichen.
 * Gefährliches mit confirm fragt vorher in einem ConfirmSheet nach.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ConfirmSheet } from '@/components/ui/action-sheet';
import { FloatMenu, type Anchor } from '@/components/ui/float-menu';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Spacing, Type } from '@/constants/theme';

import { EASE_OUT } from '@/components/ui/motion';

/** Schalter Solo oder Gruppe: Breite des aktiven und des inaktiven Felds, Abstand dazwischen */
const SEG_ON = 104;
const SEG_OFF = 40;
const SEG_GAP = 2;

export { SOFT_LAYOUT, softEnter } from '@/components/ui/motion';

export type MoreItem = {
  key: string;
  icon: SFSymbol;
  label: string;
  hint?: string;
  /** rot, und vorher eine Rückfrage */
  danger?: boolean;
  /** Frage im ConfirmSheet, etwa "Möchtest du diese Runde wirklich verwerfen?" */
  confirm?: string;
  busy?: boolean;
  onPress: () => void;
};

export function ActionBar({
  primary,
  mode,
  top,
  float,
  save,
  more: moreIn,
  sheetTitle,
  children,
}: {
  primary: { label: string; onPress: () => void };
  /** Solo oder Gruppe als Schalter rechts in der Hauptaktion (Entwurf E2, 6.11.) */
  mode?: { group: boolean; onChange: (group: boolean) => void };
  /** Inhalt über der Leiste im Fluss, etwa ein Link */
  top?: ReactNode;
  /** Schwebt über der Leiste, ohne etwas zu verschieben (Optionen der Gruppenfahrt) */
  float?: ReactNode;
  /** Speichern als Symbol: Lesezeichen, gefüllt sobald gespeichert */
  save?: { saved: boolean; busy?: boolean; onPress: () => void };
  more?: MoreItem[];
  /** Überschrift im Bottom Sheet, etwa der Name der Tour */
  sheetTitle?: string;
  /** Zusätzlicher Inhalt unter der Leiste */
  children?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const more = moreIn ?? [];
  const [ask, setAsk] = useState<MoreItem | null>(null);
  // Gefährliches mit Frage erst nach Rückfrage ausführen
  const run = (it: MoreItem) => (it.danger && it.confirm ? setAsk(it) : it.onPress());
  const unsaved = !!save && !save.saved;
  const moreBtn = more.length > 0 && <MoreButton open={!!anchor} onOpen={setAnchor} />;
  void sheetTitle;
  return (
    <View style={styles.wrap}>
      {float && <View style={styles.float} pointerEvents="box-none">{float}</View>}
      {top}
      {unsaved && (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Speichern"
            accessibilityHint="Unter Meine Touren ablegen"
            accessibilityState={{ busy: save.busy }}
            disabled={save.busy}
            onPress={save.onPress}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            {save.busy ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.secondaryText}>Speichern</AppText>}
          </Pressable>
          {moreBtn}
        </View>
      )}
      <View style={styles.row}>
        {mode ? (
          <View style={styles.primarySplit}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={mode.group ? 'Startet die Gruppenfahrt' : undefined}
              onPress={primary.onPress}
              style={({ pressed }) => [styles.primaryLeft, pressed && styles.pressedText]}>
              <AppText style={styles.primaryText} numberOfLines={1}>
                {primary.label}
              </AppText>
            </Pressable>
            <ModeToggle group={mode.group} onChange={mode.onChange} />
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={primary.onPress} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <AppText style={styles.primaryText}>{primary.label}</AppText>
          </Pressable>
        )}
        {!unsaved && moreBtn}
      </View>
      {children}
      <FloatMenu
        anchor={anchor}
        label="Weitere Aktionen"
        items={more.map((it) => ({ key: it.key, label: it.label, icon: it.icon, danger: it.danger }))}
        onPick={(key) => {
          setAnchor(null);
          const it = more.find((x) => x.key === key);
          if (it) run(it);
        }}
        onClose={() => setAnchor(null)}
      />
      <ConfirmSheet
        visible={!!ask}
        title={ask?.confirm ?? `${ask?.label ?? ''}?`}
        text={ask?.hint}
        confirmLabel={ask?.label.split(' ').pop() ?? 'OK'}
        onConfirm={() => ask?.onPress()}
        onClose={() => setAsk(null)}
      />
    </View>
  );
}

type ViewRef = ComponentRef<typeof View>;

/** Runder Knopf ⋯: misst sich, damit das Menü daneben schweben kann; offen zeigt er ein X */
function MoreButton({ open, onOpen }: { open: boolean; onOpen: (a: Anchor) => void }) {
  const ref = useRef<ViewRef>(null);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Weitere Aktionen schließen' : 'Weitere Aktionen'}
      hitSlop={4}
      onPress={() =>
        ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => onOpen({ top: y, bottom: y + h, right: x + w }))
      }
      style={({ pressed }) => [styles.round, styles.big, open && styles.roundOpen, pressed && styles.pressed]}>
      <SymbolView name={open ? 'xmark' : 'ellipsis'} size={20} tintColor={Colors.text} weight="bold" />
    </Pressable>
  );
}

/**
 * Schalter Solo oder Gruppe in der Hauptaktion: eingelassene Spur, weißer Schieber mit Symbol und Wort,
 * die andere Möglichkeit nur als Symbol. Abstände rundum gleich: Spur 6 pt zum Rand des Knopfs,
 * Schieber 4 pt zur Spur.
 */
function ModeToggle({ group, onChange }: { group: boolean; onChange: (group: boolean) => void }) {
  // Feste Breiten, damit nichts springt: aktiv SEG_ON, inaktiv SEG_OFF, die Spur bleibt gleich breit.
  // Der weiße Schieber gleitet hinüber, Wort und Farben blenden mit (Auslaufkurve, kein Federn).
  const p = useSharedValue(group ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(group ? 1 : 0, { duration: Motion.enter, easing: EASE_OUT }));
  }, [group, p]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * (SEG_OFF + SEG_GAP) }] }));
  const soloW = useAnimatedStyle(() => ({ width: SEG_ON + (SEG_OFF - SEG_ON) * p.get() }));
  const groupW = useAnimatedStyle(() => ({ width: SEG_OFF + (SEG_ON - SEG_OFF) * p.get() }));
  const soloOn = useAnimatedStyle(() => ({ opacity: 1 - p.get() }));
  const soloOff = useAnimatedStyle(() => ({ opacity: p.get() }));
  const groupOn = useAnimatedStyle(() => ({ opacity: p.get() }));
  const groupOff = useAnimatedStyle(() => ({ opacity: 1 - p.get() }));
  const seg = (on: boolean, label: string, icon: SFSymbol, size: number, w: object, onSt: object, offSt: object, value: boolean) => (
    <Animated.View style={[styles.seg, w]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        onPress={() => !on && onChange(value)}
        hitSlop={4}
        style={styles.segPress}>
        {/* aktiv: Symbol in Signal plus Wort; inaktiv: weißes Symbol; beides übereinander, überblendet */}
        <Animated.View style={[styles.segContent, onSt]}>
          <SymbolView name={icon} size={size} tintColor={Colors.signal} />
          <AppText style={styles.thumbText} numberOfLines={1}>
            {label}
          </AppText>
        </Animated.View>
        <Animated.View style={[styles.segContent, styles.segIconOnly, offSt]}>
          <SymbolView name={icon} size={size} tintColor={Colors.onSignal} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Allein oder als Gruppe fahren">
      <Animated.View pointerEvents="none" style={[styles.thumbBg, thumb]} />
      {seg(!group, 'Solo', 'person.fill', 16, soloW, soloOn, soloOff, false)}
      {seg(group, 'Gruppe', 'person.2.fill', 19, groupW, groupOn, groupOff, true)}
    </View>
  );
}

/** Rundes Symbol neben der Hauptaktion */
const styles = StyleSheet.create({
  wrap: { gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  primary: { flex: 1, height: 56, borderRadius: 28, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primarySplit: { flex: 1, height: 56, borderRadius: 28, backgroundColor: Colors.signal, flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  primaryLeft: { flex: 1, height: 56, justifyContent: 'center', paddingLeft: Spacing.xl },
  pressedText: { opacity: 0.75 },
  track: { height: 44, borderRadius: 22, padding: 4, gap: SEG_GAP, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  thumbBg: { position: 'absolute', left: 4, top: 4, width: SEG_ON, height: 36, borderRadius: 18, backgroundColor: Colors.onSignal },
  seg: { height: 36, overflow: 'hidden' },
  segPress: { flex: 1 },
  segContent: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SEG_ON, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segIconOnly: { width: SEG_OFF },
  float: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: Spacing.s, zIndex: 2 },
  thumbText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  big: { width: 56, height: 56, borderRadius: 28 },
  roundOpen: { backgroundColor: Colors.line },
  secondary: { flex: 1, height: 56, borderRadius: 28, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
});
