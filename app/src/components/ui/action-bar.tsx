/**
 * Aktionsleiste (Konzept Aktionsleiste im Planer, 7.11.2026): eine Hauptaktion als große Taste, daneben
 * ein runder Knopf ⋯ für alles Weitere als schwebendes Menü. Noch nicht gespeichert: darüber eine Zeile
 * mit Speichern (sekundär, breit) und ⋯, die Hauptaktion bleibt in voller Breite. Kein Lesezeichen.
 * Joy of Use (Koray 17.11.): Speichern trägt das Touren Symbol. Ist gespeichert, schrumpft die Taste zum Kreis,
 * das Symbol fliegt in den Touren Tab, die Zeile löst sich auf und ⋯ rückt neben die Hauptaktion. Losfahren trägt
 * das Lenkrad und klappt nach „Allein losfahren“ von links nach rechts zusammen (Einträge mit launch).
 * Gefährliches mit confirm fragt vorher in einem ConfirmSheet nach.
 * Muster und Regeln: docs/design-prinzipien.md, Abschnitt Ebenen und Rückmeldungen.
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ActionSheet, SHEET_GONE_MS, ConfirmSheet, type SheetItem } from '@/components/ui/action-sheet';
import { FloatMenu, type Anchor } from '@/components/ui/float-menu';
import type { BtnIcon } from '@/components/ui/btn-icon';
import { MorphAction, MORPH_MS, type MorphActionRef } from '@/components/ui/morph-action';
import { SOFT_LAYOUT } from '@/components/ui/motion';
import { Colors, Motion, Spacing, Type } from '@/constants/theme';
import { t } from '@/i18n';


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
  /** launch: klappt vor onPress zusammen (Muster B) */
  primary: { label: string; onPress: () => void; icon?: BtnIcon; launch?: boolean };
  /**
   * Abfrage beim Druck auf die Hauptaktion statt eines Schalters im Knopf (Koray 7.11.):
   * etwa Allein losfahren oder Als Gruppe fahren. launch: die Hauptaktion klappt danach zusammen
   */
  choose?: { title: string; subtitle?: string; items: (SheetItem & { launch?: boolean })[] };
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
  const primaryRef = useRef<MorphActionRef>(null);
  const saveRef = useRef<MorphActionRef>(null);
  // Zusammenklappen, dann die Aktion; danach wieder volle Taste (der nächste Bildschirm liegt dann schon darüber)
  const launchThen = (fn: () => void) => {
    const ref = primaryRef.current;
    if (!ref) return fn();
    ref.launch(() => {
      fn();
      setTimeout(() => primaryRef.current?.reset(), 1200);
    });
  };
  const pressPrimary = () => (choose ? setChoosing(true) : primary.launch ? launchThen(primary.onPress) : primary.onPress());
  // Gefährliches mit Frage erst nach Rückfrage ausführen
  const run = (it: MoreItem) => (it.danger && it.confirm ? setAsk(it) : it.onPress());
  const unsaved = !!save && !save.saved;
  // Gerade gespeichert: Zeile bleibt kurz stehen, die Taste fliegt nach Touren, dann löst sich die Zeile auf.
  // Nur nach echtem Speichern (busy gesehen oder saved gemeldet), nicht beim Verwerfen von Änderungen.
  const [leaving, setLeaving] = useState(false);
  const sawBusy = useRef(false);
  // nur nach einem Druck auf diese Taste (nicht, wenn anderswo gespeichert wird, etwa vor der Gruppenfahrt)
  const pressedAt = useRef(0);
  const wasUnsaved = useRef(unsaved);
  useEffect(() => {
    if (save?.busy) sawBusy.current = true;
  }, [save?.busy]);
  useEffect(() => {
    if (wasUnsaved.current && !unsaved && (sawBusy.current || save?.saved) && Date.now() - pressedAt.current < 120_000) {
      setLeaving(true);
      saveRef.current?.fly('touren', () => setLeaving(false));
      // falls die Taste schon weg war: nicht hängen bleiben
      const id = setTimeout(() => setLeaving(false), MORPH_MS + 400);
      sawBusy.current = false;
      wasUnsaved.current = unsaved;
      return () => clearTimeout(id);
    }
    if (!unsaved) sawBusy.current = false;
    wasUnsaved.current = unsaved;
  }, [unsaved, save?.saved]);
  const showSaveRow = unsaved || leaving;
  const moreBtn = more.length > 0 && <MoreButton open={!!anchor} onOpen={setAnchor} />;
  void sheetTitle;
  return (
    <View style={styles.wrap}>
      {float && <View style={styles.float} pointerEvents="box-none">{float}</View>}
      {top}
      {showSaveRow && save && (
        <Animated.View style={styles.row} exiting={FadeOut.duration(120)}>
          <MorphAction
            ref={saveRef}
            label={t('Speichern')}
            icon={{ tab: 'touren' }}
            tone="surface"
            textSize={Type.title}
            accessibilityHint={t('Unter Touren ablegen')}
            busy={save.busy && !leaving}
            onPress={() => {
              pressedAt.current = Date.now();
              save.onPress();
            }}
            style={styles.flex}
          />
          {!leaving && moreBtn}
        </Animated.View>
      )}
      <Animated.View style={styles.row} layout={SOFT_LAYOUT}>
        <MorphAction ref={primaryRef} label={primary.label} icon={primary.icon ?? { sf: 'steeringwheel' }} onPress={pressPrimary} style={styles.flex} />
        {(!showSaveRow || leaving) && moreBtn ? <Animated.View entering={FadeIn.duration(Motion.enter).delay(leaving ? MORPH_MS : 0)}>{moreBtn}</Animated.View> : null}
      </Animated.View>
      {children}
      <FloatMenu
        anchor={anchor}
        label={t('Weitere Aktionen')}
        items={more.map((it) => ({ key: it.key, label: it.label, icon: it.icon, danger: it.danger }))}
        onPick={(key) => {
          setAnchor(null);
          const it = more.find((x) => x.key === key);
          // erst wenn das Menü (Modal) weg ist: sonst öffnet iOS das Teilen Blatt nicht (Link teilen im Planer, 11.11.)
          if (it) setTimeout(() => run(it), SHEET_GONE_MS);
        }}
        onClose={() => setAnchor(null)}
      />
      {choose && (
        <ActionSheet
          visible={choosing}
          title={choose.title}
          subtitle={choose.subtitle}
          // Einträge mit launch: das Blatt ist weg (SHEET_GONE_MS), dann klappt die Hauptaktion zusammen
          items={choose.items.map((it) => (it.launch ? { ...it, onPress: () => launchThen(it.onPress) } : it))}
          onClose={() => setChoosing(false)}
        />
      )}
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
      accessibilityLabel={open ? t('Weitere Aktionen schließen') : t('Weitere Aktionen')}
      hitSlop={4}
      onPress={() =>
        ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => onOpen({ top: y, bottom: y + h, right: x + w }))
      }
      style={({ pressed }) => [styles.round, styles.big, open && styles.roundOpen, pressed && styles.pressed]}>
      <SymbolView name={open ? 'xmark' : 'ellipsis'} size={20} tintColor={Colors.text} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  flex: { flex: 1 },
  float: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: Spacing.s, zIndex: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: Motion.pressScale }] },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  big: { width: 56, height: 56, borderRadius: 28 },
  roundOpen: { backgroundColor: Colors.line },
});
