/**
 * Plakette und Zähler (Audit 21.11.2026): vorher sechs eigene Plaketten und drei eigene Zähler mit verschiedenen Maßen.
 *
 * - Plakette: Status als getönte Fläche, so breit wie der Text, nie über die ganze Zeile. Töne: good (geprüft, dabei,
 *   frei), signal (wartet auf dich), warn (prüfen, wenig frei, geändert), danger (abgesagt, endgültig), muted (neutral),
 *   solid (hervorgehoben auf Signal, nur für eine Empfehlung wie „Bester Preis“). Optional ein Zeichen oder Kopf davor.
 * - Zähler: oranger Kreis mit Zahl (neue Nachrichten, offene Anfragen), eine Größe, ab 10 „9+“.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Radius, Spacing, Type } from '@/constants/theme';

export type PlaketteTone = 'good' | 'signal' | 'warn' | 'danger' | 'muted' | 'solid';

const BG: Record<PlaketteTone, string> = {
  good: Colors.goodTint,
  signal: Colors.signalTint,
  warn: Colors.warnTint,
  danger: Colors.dangerTint,
  muted: Colors.surface2,
  solid: Colors.signal,
};
const FG: Record<PlaketteTone, string> = {
  good: Colors.good,
  signal: Colors.signal,
  warn: Colors.warn,
  danger: Colors.danger,
  muted: Colors.textSoft,
  solid: Colors.onSignal,
};

export function Plakette({
  label,
  tone = 'muted',
  lead,
  style,
  accessibilityLabel,
}: {
  label: string;
  tone?: PlaketteTone;
  /** Zeichen oder Kopf vor dem Text (Zickzack der Warnung, Anfangsbuchstabe bei „Von …“) */
  lead?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.plakette, lead ? styles.withLead : null, { backgroundColor: BG[tone] }, style]} accessible accessibilityLabel={accessibilityLabel ?? label}>
      {lead}
      <AppText style={[styles.text, { color: FG[tone] }]} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** Zähler: oranger Kreis mit Zahl; absolut gesetzt an Tasten und Reitern, sonst in der Zeile */
export function Zaehler({ n, style }: { n: number; style?: StyleProp<ViewStyle> }) {
  if (!n) return null;
  return (
    <View style={[styles.zaehler, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <AppText style={styles.zaehlerText}>{n > 9 ? '9+' : n}</AppText>
    </View>
  );
}

/** Größe des Zählers, auch für die Lage an Tasten (oben rechts um die halbe Größe versetzt) */
export const ZAEHLER = 18;

const styles = StyleSheet.create({
  plakette: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.s,
    paddingVertical: Spacing.hair,
    borderRadius: Radius.pill,
  },
  withLead: { paddingLeft: Spacing.xs },
  text: { flexShrink: 1, fontFamily: Fonts.bold, fontSize: Type.caption, lineHeight: Leading.caption },
  zaehler: {
    minWidth: ZAEHLER,
    height: ZAEHLER,
    borderRadius: ZAEHLER / 2,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zaehlerText: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: Type.micro, lineHeight: Leading.micro },
});
