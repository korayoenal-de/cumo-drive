/**
 * Ort klappt auf (Konzept B3, Koray 8.11.2026): unter einem gewählten Start, Zwischenziel oder Ziel
 * Hotel, Café und Essen in der Nähe (am Start ohne Hotel), die drei nächsten Treffer, "Alle …" für
 * die ganze Liste und die Aktionen, die früher hinter den drei Punkten lagen.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { softEnter } from '@/components/ui/motion';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { placesNear, type NearPlace } from '@/lib/stops-along';
import { formatKm, type LatLon } from '@/lib/tour';

import { LABEL, type PointAction } from './point-menu';

export type NearKind = 'hotel' | 'kaffee' | 'mittag';

const KINDS: { id: NearKind; label: string; plural: string; icon: 'bed.double.fill' | 'cup.and.saucer.fill' | 'fork.knife' }[] = [
  { id: 'hotel', label: 'Hotel', plural: 'Hotels', icon: 'bed.double.fill' },
  { id: 'kaffee', label: 'Café', plural: 'Cafés', icon: 'cup.and.saucer.fill' },
  { id: 'mittag', label: 'Essen', plural: 'Restaurants', icon: 'fork.knife' },
];

/** Treffer je Ort und Art, damit Auf und Zuklappen nicht neu lädt */
const cache = new Map<string, NearPlace[]>();
const keyOf = (p: LatLon, k: NearKind) => `${p[0].toFixed(4)},${p[1].toFixed(4)}|${k}`;

export function OrtPanel({
  p,
  withHotel,
  actions,
  onPick,
  onAll,
  onAction,
}: {
  p: LatLon;
  withHotel: boolean;
  actions: PointAction[];
  onPick: (q: LatLon, name: string) => void;
  onAll: (k: NearKind) => void;
  onAction: (a: PointAction) => void;
}) {
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
  // Alle Arten gleich laden, damit die Reiter ihre Zahl zeigen
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

  return (
    <Animated.View entering={softEnter()} style={styles.panel}>
      <View role="tablist" style={styles.tabs}>
        {kinds.map((k) => {
          const on = k.id === kind;
          const l = lists[k.id];
          const n = Array.isArray(l) ? l.length : null;
          return (
            <Pressable
              key={k.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setKind(k.id)}
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}>
              <AppText style={[styles.tabText, on && styles.tabTextOn]}>{n != null ? `${k.label} ${n}` : k.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {list === undefined ? (
        <ActivityIndicator color={Colors.muted} style={styles.loading} />
      ) : list === 'fehler' ? (
        <AppText style={styles.muted}>Lässt sich gerade nicht laden.</AppText>
      ) : list.length === 0 ? (
        <AppText style={styles.muted}>Keine {meta.plural} in der Nähe.</AppText>
      ) : (
        <>
          {list.slice(0, 3).map((h) => (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={`${h.name}, ${formatKm(h.distM / 1000)} Kilometer entfernt, als neuen Ort setzen`}
              onPress={() => onPick(h.p, h.name)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
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
          ))}
          {list.length > 3 && (
            <Pressable accessibilityRole="button" onPress={() => onAll(kind)} hitSlop={6} style={({ pressed }) => [styles.all, pressed && styles.pressed]}>
              <AppText style={styles.allText}>{`Alle ${list.length} ${meta.plural}`}</AppText>
            </Pressable>
          )}
        </>
      )}
      <View style={styles.actions}>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.s, paddingHorizontal: Spacing.m, paddingBottom: Spacing.m, paddingTop: Spacing.xs },
  tabs: { flexDirection: 'row', gap: Spacing.xs },
  tab: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.text },
  tabText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  tabTextOn: { color: Colors.ground },
  loading: { marginVertical: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 52, borderRadius: Radius.m },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.signalTint, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  name: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  muted: { fontFamily: Fonts.medium, fontSize: Type.body, color: Colors.muted },
  dist: { fontFamily: Fonts.display, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  all: { paddingVertical: Spacing.xs, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  allText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  actions: { flexDirection: 'row', gap: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line, paddingTop: Spacing.m, marginTop: Spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: Colors.surface2, flexShrink: 1 },
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
