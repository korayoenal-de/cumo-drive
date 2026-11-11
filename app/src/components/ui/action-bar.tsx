/**
 * Aktionsleiste (Konzept Aktionsleiste im Planer, 7.11.2026): eine Hauptaktion als große Taste, daneben
 * ein runder Knopf ⋯ für alles Weitere als schwebendes Menü. Noch nicht gespeichert: darüber eine Zeile
 * mit Speichern (sekundär, breit) und ⋯, die Hauptaktion bleibt in voller Breite. Kein Lesezeichen.
 * Gefährliches mit confirm fragt vorher in einem ConfirmSheet nach.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet, SHEET_GONE_MS, ConfirmSheet, type SheetItem } from '@/components/ui/action-sheet';
import { FloatMenu, type Anchor } from '@/components/ui/float-menu';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';


/** Schalter Solo oder Gruppe: Breite des aktiven und des inaktiven Felds, Abstand dazwischen */

export { SOFT_LAYOUT, softEnter } from '@/components/ui/motion';

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
  choose,
  top,
  float,
  save,
  more: moreIn,
  sheetTitle,
  children,
}: {
  primary: { label: string; onPress: () => void };
  /**
   * Abfrage beim Druck auf die Hauptaktion statt eines Schalters im Knopf (Koray 7.11.):
   * etwa Allein losfahren oder Als Gruppe fahren
   */
  choose?: { title: string; subtitle?: string; items: SheetItem[] };
  /** Inhalt über der Leiste im Fluss, etwa ein Link */
  top?: ReactNode;
  /** Schwebt über der Leiste, ohne etwas zu verschieben (Optionen der Gruppenfahrt) */
  float?: ReactNode;
  /** Speichern als Symbol: Lesezeichen, gefüllt sobald gespeichert */
  save?: { saved: boolean; busy?: boolean; onPress: () => void };
  more?: MoreItem[];
  /** Überschrift im Bottom Sheet, etwa der Name der Tour */
  sheetTitle?: string;
  /** Zusätzlicher Inhalt unter der Leiste */
  children?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const more = moreIn ?? [];
  const [ask, setAsk] = useState<MoreItem | null>(null);
  const [choosing, setChoosing] = useState(false);
  const pressPrimary = () => (choose ? setChoosing(true) : primary.onPress());
  // Gefährliches mit Frage erst nach Rückfrage ausführen
  const run = (it: MoreItem) => (it.danger && it.confirm ? setAsk(it) : it.onPress());
  const unsaved = !!save && !save.saved;
  const moreBtn = more.length > 0 && <MoreButton open={!!anchor} onOpen={setAnchor} />;
  void sheetTitle;
  return (
    <View style={styles.wrap}>
      {float && <View style={styles.float} pointerEvents="box-none">{float}</View>}
      {top}
      {unsaved && (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Speichern"
            accessibilityHint="Unter Touren ablegen"
            accessibilityState={{ busy: save.busy }}
            disabled={save.busy}
            onPress={save.onPress}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            {save.busy ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.secondaryText}>Speichern</AppText>}
          </Pressable>
          {moreBtn}
        </View>
      )}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={pressPrimary} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <AppText style={styles.primaryText}>{primary.label}</AppText>
        </Pressable>
        {!unsaved && moreBtn}
      </View>
      {children}
      <FloatMenu
        anchor={anchor}
        label="Weitere Aktionen"
        items={more.map((it) => ({ key: it.key, label: it.label, icon: it.icon, danger: it.danger }))}
        onPick={(key) => {
          setAnchor(null);
          const it = more.find((x) => x.key === key);
          // erst wenn das Menü (Modal) weg ist: sonst öffnet iOS das Teilen Blatt nicht (Link teilen im Planer, 11.11.)
          if (it) setTimeout(() => run(it), SHEET_GONE_MS);
        }}
        onClose={() => setAnchor(null)}
      />
      {choose && <ActionSheet visible={choosing} title={choose.title} subtitle={choose.subtitle} items={choose.items} onClose={() => setChoosing(false)} />}
      <ConfirmSheet
        visible={!!ask}
        title={ask?.confirm ?? `${ask?.label ?? ''}?`}
        text={ask?.hint}
        confirmLabel={ask?.label.split(' ').pop() ?? 'OK'}
        onConfirm={() => ask?.onPress()}
        onClose={() => setAsk(null)}
      />
    </View>
  );
}

type ViewRef = ComponentRef<typeof View>;

/** Runder Knopf ⋯: misst sich, damit das Menü daneben schweben kann; offen zeigt er ein X */
function MoreButton({ open, onOpen }: { open: boolean; onOpen: (a: Anchor) => void }) {
  const ref = useRef<ViewRef>(null);
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Weitere Aktionen schließen' : 'Weitere Aktionen'}
      hitSlop={4}
      onPress={() =>
        ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => onOpen({ top: y, bottom: y + h, right: x + w }))
      }
      style={({ pressed }) => [styles.round, styles.big, open && styles.roundOpen, pressed && styles.pressed]}>
      <SymbolView name={open ? 'xmark' : 'ellipsis'} size={20} tintColor={Colors.text} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  primary: { flex: 1, height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  float: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: Spacing.s, zIndex: 2 },
  primaryText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  big: { width: 56, height: 56, borderRadius: 28 },
  roundOpen: { backgroundColor: Colors.line },
  secondary: { flex: 1, height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
});
