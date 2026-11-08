/**
 * Fahrspaß Wert einer Tour (Konzept "Tour Fahrspaß Wert", 7.11.2026): kleine Plakette mit Logo und Zahl,
 * so leise wie die Runden Chips. Antippen öffnet die Erklärung mit den vier Teilen und der Skala.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ElevationChart } from '@/components/planner/elevation-chart';
import { OptionsSheet } from '@/components/ui/action-sheet';
import { FunGauge } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { TOUR_FUN_NAMES, TOUR_FUN_STEPS, type FunFacet, type TourFun } from '@/lib/fun-score';
import type { LatLon } from '@/lib/tour';

export function FunPill({ fun, onPress, active, best, hint = 'Zeigt, wie der Wert entsteht' }: { fun: TourFun; onPress: () => void; active?: boolean; best?: boolean; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Fahrspaß ${fun.score} von 100, ${TOUR_FUN_NAMES[fun.level]}`}
      accessibilityHint={hint}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.pill, active && styles.active, best && styles.best, pressed && styles.pressed]}>
      <FunGauge level={fun.level} size={20} />
      <AppText style={styles.value}>{fun.score}</AppText>
    </Pressable>
  );
}

/** Unterschied zur vorigen Runde: grün, wenn besser, sonst neutral */
export function FunDelta({ delta }: { delta: number }) {
  const up = delta >= 0;
  return (
    <View style={[styles.delta, up ? styles.deltaUp : styles.deltaDown]} accessibilityLabel={`${up ? 'besser' : 'schlechter'} als die vorige Runde um ${Math.abs(delta)}`}>
      <AppText style={[styles.deltaText, { color: up ? Colors.good : Colors.muted }]}>{up ? `+${delta}` : `−${Math.abs(delta)}`}</AppText>
    </View>
  );
}

/** Farben der vier Teile im gestapelten Balken, vom kräftigsten zum hellsten Orange */
const TONES = ['#E2461C', '#EF6A43', '#F48D6C', '#F7B29A'];

/** Punkte je Teil, so gerundet, dass die Summe genau den Wert ergibt (größter Rest) */
function facetPoints(fun: TourFun): number[] {
  const raw = fun.facets.map((f) => f.weight * f.share * 100);
  const pts = raw.map(Math.floor);
  let left = fun.score - pts.reduce((x, y) => x + y, 0);
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((x, y) => y.rest - x.rest);
  for (let k = 0; left > 0 && k < order.length; k++, left--) pts[order[k].i]++;
  return pts;
}

/** Prüfung der Strecke für Sportwagen, gehört zur Bewertung (Koray 7.11.) */
export type RouteCheck = { tone: 'good' | 'warn' | 'none'; text: string };

/** Zusammenfassung der Prüfung aus den Warnungen einer Tour */
export function routeCheck(warnings: number, checked: boolean): RouteCheck {
  if (!checked) return { tone: 'none', text: 'Diese Strecke ist noch nicht für Sportwagen geprüft.' };
  if (!warnings) return { tone: 'good', text: 'Für Sportwagen geprüft, keine Engstellen oder Sperrungen.' };
  return { tone: 'warn', text: `Für Sportwagen geprüft. ${warnings === 1 ? 'Eine Stelle solltest' : `${warnings} Stellen solltest`} du kennen, sie stehen unter der Route.` };
}

/** twiceKm: km, die auf derselben Straße zurück gefahren werden (Route); ab 1 km ein Hinweis */
/** line: Linie der Tour für das Höhenprofil (Koray 7.11.: gehört in die Bewertung) */
export function FunSheet({ fun, name, visible, onClose, check, twiceKm = 0, line }: { fun: TourFun | null; name: string; visible: boolean; onClose: () => void; check?: RouteCheck | null; twiceKm?: number; line?: LatLon[] }) {
  // Rechnung (Konzept 7, Koray 8.11.): Balken aus den vier Teilen, darunter Zeile für Zeile, Tippen klappt die Erklärung auf
  const [open, setOpen] = useState<FunFacet['id'] | null>(null);
  const pts = fun ? facetPoints(fun) : [];
  return (
    <OptionsSheet visible={visible && !!fun} onClose={onClose} scroll>
      {fun && (
        <View style={styles.sheet}>
          <View style={styles.head}>
            <FunGauge level={fun.level} size={48} />
            <View style={styles.flex}>
              <View style={styles.scoreRow}>
                <AppText style={styles.big}>{fun.score}</AppText>
                <AppText style={styles.levelName}>{TOUR_FUN_NAMES[fun.level]}</AppText>
              </View>
              <AppText style={styles.muted} numberOfLines={1}>{name}</AppText>
            </View>
          </View>
          <View style={styles.stackWrap}>
            <View style={styles.stack} accessible accessibilityLabel={`${fun.score} von 100 Punkten`}>
              {pts.map((p, i) => (p > 0 ? <View key={i} style={{ width: `${p}%`, backgroundColor: TONES[i] }} /> : null))}
            </View>
            <View style={styles.ticks}>
              {TOUR_FUN_STEPS.map((v, i) => (
                <AppText key={v} style={[styles.tick, { left: `${v}%` }, i + 2 === fun.level && styles.tickOn]}>
                  {v}
                </AppText>
              ))}
            </View>
          </View>

          <View>
            {fun.facets.map((f, i) => {
              const isOpen = open === f.id;
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${f.label}, plus ${pts[i]} von ${Math.round(f.weight * 100)}, ${f.value}`}
                  onPress={() => setOpen(isOpen ? null : f.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <View style={styles.rowMain}>
                    <AppText style={styles.pts}>+{pts[i]}</AppText>
                    <View style={styles.rowBody}>
                      <View style={styles.rowHead}>
                        <AppText style={[styles.facetLabel, styles.flex]}>{f.label}</AppText>
                        <AppText style={styles.muted}>von {Math.round(f.weight * 100)}</AppText>
                      </View>
                      <AppText style={styles.muted}>{f.value}</AppText>
                      {/* Balken je Teil wie in Konzept 6 (Koray 8.11.) */}
                      <View style={styles.track}>
                        <View style={[styles.bar, { width: `${Math.round(f.share * 100)}%`, backgroundColor: TONES[i] }]} />
                      </View>
                    </View>
                  </View>
                  {isOpen && <AppText style={[styles.muted, styles.rowText]}>{f.text}</AppText>}
                </Pressable>
              );
            })}
            <View style={[styles.rowMain, styles.total]}>
              <AppText style={[styles.pts, styles.signal]}>{fun.score}</AppText>
              <AppText style={[styles.facetLabel, styles.flex]}>{TOUR_FUN_NAMES[fun.level]}</AppText>
              <AppText style={styles.muted}>von 100</AppText>
            </View>
          </View>

          {/* Unterwegs: Höhenprofil und Prüfung untereinander (Koray 8.11.) */}
          <View style={styles.section}>
            <AppText style={styles.muted}>Unterwegs</AppText>
            {line && line.length > 1 && <ElevationChart line={line} onSurface />}
            {check && (
              <View style={[styles.check, { backgroundColor: check.tone === 'good' ? Colors.goodTint : check.tone === 'warn' ? Colors.warnTint : Colors.surface2 }]}>
                <View style={[styles.checkDot, { backgroundColor: check.tone === 'good' ? Colors.good : check.tone === 'warn' ? Colors.warn : Colors.muted }]} />
                <AppText style={[styles.checkText, styles.flex]}>{check.text}</AppText>
              </View>
            )}
            {twiceKm >= 1 && (
              <View style={[styles.check, { backgroundColor: Colors.warnTint }]}>
                <View style={[styles.checkDot, { backgroundColor: Colors.warn }]} />
                <AppText style={[styles.checkText, styles.flex]}>
                  {Math.round(twiceKm)} km fährst du zweimal, auf derselben Straße zurück. Ein anderes Zwischenziel oder eine andere Reihenfolge ändert das oft.
                </AppText>
              </View>
            )}
          </View>
        </View>
      )}
    </OptionsSheet>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.s,
    height: 44,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  active: { backgroundColor: Colors.line },
  best: { borderColor: Colors.signal },
  pressed: { opacity: 0.7 },
  value: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text, fontVariant: ['tabular-nums'] },
  delta: { height: 28, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center' },
  deltaUp: { backgroundColor: Colors.goodTint },
  deltaDown: { backgroundColor: Colors.surface2 },
  deltaText: { fontFamily: Fonts.bold, fontSize: Type.body, fontVariant: ['tabular-nums'] },
  sheet: { gap: Spacing.l },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  flex: { flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.s },
  big: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, fontVariant: ['tabular-nums'] },
  levelName: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.signal },
  muted: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted },
  facetLabel: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  stackWrap: { gap: 6 },
  stack: { flexDirection: 'row', gap: 2, height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: Colors.line },
  ticks: { height: 20 },
  tick: { position: 'absolute', top: 0, width: 32, marginLeft: -16, textAlign: 'center', fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.muted, fontVariant: ['tabular-nums'] },
  tickOn: { color: Colors.text },
  row: { paddingVertical: 12, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m },
  rowText: { paddingLeft: 56 },
  rowBody: { flex: 1, gap: 4 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.s },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.line, overflow: 'hidden', marginTop: 4 },
  bar: { height: 6, borderRadius: 3 },
  pts: { width: 44, fontFamily: Fonts.display, fontSize: 20, color: Colors.text, fontVariant: ['tabular-nums'] },
  signal: { color: Colors.signal },
  total: { paddingVertical: 12 },
  section: { gap: Spacing.m },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m, padding: 14, borderRadius: Radius.m },
  checkDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  checkText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
});
