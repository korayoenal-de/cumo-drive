/**
 * Schwebendes Menü neben einer Taste (Muster der Punkt Aktionen, 7.11.2026): erscheint über oder unter
 * der Taste, die Einträge bauen sich gestaffelt auf. Themen und Gefährliches trennt eine Linie (Konzept 15.11.).
 * Ein Tipp daneben schließt es.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { groupRows } from '@/lib/sheet-groups';
import { Colors, Fonts, Radius, Shadow, Spacing, Type } from '@/constants/theme';

export type FloatItem = { key: string; label: string; icon: SFSymbol; danger?: boolean; group?: string };
/** Lage der Taste im Fenster */
export type Anchor = { top: number; bottom: number; right: number };

const ITEM_H = 52;
const WIDTH = 264;
const LINE_H = Spacing.s + 1;

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
  const rows = groupRows(items);
  const h = items.length * ITEM_H + rows.filter((r) => r.line).length * LINE_H + Spacing.s * 2;
  const below = anchor.bottom + Spacing.xs + h < win.height - 24;
  const top = below ? anchor.bottom + Spacing.xs : Math.max(24, anchor.top - Spacing.s - h);
  const right = Math.max(Spacing.l, win.width - anchor.right);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Menü schließen" />
      <View style={[styles.menu, { top, right }]} accessibilityViewIsModal accessibilityLabel={label}>
        {rows.map(({ item: it, line }, i) => (
          <Animated.View key={it.key} entering={softEnter(i)}>
            {line && <View style={styles.line} />}
            <Pressable accessibilityRole="button" onPress={() => onPick(it.key)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <SymbolView name={it.icon} size={20} tintColor={it.danger ? Colors.stopText : Colors.text} weight="semibold" />
              <AppText style={[styles.text, it.danger && styles.dangerText]}>{it.label}</AppText>
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
  line: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.line, marginHorizontal: Spacing.m, marginVertical: Spacing.xs },
  dangerText: { color: Colors.stopText },
});
