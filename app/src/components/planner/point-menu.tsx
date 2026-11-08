/**
 * Aktionen eines Punkts im Routenplaner (Konzept "Punkt Aktionen", Variante A, 7.11.2026):
 * Tipp auf ⋯ öffnet ein schwebendes Menü neben der Zeile, wie die Pass Aktionen auf der Karte.
 * Ein Tipp daneben schließt es. Entfernen steht abgesetzt auf getönter Fläche.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Shadow, Spacing, Type } from '@/constants/theme';

export type PointAction = 'start' | 'ziel' | 'karte' | 'entfernen';

export type PointMenuState = {
  /** Stelle in der Punktliste: 0 Start, dann Zwischenziele, zuletzt Ziel */
  idx: number;
  /** obere und untere Kante der ⋯ Taste im Fenster */
  top: number;
  bottom: number;
  actions: PointAction[];
  name: string;
};

export const LABEL: Record<PointAction, { text: string; icon: SFSymbol }> = {
  start: { text: 'Als Start setzen', icon: 'smallcircle.filled.circle' },
  ziel: { text: 'Als Ziel setzen', icon: 'flag' },
  karte: { text: 'Auf der Karte zeigen', icon: 'mappin.and.ellipse' },
  entfernen: { text: 'Entfernen', icon: 'trash' },
};

const ITEM_H = 52;
const WIDTH = 264;

export function PointMenu({ menu, onPick, onClose }: { menu: PointMenuState | null; onPick: (a: PointAction) => void; onClose: () => void }) {
  const win = useWindowDimensions();
  if (!menu) return null;
  const main = menu.actions.filter((a) => a !== 'entfernen');
  const hasRemove = menu.actions.includes('entfernen');
  const h = main.length * ITEM_H + (hasRemove ? ITEM_H + Spacing.s : 0) + Spacing.s * 2;
  // unter die Taste, sonst darüber, wenn unten kein Platz ist
  const below = menu.bottom + Spacing.xs + h < win.height - 24;
  const top = below ? menu.bottom + Spacing.xs : Math.max(24, menu.top - Spacing.xs - h);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Menü schließen" />
      <View style={[styles.menu, { top, right: Spacing.xl }]} accessibilityViewIsModal accessibilityLabel={`Aktionen für ${menu.name}`}>
        {main.map((a, i) => (
          <Animated.View key={a} entering={softEnter(i)}>
            <Pressable accessibilityRole="button" onPress={() => onPick(a)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <SymbolView name={LABEL[a].icon} size={20} tintColor={Colors.text} weight="semibold" />
              <AppText style={styles.text}>{LABEL[a].text}</AppText>
            </Pressable>
          </Animated.View>
        ))}
        {hasRemove && (
          <Animated.View entering={softEnter(main.length)} style={styles.removeWrap}>
            <Pressable accessibilityRole="button" onPress={() => onPick('entfernen')} style={({ pressed }) => [styles.item, styles.remove, pressed && styles.pressed]}>
              <SymbolView name={LABEL.entfernen.icon} size={20} tintColor={Colors.stopText} weight="semibold" />
              <AppText style={[styles.text, styles.removeText]}>{LABEL.entfernen.text}</AppText>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: {
    position: 'absolute',
    width: WIDTH,
    padding: Spacing.s,
    borderRadius: Radius.l + 2,
    backgroundColor: Colors.surface2,
    boxShadow: Shadow.float,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, height: ITEM_H, paddingHorizontal: Spacing.m, borderRadius: Radius.s },
  pressed: { backgroundColor: Colors.line },
  text: { fontFamily: Fonts.semibold, fontSize: Type.title, color: Colors.text },
  removeWrap: { marginTop: Spacing.s },
  remove: { backgroundColor: Colors.signalTint },
  removeText: { color: Colors.stopText },
});
