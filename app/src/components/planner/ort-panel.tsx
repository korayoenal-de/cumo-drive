/**
 * Orte in der Nähe als Vollfläche (Koray 8.11.2026, wie die Suche beim Zwischenziel): Kopf mit Ort und
 * Rolle, Reiter Hotel, Café und Essen. Darunter schlicht die Liste mit der Zahl in der Überschrift
 * („25 Hotels in Meran“, Koray 9.11.; Empfehlungen kommen später). Unten die Aktionen zum Punkt.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { placesNear, type NearPlace } from '@/lib/stops-along';
import { formatKm, type LatLon } from '@/lib/tour';

import { LABEL, type PointAction } from './point-menu';

export type NearKind = 'hotel' | 'kaffee' | 'mittag';

const KINDS: { id: NearKind; label: string; one: string; plural: string; icon: 'bed.double.fill' | 'cup.and.saucer.fill' | 'fork.knife' }[] = [
  { id: 'hotel', label: 'Hotel', one: 'Hotel', plural: 'Hotels', icon: 'bed.double.fill' },
  { id: 'kaffee', label: 'Café', one: 'Café', plural: 'Cafés', icon: 'cup.and.saucer.fill' },
  { id: 'mittag', label: 'Essen', one: 'Restaurant', plural: 'Restaurants', icon: 'fork.knife' },
];

/** Treffer je Ort und Art, damit Öffnen und Schließen nicht neu lädt */
const cache = new Map<string, NearPlace[]>();
const keyOf = (p: LatLon, k: NearKind) => `${p[0].toFixed(4)},${p[1].toFixed(4)}|${k}`;

type Props = {
  visible: boolean;
  p: LatLon;
  name: string;
  role: string;
  withHotel: boolean;
  actions: PointAction[];
  onClose: () => void;
  onPick: (q: LatLon, name: string) => void;
  onAction: (a: PointAction) => void;
};

export function OrtSheet(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <OrtBody {...props} />
    </Modal>
  );
}

function OrtBody({ p, name, role, withHotel, actions, onClose, onPick, onAction }: Props) {
  const kinds = withHotel ? KINDS : KINDS.filter((k) => k.id !== 'hotel');
  const [kind, setKind] = useState<NearKind>(kinds[0].id);
  const [lists, setLists] = useState<Record<string, NearPlace[] | 'fehler'>>(() => {
    const init: Record<string, NearPlace[]> = {};
    for (const k of kinds) {
      const hit = cache.get(keyOf(p, k.id));
      if (hit) init[k.id] = hit;
    }
    return init;
  });
  // Alle Arten gleich laden, damit der Wechsel der Reiter sofort zeigt
  useEffect(() => {
    const ctrl = new AbortController();
    for (const k of kinds) {
      if (cache.has(keyOf(p, k.id))) continue;
      placesNear(k.id, p, ctrl.signal)
        .then((l) => {
          cache.set(keyOf(p, k.id), l);
          setLists((s) => ({ ...s, [k.id]: l }));
        })
        .catch(() => !ctrl.signal.aborted && setLists((s) => ({ ...s, [k.id]: 'fehler' })));
    }
    return () => ctrl.abort();
    // kinds hängt nur an withHotel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, withHotel]);

  const list = lists[kind];
  const meta = kinds.find((k) => k.id === kind)!;
  const others = actions.filter((a) => a !== 'entfernen');

  const row = (h: NearPlace) => (
    <Pressable
      key={h.id}
      accessibilityRole="button"
      accessibilityLabel={`${h.name}, ${formatKm(h.distM / 1000)} Kilometer entfernt, als neuen Ort setzen`}
      onPress={() => onPick(h.p, h.name)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.icon}>
        <SymbolView name={meta.icon} size={16} tintColor={Colors.signal} />
      </View>
      <View style={styles.rowMain}>
        <AppText style={styles.name} numberOfLines={1}>
          {h.name}
        </AppText>
        {!!h.detail && (
          <AppText style={styles.muted} numberOfLines={1}>
            {h.detail}
          </AppText>
        )}
      </View>
      <AppText style={styles.dist}>{`${formatKm(h.distM / 1000)} KM`}</AppText>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <View style={styles.rowMain}>
            <AppText style={styles.title} numberOfLines={1}>
              {name}
            </AppText>
            <AppText style={styles.role} numberOfLines={1}>
              {role}
            </AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Schließen" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <SymbolView name="xmark" size={18} weight="semibold" tintColor={Colors.text} />
          </Pressable>
        </View>
        <View role="tablist" style={styles.tabs}>
          {kinds.map((k) => {
            const on = k.id === kind;
            return (
              <Pressable
                key={k.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setKind(k.id)}
                style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}>
                <AppText style={[styles.tabText, on && styles.tabTextOn]}>{k.label}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {list === undefined ? (
          <ActivityIndicator color={Colors.muted} style={styles.loading} />
        ) : list === 'fehler' ? (
          <AppText style={[styles.muted, styles.pad]}>Lässt sich gerade nicht laden.</AppText>
        ) : list.length === 0 ? (
          <AppText style={[styles.muted, styles.pad]}>Keine {meta.plural} in der Nähe.</AppText>
        ) : (
          // Schlicht aufgelistet, die Zahl steht in der Überschrift (Koray 9.11.)
          <View style={[styles.section, styles.pad]}>
            <AppText style={styles.label}>{`${list.length} ${list.length === 1 ? meta.one : meta.plural} in ${name}`}</AppText>
            <View style={styles.group}>{list.map(row)}</View>
          </View>
        )}
        <View style={[styles.actions, styles.pad]}>
          {others.map((a) => (
            <Pressable key={a} accessibilityRole="button" onPress={() => onAction(a)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <SymbolView name={LABEL[a].icon} size={16} tintColor={Colors.text} weight="semibold" />
              <AppText style={styles.actionText} numberOfLines={1}>
                {LABEL[a].text.replace(' setzen', '').replace(' zeigen', '')}
              </AppText>
            </Pressable>
          ))}
          {actions.includes('entfernen') && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Entfernen"
              onPress={() => onAction('entfernen')}
              style={({ pressed }) => [styles.action, styles.remove, pressed && styles.pressed]}>
              <SymbolView name={LABEL.entfernen.icon} size={16} tintColor={Colors.stopText} weight="semibold" />
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.ground },
  head: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.l, gap: Spacing.l },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  title: { fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: 28, color: Colors.text, textTransform: 'uppercase' },
  role: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  close: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  tabs: { flexDirection: 'row', gap: Spacing.xs },
  tab: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.text },
  tabText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  tabTextOn: { color: Colors.ground },
  content: { paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  pad: { paddingHorizontal: Spacing.xl },
  loading: { marginVertical: Spacing.xxl },
  section: { gap: Spacing.m },
  label: { fontFamily: Fonts.bold, fontSize: Type.h3, color: Colors.text },
  group: { borderRadius: Radius.l, backgroundColor: Colors.surface, paddingVertical: Spacing.xs, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 64, paddingHorizontal: Spacing.l, paddingVertical: Spacing.s },
  rowPressed: { backgroundColor: Colors.pressTint },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.signalTint, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  name: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  muted: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  dist: { fontFamily: Fonts.display, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: Spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: Colors.surface, flexShrink: 1 },
  actionText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  remove: { marginLeft: 'auto', backgroundColor: Colors.signalTint, paddingHorizontal: 0, width: 44, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
});

/**
 * Konzept B1 (Koray 8.11.): rechts in der Punktzeile statt Anfasser oder Pfeil die Symbole dessen, was es
 * am Ort gibt. Am Ziel getönt mit der Zahl der Hotels, dort wird meist übernachtet. Offen: Pfeil nach oben.
 */
export function OrtBadge({ p, withHotel, highlight, open }: { p: LatLon; withHotel: boolean; highlight: boolean; open: boolean }) {
  const [count, setCount] = useState<number | null>(() => cache.get(keyOf(p, 'hotel'))?.length ?? null);
  useEffect(() => {
    if (!highlight || !withHotel || cache.has(keyOf(p, 'hotel'))) return;
    const ctrl = new AbortController();
    placesNear('hotel', p, ctrl.signal)
      .then((l) => {
        cache.set(keyOf(p, 'hotel'), l);
        setCount(l.length);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [p, highlight, withHotel]);
  const tint = highlight && withHotel;
  const c = tint ? Colors.signal : Colors.muted;
  if (open) {
    return (
      <View style={[badge.box, badge.open]}>
        <SymbolView name="chevron.up" size={14} tintColor={Colors.text} weight="bold" />
      </View>
    );
  }
  return (
    <View style={[badge.box, tint && badge.tint]}>
      {withHotel && <SymbolView name="bed.double.fill" size={15} tintColor={c} />}
      {tint ? (
        count != null && count > 0 ? <AppText style={badge.count}>{count}</AppText> : null
      ) : (
        <>
          <SymbolView name="cup.and.saucer.fill" size={14} tintColor={c} />
          <SymbolView name="fork.knife" size={14} tintColor={c} />
        </>
      )}
    </View>
  );
}

const badge = StyleSheet.create({
  box: { height: 36, minWidth: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: Colors.surface2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tint: { backgroundColor: Colors.signalTint },
  open: { paddingHorizontal: 0 },
  count: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal, fontVariant: ['tabular-nums'] },
});
