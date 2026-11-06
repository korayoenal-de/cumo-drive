/**
 * Angetippter Pass auf der Karte: schwebt über der Karte direkt über dem Blatt, mit den Aktionen als
 * Tasten wie bei Meine Touren. Ein Tipp auf eine andere Stelle der Karte blendet ihn aus.
 */
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Spacing, Type } from '@/constants/theme';
import type { Pass } from '@/lib/passes';

export type PassAction = 'via' | 'start' | 'ziel' | 'remove';

export function MapPassActions({
  pass,
  note,
  role,
  complete,
  empty,
  detourKm,
  bottom,
  onAction,
}: {
  pass: Pass;
  note: string;
  /** Rolle in der Route (Start, Ziel, Zwischenziel 2), null wenn noch nicht drin */
  role: string | null;
  complete: boolean;
  /** Noch kein Punkt gesetzt */
  empty: boolean;
  detourKm: number | null;
  bottom: number;
  onAction: (a: PassAction) => void;
}) {
  const sub = role ? `${note} · in der Route als ${role}` : detourKm != null ? `${note} · Umweg grob ${detourKm} km` : note;
  const primary: { a: PassAction; label: string } = role
    ? { a: 'remove', label: 'Aus der Route entfernen' }
    : complete
      ? { a: 'via', label: 'Zur Route hinzufügen' }
      : empty
        ? { a: 'start', label: 'Als Start' }
        : { a: 'ziel', label: 'Als Ziel' };
  const secondary: { a: PassAction; label: string } | null = role ? null : complete || empty ? { a: 'ziel', label: 'Als Ziel' } : null;
  return (
    <Animated.View
      key={pass.id}
      entering={softEnter()}
      exiting={FadeOut.duration(120)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <SymbolView name="mountain.2.fill" size={18} tintColor={Colors.signal} />
          <View style={styles.flex}>
            <AppText style={styles.name} numberOfLines={1}>
              {pass.name}
            </AppText>
            <AppText style={styles.sub} numberOfLines={1}>
              {sub}
            </AppText>
          </View>
        </View>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onAction(primary.a)}
            style={({ pressed }) => [styles.btn, role ? styles.btnQuiet : styles.btnMain, styles.flex, pressed && styles.pressed]}>
            <AppText style={[styles.btnText, !role && styles.onSignal]}>{primary.label}</AppText>
          </Pressable>
          {secondary && (
            <Pressable accessibilityRole="button" onPress={() => onAction(secondary.a)} style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}>
              <AppText style={styles.btnText}>{secondary.label}</AppText>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { position: 'absolute', left: Spacing.l, right: Spacing.l },
  card: {
    borderRadius: 24,
    padding: Spacing.m,
    gap: Spacing.m,
    backgroundColor: Colors.overlay,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.xs },
  name: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  sub: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  row: { flexDirection: 'row', gap: Spacing.s },
  btn: { height: 48, borderRadius: 24, paddingHorizontal: Spacing.l, alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: Colors.signal },
  btnQuiet: { backgroundColor: Colors.surface2 },
  btnText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.text },
  onSignal: { color: Colors.onSignal },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
});
