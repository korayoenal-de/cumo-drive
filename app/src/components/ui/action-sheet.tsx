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
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sheetEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Shadow, Spacing, Type, Size } from '@/constants/theme';

const AnimatedScroll = Animated.createAnimatedComponent(GHScrollView);

export type SheetItem = { key: string; icon: SFSymbol; label: string; hint?: string; danger?: boolean; busy?: boolean; onPress: () => void };

/** Zeit, bis eine geschlossene Ebene weg ist; erst danach darf die nächste aufgehen (iOS zeigt sonst nichts) */
export const SHEET_GONE_MS = 320;

/** scroll: langer Inhalt scrollt im Blatt; ganz oben angekommen zieht man das Blatt nach unten weg */
export function OptionsSheet({ visible, title, subtitle, onClose, children, scroll = false }: { visible: boolean; title?: string; subtitle?: string; onClose: () => void; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const scrollY = useSharedValue(0);
  /** Ziehweg, ab dem das Blatt dem Finger folgt (Inhalt war beim Start nicht oben) */
  const base = useSharedValue<number | null>(null);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const native = Gesture.Native();
  // nach unten ziehen schließt (Koray 7.11.: im Fahrspaß Blatt ging das nicht)
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) drag.set(0);
  }, [visible, drag]);
  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(native)
    .onStart(() => {
      base.set(scrollY.get() > 0 ? null : 0);
    })
    .onUpdate((e) => {
      // erst ziehen, wenn der Inhalt ganz oben steht
      if (base.get() === null) {
        if (scrollY.get() <= 0 && e.translationY > 0) base.set(e.translationY);
        return;
      }
      drag.set(Math.max(0, e.translationY - (base.get() ?? 0)));
    })
    .onEnd((e) => {
      if (base.get() === null) return;
      if (drag.get() > 110 || (drag.get() > 20 && e.velocityY > 900)) {
        drag.set(withTiming(800, { duration: 220 }, (done) => {
          if (done) scheduleOnRN(onClose);
        }));
      } else {
        drag.set(withSpring(0, Motion.snap));
      }
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.get() }] }));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <Pressable accessibilityRole="button" accessibilityLabel="Schließen" onPress={onClose} style={styles.backdrop} />
          <GestureDetector gesture={pan}>
            {/* außen das Ziehen, innen das Hereinfahren: beide nutzen transform */}
            <Animated.View style={[styles.dragWrap, dragStyle]}>
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
              {scroll ? (
                <GestureDetector gesture={native}>
                  <AnimatedScroll style={{ maxHeight: win.height * 0.7 }} contentContainerStyle={styles.scrollBody} bounces={false} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
                    {children}
                  </AnimatedScroll>
                </GestureDetector>
              ) : (
                children
              )}
            </Animated.View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
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
            // Wie das schwebende Menü (Koray 8.11.): Zeilen ohne eigene Fläche, Symbol ohne Kreis, Löschen getönt
            style={({ pressed }) => [styles.item, it.danger && styles.itemDanger, pressed && styles.itemPressed]}>
            <View style={styles.icon}>
              <SymbolView name={it.icon} size={20} tintColor={it.danger ? Colors.stopText : Colors.text} weight="semibold" />
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
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Colors.scrim },
  dragWrap: { marginTop: 'auto' },
  scrollBody: { paddingBottom: Spacing.s },
  card: {
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
  item: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.m, borderRadius: Radius.m },
  itemDanger: { marginTop: Spacing.s, backgroundColor: Colors.signalTint },
  itemPressed: { backgroundColor: Colors.line },
  icon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  hint: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  danger: { color: Colors.stopText },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingTop: Spacing.s },
  cancel: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.text },
  confirm: { flex: 1.3, height: Size.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, borderRadius: Radius.pill, backgroundColor: Colors.signal },
  confirmText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
});
