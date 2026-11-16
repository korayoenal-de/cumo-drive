/**
 * Kennzahlen einer Tour oder Ausfahrt (Konsistenzprüfung 15.11., K4, K10): immer Strecke, Fahrzeit, Fahrspaß
 * in dieser Reihe, Label 15 grau über dem Wert, Wert Archivo 22 in Versalien. Leitzahl 28 nur im Planer Ergebnis
 * (eigene Komponente Stats mit Erklärung des Werts). Fehlt ein Wert, fällt seine Spalte weg.
 * Dazu die Plätze Plakette, überall gleich (K5, C4).
 */
import { StyleSheet, View } from 'react-native';

import { FunGauge } from '@/components/ui/fun-gauge';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Radius, Spacing, Type } from '@/constants/theme';
import { tourFunLevel, TOUR_FUN_NAMES } from '@/lib/fun-score';
import { fahrzeit, plaetze, strecke } from '@/lib/format';
import { t } from '@/i18n';

export type Kennzahl = { label: string; value: string };

export function Kennzahlen({ km, minutes, fun, extra = [] }: { km?: number | null; minutes?: number | null; fun?: number | null; extra?: Kennzahl[] }) {
  const showFun = fun != null && fun >= 0;
  const level = showFun ? tourFunLevel(fun) : null;
  return (
    <View style={styles.row}>
      {km != null && <Cell label={t('Strecke')} value={strecke(km)} />}
      {minutes != null && minutes > 0 && <Cell label={t('Fahrzeit')} value={fahrzeit(minutes)} />}
      {showFun && level && (
        <View style={styles.cell} accessible accessibilityLabel={`Fahrspaß ${fun} von 100, ${TOUR_FUN_NAMES[level]}`}>
          <AppText style={styles.label}>{t('Fahrspaß')}</AppText>
          <View style={styles.funRow}>
            <FunGauge level={level} size={20} />
            <AppText style={styles.value}>{String(fun)}</AppText>
          </View>
        </View>
      )}
      {extra.map((x) => (
        <Cell key={x.label} label={x.label} value={x.value} />
      ))}
    </View>
  );
}

function Cell({ label, value }: Kennzahl) {
  return (
    <View style={styles.cell}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText style={styles.value} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

/** Plätze als Plakette: grün viele, gelb der letzte, grau ausgebucht */
export function SeatsBadge({ free }: { free: number }) {
  const s = plaetze(free);
  const bg = s.tone === 'good' ? Colors.goodTint : s.tone === 'warn' ? Colors.warnTint : Colors.surface2;
  const fg = s.tone === 'good' ? Colors.good : s.tone === 'warn' ? Colors.warn : Colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText style={[styles.badgeText, { color: fg }]}>{s.text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xxl, rowGap: Spacing.m },
  cell: { gap: 2 },
  label: { fontFamily: Fonts.semibold, fontSize: Type.body, lineHeight: Leading.body, color: Colors.muted },
  value: { fontFamily: Fonts.display, fontSize: Type.metric, lineHeight: Leading.metric, textTransform: 'uppercase', fontVariant: ['tabular-nums'], color: Colors.text },
  funRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.s + 2, paddingVertical: 3, borderRadius: Radius.pill },
  badgeText: { fontFamily: Fonts.bold, fontSize: Type.caption, lineHeight: Leading.caption },
});
