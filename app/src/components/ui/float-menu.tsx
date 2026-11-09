/**
 * Schwebendes Menü neben einer Taste (Muster der Punkt Aktionen, 7.11.2026): erscheint über oder unter
 * der Taste, die Einträge bauen sich gestaffelt auf, Gefährliches steht abgesetzt auf roter Fläche.
 * Ein Tipp daneben schließt es.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Shadow, Spacing, Type } from '@/constants/theme';

export type FloatItem = { key: string; label: string; icon: SFSymbol; danger?: boolean };
/** Lage der Taste im Fenster */
export type Anchor = { top: number; bottom: number; right: number };

const ITEM_H = 52;
const WIDTH = 264;

export function FloatMenu({
  anchor,
  items,
  label,
  onPick,
  onClose,
}: {
  anchor: Anchor | null;
  items: FloatItem[];
  label: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const win = useWindowDimensions();
  if (!anchor) return null;
  const main = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  const h = main.length * ITEM_H + danger.length * (ITEM_H + Spacing.s) + Spacing.s * 2;
  const below = anchor.bottom + Spacing.xs + h < win.height - 24;
  const top = below ? anchor.bottom + Spacing.xs : Math.max(24, anchor.top - Spacing.s - h);
  const right = Math.max(Spacing.l, win.width - anchor.right);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Menü schließen" />
      <View style={[styles.menu, { top, right }]} accessibilityViewIsModal accessibilityLabel={label}>
        {main.map((it, i) => (
          <Animated.View key={it.key} entering={softEnter(i)}>
            <Pressable accessibilityRole="button" onPress={() => onPick(it.key)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <SymbolView name={it.icon} size={20} tintColor={Colors.text} weight="semibold" />
              <AppText style={styles.text}>{it.label}</AppText>
            </Pressable>
          </Animated.View>
        ))}
        {danger.map((it, i) => (
          <Animated.View key={it.key} entering={softEnter(main.length + i)} style={styles.dangerWrap}>
            <Pressable accessibilityRole="button" onPress={() => onPick(it.key)} style={({ pressed }) => [styles.item, styles.danger, pressed && styles.pressed]}>
              <SymbolView name={it.icon} size={20} tintColor={Colors.stopText} weight="semibold" />
              <AppText style={[styles.text, styles.dangerText]}>{it.label}</AppText>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Colors.scrim },
  menu: { position: 'absolute', width: WIDTH, padding: Spacing.s, borderRadius: Radius.l + 2, backgroundColor: Colors.surface2, boxShadow: Shadow.float },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, height: ITEM_H, paddingHorizontal: Spacing.m, borderRadius: Radius.s },
  pressed: { backgroundColor: Colors.line },
  text: { fontFamily: Fonts.semibold, fontSize: Type.title, color: Colors.text },
  dangerWrap: { marginTop: Spacing.s },
  danger: { backgroundColor: Colors.signalTint },
  dangerText: { color: Colors.stopText },
});
