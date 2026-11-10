/**
 * Bausteine der Einstellungen (Entwurf "Einstellungen neu", Koray 10.11.): Gruppen mit grauem Label,
 * Zeilen in einer getönten Fläche, Wert rechts und Pfeil, Unterseiten mit Zurück zu Einstellungen.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Children, isValidElement, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';

/** Unterseite: Zurück Pille oben links, großer Titel, scrollender Inhalt. */
export function SubScreen({ title, children }: { title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.s, paddingBottom: insets.bottom + Spacing.xxxl }]} keyboardShouldPersistTaps="handled">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zurück zu Einstellungen"
        hitSlop={4}
        onPress={() => (router.canGoBack() ? router.back() : router.navigate('/einstellungen'))}
        style={styles.back}>
        <SymbolView name="chevron.left" size={15} weight="bold" tintColor={Colors.text} />
        <AppText style={styles.backText}>Einstellungen</AppText>
      </Pressable>
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
      {chevron && <SymbolView name="chevron.right" size={13} weight="bold" tintColor="#5E5E63" />}
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
  content: { paddingHorizontal: Spacing.l, gap: Spacing.xl },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingLeft: 12, paddingRight: 16, borderRadius: 22, backgroundColor: Colors.surface },
  backText: { fontFamily: Fonts.bold, fontSize: Type.body },
  group: { gap: Spacing.s },
  groupLabel: { paddingHorizontal: 4, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  box: { backgroundColor: Colors.surface, borderRadius: Radius.l, overflow: 'hidden' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  hint: { paddingHorizontal: 4, fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted, lineHeight: 21 },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.l, paddingVertical: Spacing.s },
  pressed: { backgroundColor: Colors.surface2 },
  title: { flex: 1, fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  value: { maxWidth: '50%', fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  danger: { color: Colors.stopText },
});
