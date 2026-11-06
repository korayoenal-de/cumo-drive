/**
 * Aktionsleiste: eine Hauptaktion als große Taste, daneben Speichern als Symbol und ein Symbol für
 * alles Weitere. Weiteres öffnet ein Bottom Sheet (ActionSheet), Gefährliches (verwerfen) fragt
 * vorher in einem ConfirmSheet nach. Selten Gebrauchtes steht so nicht als Knopfreihe im Weg.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { ActionSheet, ConfirmSheet } from '@/components/ui/action-sheet';
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
  const [open, setOpen] = useState(false);
  // Mit Schalter in der Hauptaktion wird es eng: gibt es ohnehin ein Menü, wandert Speichern dort hinein
  const foldSave = !!mode && !!save && !!moreIn?.length;
  const more: MoreItem[] | undefined =
    foldSave && save
      ? [
          {
            key: 'save',
            icon: save.saved ? 'bookmark.fill' : 'bookmark',
            label: save.saved ? 'Gespeichert' : 'Speichern',
            hint: save.saved ? 'Liegt in Meine Touren' : 'Unter Meine Touren ablegen',
            onPress: () => !save.saved && save.onPress(),
          },
          ...moreIn!,
        ]
      : moreIn;
  const [ask, setAsk] = useState<MoreItem | null>(null);
  // Gefährliches erst nach Rückfrage ausführen
  const run = (it: MoreItem) => (it.danger ? setAsk(it) : it.onPress());
  const single = more && more.length === 1 ? more[0] : null;
  return (
    <View style={styles.wrap}>
      {float && <View style={styles.float} pointerEvents="box-none">{float}</View>}
      {top}
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
        {save && !foldSave && <SaveButton {...save} />}
        {single && <RoundButton icon={single.icon} label={single.label} hint={single.hint} muted={single.danger} onPress={() => run(single)} />}
        {more && more.length > 1 && <RoundButton icon="ellipsis" label="Weitere Aktionen" onPress={() => setOpen(true)} />}
      </View>
      {children}
      {more && more.length > 1 && (
        <ActionSheet
          visible={open}
          title={sheetTitle}
          items={more.map((it) => ({ ...it, onPress: () => run(it) }))}
          onClose={() => setOpen(false)}
        />
      )}
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
function RoundButton({ icon, label, hint, muted, onPress }: { icon: SFSymbol; label: string; hint?: string; muted?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} hitSlop={4} style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.round, styles.big]}>
        <SymbolView name={icon} size={20} tintColor={muted ? Colors.muted : Colors.text} weight="medium" />
      </View>
    </Pressable>
  );
}

/** Lesezeichen: füllt sich beim Speichern mit einem kurzen, sanften Puls (Motion.pop). */
function SaveButton({ saved, busy, onPress }: { saved: boolean; busy?: boolean; onPress: () => void }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (saved) s.set(withSequence(withSpring(1 + Motion.pop, Motion.press), withSpring(1, Motion.snap)));
  }, [saved, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Gespeichert unter Meine Touren' : 'Speichern'}
      accessibilityState={{ disabled: saved || busy, busy }}
      disabled={saved || busy}
      onPress={onPress}
      hitSlop={4}>
      <Animated.View style={[styles.round, styles.big, saved && styles.savedBg, st]}>
        {busy ? (
          <ActivityIndicator color={Colors.muted} />
        ) : (
          <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} size={20} tintColor={saved ? Colors.signal : Colors.text} weight="semibold" />
        )}
      </Animated.View>
    </Pressable>
  );
}


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
  savedBg: { backgroundColor: Colors.signalTint },
});
