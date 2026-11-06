/**
 * Bottom Sheet für Optionen und Rückfragen (Vorbild Trade Republic): schwebende Karte unten,
 * der Rest abgedunkelt. Tipp daneben oder Abbrechen schließt.
 *
 * ActionSheet: Optionen zu einem Objekt (Tour, Runde), höchstens etwa sechs Zeilen.
 * ConfirmSheet: Rückfrage vor etwas, das sich nicht rückgängig machen lässt (Löschen, Verwerfen).
 * Beide über OptionsSheet, das auch eigenen Inhalt aufnimmt (etwa das Formular Veröffentlichen).
 * Wann welches Muster: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Shadow, Spacing, Type } from '@/constants/theme';

export type SheetItem = { key: string; icon: SFSymbol; label: string; hint?: string; danger?: boolean; busy?: boolean; onPress: () => void };

/** Zeit, bis eine geschlossene Ebene weg ist; erst danach darf die nächste aufgehen (iOS zeigt sonst nichts) */
export const SHEET_GONE_MS = 320;

export function OptionsSheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title?: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <Pressable accessibilityRole="button" accessibilityLabel="Schließen" onPress={onClose} style={styles.backdrop} />
        <Animated.View
          entering={sheetEnter}
          style={[styles.card, { marginBottom: Math.max(insets.bottom, Spacing.l) }]}
          accessibilityViewIsModal>
          <View style={styles.grabber} />
          {(title || subtitle) && (
            <View style={styles.head}>
              {!!title && <AppText style={styles.title}>{title}</AppText>}
              {!!subtitle && <AppText style={styles.subtitle}>{subtitle}</AppText>}
            </View>
          )}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ActionSheet({ visible, title, subtitle, items, onClose }: { visible: boolean; title?: string; subtitle?: string; items: SheetItem[]; onClose: () => void }) {
  return (
    <OptionsSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <View style={styles.list} accessibilityRole="menu">
        {items.map((it) => (
          <Pressable
            key={it.key}
            accessibilityRole="menuitem"
            accessibilityHint={it.hint}
            onPress={() => {
              onClose();
              // Öffnet die Aktion selbst eine Ebene (Rückfrage, Teilen), erst nach dem Schließen
              setTimeout(it.onPress, SHEET_GONE_MS);
            }}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
            <View style={[styles.icon, it.danger && styles.iconDanger]}>
              <SymbolView name={it.icon} size={17} tintColor={it.danger ? Colors.signal : Colors.text} weight="medium" />
            </View>
            <View style={styles.flex}>
              <AppText style={[styles.label, it.danger && styles.danger]}>{it.label}</AppText>
              {!!it.hint && (
                <AppText style={styles.hint} numberOfLines={1}>
                  {it.hint}
                </AppText>
              )}
            </View>
            {it.busy && <ActivityIndicator color={Colors.muted} />}
          </Pressable>
        ))}
      </View>
    </OptionsSheet>
  );
}

export function ConfirmSheet({
  visible,
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  /** als Frage: "Möchtest du diese Tour wirklich löschen?" */
  title: string;
  text?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <OptionsSheet visible={visible} title={title} subtitle={text} onClose={onClose}>
      <View style={styles.confirmRow}>
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.itemPressed]}>
          <AppText style={styles.cancelText}>Abbrechen</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onConfirm();
          }}
          style={({ pressed }) => [styles.confirm, pressed && styles.itemPressed]}>
          <AppText style={styles.confirmText}>{confirmLabel}</AppText>
          <SymbolView name="chevron.right" size={14} weight="bold" tintColor={Colors.onSignal} />
        </Pressable>
      </View>
    </OptionsSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  card: {
    marginTop: 'auto',
    marginHorizontal: Spacing.m,
    paddingHorizontal: Spacing.l,
    paddingTop: Spacing.s,
    paddingBottom: Spacing.xl,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    gap: Spacing.l,
    boxShadow: Shadow.sheet,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: Colors.empty },
  head: { gap: Spacing.xs, paddingHorizontal: Spacing.s, paddingTop: Spacing.s },
  title: { fontFamily: Fonts.bold, fontSize: Type.h2, lineHeight: 30, color: Colors.text },
  subtitle: { fontFamily: Fonts.semibold, fontSize: Type.body, lineHeight: 21, color: Colors.muted },
  list: { gap: Spacing.xs },
  item: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.l, backgroundColor: Colors.surface2 },
  itemPressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.empty },
  iconDanger: { backgroundColor: Colors.signalTint },
  label: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  hint: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  danger: { color: Colors.signal },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingTop: Spacing.s },
  cancel: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.text },
  confirm: { flex: 1.3, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, borderRadius: Radius.l, backgroundColor: Colors.signal },
  confirmText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
});
