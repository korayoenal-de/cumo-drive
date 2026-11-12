/**
 * Highlights einer Route, nach Fahrspaß Pegel gerankt: Legenden zuerst, bei gleichem Pegel nach km.
 * Pässe und kuratierte Strecken kommen aus derselben Suche wie die Ansagen in der Navigation.
 * Antippen öffnet eine zweite Ebene (wie bei Spotify) mit Karte des Abschnitts und allen Daten.
 */
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { RouteMap } from '@/components/map/route-map';
import { softEnter } from '@/components/ui/action-bar';
import { FUN_NAMES, FunGauge, toFunLevel } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { WarnLabel } from '@/components/ui/warn-label';
import { Colors, Fonts, Motion, Radius, Spacing, Type } from '@/constants/theme';
import { allowPass, avoidPass, useAvoidedPasses } from '@/lib/avoid-pass';
import { findHighlights, highlightFacts, type Highlight } from '@/lib/navigation/highlights';
import { cumulativeKm } from '@/lib/navigation/route';
import { passState, usePassLive } from '@/lib/pass-live';
import { PASSES, TIER_LABEL, warnLabel, warnRest } from '@/lib/passes';
import type { LatLon, Tour } from '@/lib/tour';

const KIND_LABEL: Record<string, string> = {
  pass: 'Pass',
  rallye: 'Rallyestrecke',
  bergrennen: 'Bergrennstrecke',
  aussicht: 'Aussichtsstrecke',
  strecke: 'Traumstrecke',
};

/**
 * onAvoid: Pass mit Warnung für diese Tour herausnehmen (Auslassen) oder wieder einplanen; der Aufrufer
 * plant danach neu. Ohne onAvoid (Rundtour) gibt es nur das Label.
 */
export function HighlightList({ line, onAvoid }: { line: LatLon[]; onAvoid?: () => void }) {
  const avoided = useAvoidedPasses();
  const cum = useMemo(() => (line.length < 2 ? [] : cumulativeKm(line)), [line]);
  const list = useMemo(() => {
    if (line.length < 2) return [];
    return findHighlights(line, cum, null).sort((a, b) => b.level - a.level || a.startKm - b.startKm);
  }, [line, cum]);
  const [open, setOpen] = useState<Highlight | null>(null);
  if (!list.length && !(onAvoid && avoided.length)) return null;
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{`Highlights auf der Strecke (${list.length})`}</AppText>
      {list.length > 0 && (
      <View style={styles.card}>
        {list.map((h, i) => {
          const lv = toFunLevel(h.level);
          return (
            <Animated.View key={h.id} entering={softEnter(i)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${h.name}, ${FUN_NAMES[lv]}${h.warn?.length ? `, Warnung: ${warnLabel(h.warn)}` : ''}, Details öffnen`}
                onPress={() => setOpen(h)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={[styles.flex, h.warn?.length ? styles.warned : null]}>
                  {/* Warnung als Label unter dem Namen, der Hauptgrund selbst (Koray 12.11. abends) */}
                  <AppText style={styles.name} numberOfLines={1}>
                    {h.name}
                  </AppText>
                  <WarnLabel warn={h.warn} />
                  <AppText style={styles.sub} numberOfLines={1}>
                    {`km ${Math.round(h.startKm)} · ${highlightFacts(h)}`}
                  </AppText>
                </View>
                <View style={styles.gauge}>
                  <FunGauge level={lv} size={28} />
                  <AppText style={styles.level}>{FUN_NAMES[lv]}</AppText>
                </View>
              </Pressable>
              {onAvoid && h.kind === 'pass' && h.warn?.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${h.name} auslassen`}
                  onPress={() => {
                    const p = PASSES.find((x) => x.id === h.id);
                    if (!p) return;
                    avoidPass({ id: p.id, name: p.name, p: [p.lat, p.lon] });
                    onAvoid();
                  }}
                  style={({ pressed }) => [styles.avoid, pressed && styles.pressed]}>
                  <AppText style={styles.avoidText}>Auslassen</AppText>
                </Pressable>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
      )}
      {onAvoid &&
        avoided.map((a) => (
          <View key={a.id} style={styles.avoided}>
            <AppText style={[styles.sub, styles.flex]} numberOfLines={1}>{`${a.name} ausgelassen`}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${a.name} wieder einplanen`}
              onPress={() => {
                allowPass(a.id);
                onAvoid();
              }}
              style={({ pressed }) => [styles.avoidBack, pressed && styles.pressed]}>
              <AppText style={styles.avoidBackText}>Wieder einplanen</AppText>
            </Pressable>
          </View>
        ))}
      <Modal visible={!!open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(null)}>
        {open && <HighlightDetail h={open} line={line} cum={cum} onClose={() => setOpen(null)} />}
      </Modal>
    </View>
  );
}

/** Zweite Ebene: Abschnitt auf der Karte, Pegel groß, Daten als Kennzahlen, bei Pässen Sperre und Quelle. */
function HighlightDetail({ h, line, cum, onClose }: { h: Highlight; line: LatLon[]; cum: number[]; onClose: () => void }) {
  const live = usePassLive();
  const lv = toFunLevel(h.level);
  const pass = h.kind === 'pass' ? PASSES.find((p) => p.id === h.id) : undefined;
  const state = pass ? passState(pass, live) : null;
  const len = Math.max(1, Math.round(h.endKm - h.startKm));
  const part: Tour = useMemo(() => {
    const seg = line.filter((_, i) => cum[i] >= h.startKm - 0.05 && cum[i] <= h.endKm + 0.05);
    const p = seg.length > 1 ? seg : line.slice(0, 2);
    return { name: h.name, laenge_km: len, wegpunkte: [p[0], p[p.length - 1]], linie: [{ c: 'ok', p }], warnungen: [] };
  }, [h, line, cum, len]);

  const facts: { label: string; value: string }[] = [
    { label: 'Länge', value: `${len} km` },
    ...(h.hairpins >= 3 ? [{ label: 'Kehren', value: String(h.hairpins) }] : []),
    ...(h.ele ? [{ label: 'Höhe', value: `${h.ele.toLocaleString('de-DE')} m` }] : []),
    ...(h.climbM ? [{ label: 'Anstieg', value: `${Math.round(h.climbM).toLocaleString('de-DE')} m` }] : []),
    { label: 'Auf der Route', value: `ab km ${Math.round(h.startKm)}` },
  ];
  const kind = [KIND_LABEL[h.kind] ?? 'Strecke', pass ? TIER_LABEL[pass.tier] : h.note, pass?.region].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <View style={styles.mapBox}>
        <RouteMap tour={part} interactive={false} style={StyleSheet.absoluteFill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schließen"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <SymbolView name="xmark" size={18} weight="semibold" tintColor={Colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <AppText style={styles.kind}>{kind}</AppText>
            <AppText style={styles.title}>{h.name}</AppText>
          </View>
          <View style={styles.gaugeBig}>
            <FunGauge level={lv} size={56} animate={lv >= 5} />
            <AppText style={styles.levelBig}>{FUN_NAMES[lv]}</AppText>
          </View>
        </View>

        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.label} style={styles.fact}>
              <AppText style={styles.factLabel}>{f.label}</AppText>
              <AppText style={styles.factValue}>{f.value}</AppText>
            </View>
          ))}
        </View>

        {h.race && (
          <View style={styles.note}>
            <AppText style={styles.noteTitle}>{h.race.name}</AppText>
            <AppText style={styles.noteText}>{h.race.note}</AppText>
          </View>
        )}
        {pass && (pass.winter_closed || state?.closed) && (
          <View style={[styles.note, state?.closed && styles.noteWarn]}>
            <AppText style={styles.noteTitle}>{state?.closed ? 'Gerade gesperrt' : 'Wintersperre'}</AppText>
            <AppText style={styles.noteText}>
              {[state?.note, pass.closed_months ? `Meist gesperrt ${pass.closed_months}.` : null].filter(Boolean).join(' ')}
            </AppText>
          </View>
        )}
        {h.warn?.length ? (
          <View style={[styles.note, styles.noteWarn]}>
            <WarnLabel warn={h.warn} />
            <AppText style={styles.noteText}>{[warnRest(h.warn), pass?.car_note ? `${pass.car_note}.` : null].filter(Boolean).join(' ')}</AppText>
          </View>
        ) : (
          pass?.car_note && (
            <View style={styles.note}>
              <AppText style={styles.noteTitle}>Für Sportwagen</AppText>
              <AppText style={styles.noteText}>{pass.car_note}</AppText>
            </View>
          )
        )}
        {pass?.toll && <AppText style={styles.sub}>Mautpflichtig.</AppText>}
        {!!pass?.source && (
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(pass.source)} style={styles.link}>
            <AppText style={styles.linkText}>Mehr dazu</AppText>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { gap: Spacing.m },
  card: { borderRadius: Radius.l, backgroundColor: Colors.surface, paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64, paddingVertical: Spacing.s, paddingHorizontal: Spacing.s, borderRadius: Radius.m },
  rowPressed: { backgroundColor: Colors.pressTint },
  warned: { gap: 4, paddingVertical: 2 },
  avoid: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.s },
  avoidText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  avoided: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingHorizontal: Spacing.s },
  avoidBack: { minHeight: 44, justifyContent: 'center' },
  avoidBackText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  name: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  sub: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  gauge: { alignItems: 'center', gap: 2, minWidth: 72 },
  level: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.muted },

  screen: { flex: 1, backgroundColor: Colors.ground },
  mapBox: { height: 260, backgroundColor: Colors.surface },
  close: {
    position: 'absolute',
    top: Spacing.l,
    right: Spacing.l,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay,
  },
  body: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l },
  kind: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  title: { fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: 30, color: Colors.text, textTransform: 'uppercase' },
  gaugeBig: { alignItems: 'center', gap: Spacing.xs },
  levelBig: { fontFamily: Fonts.bold, fontSize: Type.small, color: Colors.text },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.l },
  fact: { width: '50%', gap: 2 },
  factLabel: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  factValue: { fontFamily: Fonts.display, fontSize: Type.h2, color: Colors.text, fontVariant: ['tabular-nums'] },
  note: { borderRadius: Radius.l, backgroundColor: Colors.surface, padding: Spacing.l, gap: Spacing.xs },
  noteWarn: { backgroundColor: Colors.warnTint },
  noteTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  noteText: { fontFamily: Fonts.regular, fontSize: Type.body, lineHeight: 21, color: Colors.muted },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: Fonts.bold, fontSize: Type.input, color: Colors.signal },
  pressed: { opacity: 0.85, transform: [{ scale: Motion.pressScale }] },
});
