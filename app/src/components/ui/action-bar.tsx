/**
 * Aktionsleiste: eine Hauptaktion als große Taste, daneben Speichern als Symbol und ein Symbol für
 * alles Weitere. Weiteres öffnet ein Bottom Sheet (ActionSheet), Gefährliches (verwerfen) fragt
 * vorher in einem ConfirmSheet nach. Selten Gebrauchtes steht so nicht als Knopfreihe im Weg.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { ActionSheet, ConfirmSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Spacing, Type } from '@/constants/theme';

export const SOFT_LAYOUT = LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness);
export const softEnter = (i: number) => FadeInDown.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness).delay(i * Motion.stagger);

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
  save,
  more,
  sheetTitle,
  children,
}: {
  primary: { label: string; onPress: () => void };
  /** Speichern als Symbol: Lesezeichen, gefüllt sobald gespeichert */
  save?: { saved: boolean; busy?: boolean; onPress: () => void };
  more?: MoreItem[];
  /** Überschrift im Bottom Sheet, etwa der Name der Tour */
  sheetTitle?: string;
  /** Zusätzlicher Inhalt unter der Leiste */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<MoreItem | null>(null);
  // Gefährliches erst nach Rückfrage ausführen
  const run = (it: MoreItem) => (it.danger ? setAsk(it) : it.onPress());
  const single = more && more.length === 1 ? more[0] : null;
  return (
    <Animated.View layout={SOFT_LAYOUT} style={styles.wrap}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={primary.onPress} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <AppText style={styles.primaryText}>{primary.label}</AppText>
        </Pressable>
        {save && <SaveButton {...save} />}
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
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  big: { width: 56, height: 56, borderRadius: 28 },
  savedBg: { backgroundColor: Colors.signalTint },
});
