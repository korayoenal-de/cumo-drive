/**
 * Bausteine der Einstellungen (Entwurf "Einstellungen neu", Koray 10.11.): Gruppen mit grauem Label,
 * Zeilen in einer getönten Fläche, Wert rechts und Pfeil, Unterseiten mit Zurück zu Einstellungen.
 */
import { BackLink } from '@/components/ui/back-link';
import { SymbolView } from 'expo-symbols';
import { Children, isValidElement, type ReactNode, type RefObject } from 'react';
import { ScrollView, StyleSheet, Switch, View, type ScrollViewInstance } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Layout } from '@/constants/theme';
import { t } from '@/i18n';

/** Unterseite: Zurück Pille oben links, großer Titel, scrollender Inhalt. */
export function SubScreen({ title, children, scrollRef }: { title: string; children: ReactNode; scrollRef?: RefObject<ScrollViewInstance | null> }) {
  const insets = useSafeAreaInsets();
  return (
    // Tastatur schiebt den Inhalt mit, statt ihn zu verdecken (Koray 16.11.: Senden lag unter der Tastatur)
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.s, paddingBottom: insets.bottom + Spacing.xxxl }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets>
      <BackLink label={t('Einstellungen')} fallback="/einstellungen" />
      <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {title}
      </AppText>
      {children}
    </ScrollView>
  );
}

/** Gruppe: Label darüber, Zeilen in einer Fläche mit feinen Trennlinien, optional Hinweis darunter. */
export function Group({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.group}>
      {label ? <AppText style={styles.groupLabel}>{label}</AppText> : null}
      <View style={styles.box}>
        {rows.map((c, i) => (
          <View key={i} style={i > 0 && styles.sep}>
            {c}
          </View>
        ))}
      </View>
      {hint ? <AppText style={styles.hint}>{hint}</AppText> : null}
    </View>
  );
}

export function Row({ title, value, onPress, danger, chevron = !!onPress, a11yHint }: { title: string; value?: string | null; onPress?: () => void; danger?: boolean; chevron?: boolean; a11yHint?: string }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityHint={a11yHint} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <AppText style={[styles.title, danger && styles.danger]} numberOfLines={1}>
        {title}
      </AppText>
      {value ? (
        <AppText style={styles.value} numberOfLines={1}>
          {value}
        </AppText>
      ) : null}
      {chevron && <SymbolView name="chevron.right" size={16} weight="semibold" tintColor={Colors.faint} />}
    </Pressable>
  );
}

export function SwitchRow({ title, value, onChange }: { title: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <AppText style={styles.title} numberOfLines={2}>
        {title}
      </AppText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.signal, false: Colors.surface2 }} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  content: { paddingHorizontal: Layout.page, gap: Layout.sections },
  group: { gap: Spacing.s },
  groupLabel: { paddingHorizontal: 4, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  box: { backgroundColor: Colors.surface, borderRadius: Radius.l, overflow: 'hidden' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  hint: { paddingHorizontal: 4, fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted, lineHeight: 21 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.l, paddingVertical: Spacing.s },
  pressed: { backgroundColor: Colors.surface2 },
  title: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  value: { maxWidth: '50%', fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  danger: { color: Colors.danger },
});
