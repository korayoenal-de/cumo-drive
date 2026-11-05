/**
 * Aktionsleiste nach dem Muster von Meine Touren: eine Hauptaktion als große Taste, daneben
 * Speichern als Symbol und ein Symbol für alles Weitere. Das Weitere Symbol dreht sich zum X,
 * die Optionen gleiten darunter nacheinander herein. Selten Gebrauchtes (neu würfeln, verwerfen)
 * steht so nicht mehr als Knopfreihe im Weg.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';

export const SOFT_LAYOUT = LinearTransition.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness);
export const softEnter = (i: number) => FadeInDown.springify().damping(Motion.snap.damping).stiffness(Motion.snap.stiffness).delay(i * Motion.stagger);

export type MoreItem = { key: string; icon: SFSymbol; label: string; hint?: string; danger?: boolean; busy?: boolean; onPress: () => void };

export function ActionBar({
  primary,
  save,
  more,
  children,
}: {
  primary: { label: string; onPress: () => void };
  /** Speichern als Symbol: Lesezeichen, gefüllt sobald gespeichert */
  save?: { saved: boolean; busy?: boolean; onPress: () => void };
  more?: MoreItem[];
  /** Zusätzlicher Inhalt unter der Leiste, etwa ein Hinweis nach dem Speichern */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Animated.View layout={SOFT_LAYOUT} style={styles.wrap}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={primary.onPress} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <AppText style={styles.primaryText}>{primary.label}</AppText>
        </Pressable>
        {save && <SaveButton {...save} />}
        {more && more.length === 1 && <SingleAction item={more[0]} />}
        {more && more.length > 1 && <MorphButton open={open} icon="ellipsis" label={open ? 'Weitere Aktionen schließen' : 'Weitere Aktionen'} onPress={() => setOpen((o) => !o)} big />}
      </View>
      {children}
      {open && more && (
        <View style={styles.menu} accessibilityRole="menu">
          {more.map((it, i) => (
            <Animated.View key={it.key} entering={softEnter(i)} exiting={FadeOut.duration(100)}>
              <Pressable
                accessibilityRole="menuitem"
                accessibilityHint={it.hint}
                onPress={() => {
                  setOpen(false);
                  it.onPress();
                }}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                <View style={[styles.itemIcon, it.danger && styles.itemIconDanger]}>
                  <SymbolView name={it.icon} size={17} tintColor={it.danger ? Colors.signal : Colors.text} weight="medium" />
                </View>
                <View style={styles.flex}>
                  <AppText style={[styles.itemText, it.danger && styles.danger]}>{it.label}</AppText>
                  {it.hint && (
                    <AppText variant="caption" muted numberOfLines={1}>
                      {it.hint}
                    </AppText>
                  )}
                </View>
                {it.busy && <ActivityIndicator color={Colors.muted} />}
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/** Nur eine weitere Aktion: direkt als Symbol. Gefährliches (verwerfen) zieht beim ersten Tippen
 *  zur roten Taste auf, das zweite Tippen bestätigt, nach drei Sekunden klappt es zurück. */
function SingleAction({ item }: { item: MoreItem }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);
  const confirm = item.danger;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={armed ? `${item.label} bestätigen` : item.label}
      accessibilityHint={armed ? item.hint : confirm ? 'Danach noch einmal tippen zum Bestätigen' : item.hint}
      onPress={() => {
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        item.onPress();
      }}
      hitSlop={4}>
      <Animated.View layout={SOFT_LAYOUT} style={[styles.round, styles.big, armed && styles.armed]}>
        {armed ? (
          <Animated.View key="txt" entering={FadeIn.duration(140)} style={styles.armedInner}>
            <SymbolView name={item.icon} size={16} tintColor={Colors.onSignal} weight="semibold" />
            <AppText style={styles.armedText}>{item.label.split(' ').pop()}</AppText>
          </Animated.View>
        ) : (
          <Animated.View key="ico" entering={FadeIn.duration(140)}>
            <SymbolView name={item.icon} size={20} tintColor={confirm ? Colors.muted : Colors.text} weight="medium" />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Lesezeichen: füllt sich beim Speichern mit einem kurzen, sanften Puls. */
function SaveButton({ saved, busy, onPress }: { saved: boolean; busy?: boolean; onPress: () => void }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (saved) s.set(withSequence(withSpring(1.12, Motion.press), withSpring(1, Motion.snap)));
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

/** Rundes Symbol, das sich beim Öffnen dreht und zum X wird. */
export function MorphButton({ open, icon, label, onPress, big }: { open: boolean; icon: SFSymbol; label: string; onPress: () => void; big?: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withSpring(open ? 1 : 0, Motion.snap));
  }, [open, p]);
  const a = useAnimatedStyle(() => ({ opacity: 1 - p.get(), transform: [{ rotate: `${p.get() * 90}deg` }, { scale: 1 - p.get() * 0.3 }] }));
  const b = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ rotate: `${(p.get() - 1) * 90}deg` }, { scale: 0.7 + p.get() * 0.3 }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={onPress} hitSlop={4}>
      <View style={[styles.round, big && styles.big, open && styles.roundOpen]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, a]}>
          <SymbolView name={icon} size={19} tintColor={Colors.text} weight="semibold" />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, b]}>
          <SymbolView name="xmark" size={16} tintColor={Colors.text} weight="bold" />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  wrap: { gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  primary: { flex: 1, height: 56, borderRadius: 28, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  big: { width: 56, height: 56, borderRadius: 28 },
  roundOpen: { backgroundColor: Colors.line },
  savedBg: { backgroundColor: Colors.signalTint },
  armed: { width: undefined, paddingHorizontal: Spacing.l, backgroundColor: Colors.signal },
  armedInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  armedText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.onSignal },
  menu: { gap: Spacing.xs },
  item: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.m, backgroundColor: Colors.surface },
  itemIcon: { width: 32, height: 32, borderRadius: Radius.l, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  itemIconDanger: { backgroundColor: Colors.signalTint },
  itemText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  danger: { color: Colors.signal },
});
