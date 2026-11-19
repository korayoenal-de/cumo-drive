/**
 * Angetippter Pass oder neuer Punkt auf der Karte: schwebt über der Karte direkt über dem Blatt, mit den
 * Aktionen als Tasten. Ein Tipp auf eine andere Stelle der Karte blendet die Karte aus.
 */
import { SymbolView } from 'expo-symbols';
import { useRef, type ComponentRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pressable } from '@/components/ui/tap';
import Animated, { FadeOut } from 'react-native-reanimated';

import { flyFrom } from '@/components/ui/morph-action';
import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { WarnLabel } from '@/components/ui/warn-label';
import { Colors, Fonts, Spacing, Type, Pressed } from '@/constants/theme';
import { warnRest, type Pass } from '@/lib/passes';
import { t } from '@/i18n';

export type PassAction = 'via' | 'start' | 'ziel' | 'remove';

/**
 * Vorlage für jeden Tipp auf die Karte (Koray 18.11.): Pass oder neuer Punkt nach langem Druck. Oben Symbol, Name
 * und eine graue Zeile, darunter die Hauptaktion in voller Breite und die anderen Rollen als ruhige Tasten.
 * Tasten ohne Symbol (wirkte gepresst), kein Abbrechen: ein Tipp daneben schließt.
 *  * ohne Start (Koray 18.11. mittags): nur „Als Start“ als Hauptaktion und „Als Ziel“ daneben
 *  * mit Start: „Zwischenziel hinzufügen“ in voller Breite, darunter „Als Start“ und „Als Ziel“
 *  * Pass schon in der Route: nur „Aus der Route entfernen“
 */
export function MapPassActions({
  pass,
  name,
  note,
  role,
  isVia,
  hasStart,
  detourKm,
  bottom,
  onAction,
}: {
  /** Pass, sonst ein freier Punkt */
  pass?: Pass | null;
  /** Name des freien Punkts */
  name?: string;
  note?: string;
  /** Rolle in der Route (Start, Ziel, Zwischenziel 2), null wenn noch nicht drin */
  role: string | null;
  /** Der Start ist schon gesetzt */
  /** der Punkt ist schon Zwischenziel der Route: dann lässt er sich hier auch als Start oder Ziel setzen (Koray 19.11.2026) */
  isVia?: boolean;
  hasStart: boolean;
  detourKm: number | null;
  bottom: number;
  onAction: (a: PassAction) => void;
}) {
  const detour = detourKm != null ? t('Umweg grob {detourKm} km', { detourKm }) : null;
  const sub = role ? [note, t('{role} der Route', { role })].filter(Boolean).join(' · ') : [note, detour].filter(Boolean).join(' · ');
  const start = { a: 'start' as const, label: t('Als Start') };
  const ziel = { a: 'ziel' as const, label: t('Als Ziel') };
  const via = { a: 'via' as const, label: t('Zwischenziel hinzufügen') };
  const primary: { a: PassAction; label: string } = role ? { a: 'remove', label: t('Aus der Route entfernen') } : hasStart ? via : start;
  const others: { a: PassAction; label: string }[] = role ? (isVia ? [start, ziel] : []) : hasStart ? [start, ziel] : [ziel];
  const symbol = pass ? 'mountain.2.fill' : 'mappin';
  const mainRef = useRef<ComponentRef<typeof View>>(null);
  const win = useWindowDimensions();
  // Hinzufügen (Muster A, Koray 17.11.): die Marke fliegt von der Haupttaste ins Blatt darunter, wo der Punkt jetzt
  // in der Punkteliste steht. Entfernen fliegt nicht.
  const act = (a: PassAction) => {
    if (a !== 'remove') flyFrom(mainRef.current, { target: { x: Spacing.l + 28, y: win.height - bottom + 96 }, icon: { sf: symbol }, bg: Colors.signal, fg: Colors.onSignal });
    onAction(a);
  };
  const quiet = (o: { a: PassAction; label: string }) => (
    <Pressable key={o.a} accessibilityRole="button" onPress={() => act(o.a)} style={({ pressed }) => [styles.btn, styles.btnQuiet, hasStart && styles.flex, pressed && styles.pressed]}>
      <AppText style={styles.btnText}>{o.label}</AppText>
    </Pressable>
  );
  const main = (
    <Pressable
      ref={mainRef}
      accessibilityRole="button"
      onPress={() => act(primary.a)}
      style={({ pressed }) => [styles.btn, role ? styles.btnQuiet : styles.btnMain, !role && !hasStart && styles.flex, pressed && styles.pressed]}>
      <AppText style={[styles.btnText, !role && styles.onSignal]}>{primary.label}</AppText>
    </Pressable>
  );
  return (
    <Animated.View
      key={pass ? pass.id : 'punkt'}
      entering={softEnter()}
      exiting={FadeOut.duration(120)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <SymbolView weight="semibold" name={symbol} size={20} tintColor={Colors.signal} />
          <View style={[styles.flex, pass?.warn?.length ? styles.warned : null]}>
            {/* Warnung vor dem Hinzufügen: Label unter dem Namen, weitere Gründe darunter (Koray 12.11. abends) */}
            <AppText style={styles.name} numberOfLines={1}>
              {pass ? pass.name : name}
            </AppText>
            {pass && <WarnLabel warn={pass.warn} />}
            {/* zwei Zeilen: Höhe, Stufe, Sperrung und Rolle passen sonst nicht (Koray 16.11.) */}
            {sub ? (
              <AppText style={styles.sub} numberOfLines={2}>
                {sub}
              </AppText>
            ) : null}
            {pass && warnRest(pass.warn) ? (
              <AppText style={styles.sub} numberOfLines={1}>
                {warnRest(pass.warn)}
              </AppText>
            ) : null}
          </View>
        </View>
        {role || hasStart ? (
          <>
            {main}
            {others.length > 0 && <View style={styles.row}>{others.map(quiet)}</View>}
          </>
        ) : (
          <View style={styles.row}>
            {main}
            {others.map(quiet)}
          </View>
        )}
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
  warned: { gap: 3 },
  name: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  sub: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  row: { flexDirection: 'row', gap: Spacing.s },
  btn: { height: 48, borderRadius: 24, paddingHorizontal: Spacing.l, alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: Colors.signal },
  btnQuiet: { backgroundColor: Colors.surface2 },
  btnText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.text },
  onSignal: { color: Colors.onSignal },
  num: { minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 13, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.text },
  pressed: Pressed,
});

/**
 * Angetippter Punkt der Route (Zwischenziel oder Highlight, Koray 10.11.): gleiche schwebende Karte wie beim
 * Pass, mit der Nummer auf der Karte und der Aktion Entfernen.
 */
export function MapPointActions({ label, name, role, bottom, onRemove, onStart, onZiel }: { label: string; name: string; role: string; bottom: number; onRemove: () => void; onStart: () => void; onZiel: () => void }) {
  return (
    <Animated.View key={`${label}-${name}`} entering={softEnter()} exiting={FadeOut.duration(120)} style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.num}>
            <AppText style={styles.numText}>{label}</AppText>
          </View>
          <View style={styles.flex}>
            <AppText style={styles.name} numberOfLines={1}>
              {name}
            </AppText>
            <AppText style={styles.sub} numberOfLines={1}>
              {role}
            </AppText>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={onRemove} style={({ pressed }) => [styles.btn, styles.btnQuiet, pressed && styles.pressed]}>
          <AppText style={styles.btnText}>{t('Aus der Route entfernen')}</AppText>
        </Pressable>
        {/* wie in der Liste unter den drei Punkten: das Zwischenziel wird Start oder Ziel (Koray 19.11.2026) */}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={onStart} style={({ pressed }) => [styles.btn, styles.btnQuiet, styles.flex, pressed && styles.pressed]}>
            <AppText style={styles.btnText}>{t('Als Start')}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onZiel} style={({ pressed }) => [styles.btn, styles.btnQuiet, styles.flex, pressed && styles.pressed]}>
            <AppText style={styles.btnText}>{t('Als Ziel')}</AppText>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
