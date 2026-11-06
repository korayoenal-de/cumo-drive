/**
 * Aktionsleiste: eine Hauptaktion als große Taste, daneben Speichern als Symbol und ein Symbol für
 * alles Weitere. Weiteres öffnet ein Bottom Sheet (ActionSheet), Gefährliches (verwerfen) fragt
 * vorher in einem ConfirmSheet nach. Selten Gebrauchtes steht so nicht als Knopfreihe im Weg.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { ActionSheet, ConfirmSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Spacing, Type } from '@/constants/theme';

import { SOFT_LAYOUT } from '@/components/ui/motion';

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
  save,
  more: moreIn,
  sheetTitle,
  children,
}: {
  primary: { label: string; onPress: () => void };
  /** Solo oder Gruppe als Schalter rechts in der Hauptaktion (Entwurf E2, 6.11.) */
  mode?: { group: boolean; onChange: (group: boolean) => void };
  /** Inhalt über der Leiste, etwa die Optionen der Gruppenfahrt */
  top?: ReactNode;
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
    <Animated.View layout={SOFT_LAYOUT} style={styles.wrap}>
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
    </Animated.View>
  );
}

/**
 * Schalter Solo oder Gruppe in der Hauptaktion: eingelassene Spur, weißer Schieber mit Symbol und Wort,
 * die andere Möglichkeit nur als Symbol. Abstände rundum gleich: Spur 6 pt zum Rand des Knopfs,
 * Schieber 4 pt zur Spur.
 */
function ModeToggle({ group, onChange }: { group: boolean; onChange: (group: boolean) => void }) {
  const opts = [
    { group: false, label: 'Solo', icon: 'person.fill' as const },
    { group: true, label: 'Gruppe', icon: 'person.2.fill' as const },
  ];
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Allein oder als Gruppe fahren">
      {opts.map((o) => {
        const on = o.group === group;
        return (
          <Animated.View key={o.label} layout={SOFT_LAYOUT}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => !on && onChange(o.group)}
              hitSlop={4}
              style={[styles.thumb, on ? styles.thumbOn : styles.thumbOff]}>
              <SymbolView name={o.icon} size={o.group ? 19 : 16} tintColor={on ? Colors.signal : Colors.onSignal} />
              {on && <AppText style={styles.thumbText}>{o.label}</AppText>}
            </Pressable>
          </Animated.View>
        );
      })}
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
  track: { height: 44, borderRadius: 22, padding: 4, gap: 2, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  thumb: { height: 36, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  thumbOn: { paddingLeft: 10, paddingRight: 14, backgroundColor: Colors.onSignal },
  thumbOff: { width: 40 },
  thumbText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  big: { width: 56, height: 56, borderRadius: 28 },
  savedBg: { backgroundColor: Colors.signalTint },
});
