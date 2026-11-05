/**
 * Paywall der CUMO DRIVE Mitgliedschaft. Zwei Anlässe: die Testphase ist vorbei (mode "expired")
 * oder man schaut sich die Mitgliedschaft freiwillig an (mode "voluntary", mit Schließen).
 * Käufe laufen über den Adapter in lib/purchase, solange es keine Store Produkte gibt, kommt
 * dort ein freundlicher Hinweis zurück.
 */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { CONTACT_EMAIL, PRICES, type PlanId, type Price } from '@/lib/entitlement';
import { purchase, restorePurchases } from '@/lib/purchase';

const BENEFITS = [
  'Kurvige Touren planen',
  'Gruppenfahrten bis 6 Fahrzeuge',
  'Navigation mit Ansagen und Live Activity',
  'Fahrten und Statistik je Fahrzeug',
];

export type PaywallMode = 'expired' | 'voluntary';

export function Paywall({
  mode,
  onClose,
  footer,
}: {
  mode: PaywallMode;
  /** nur bei mode "voluntary": Schließen oben rechts */
  onClose?: () => void;
  /** zusätzlicher Inhalt ganz unten, etwa Abmelden */
  footer?: ReactNode;
}) {
  const [selected, setSelected] = useState<PlanId>('jahr');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const plan = PRICES.find((p) => p.id === selected) ?? PRICES[0];

  const run = async (kind: 'buy' | 'restore') => {
    setBusy(kind);
    setNote(null);
    try {
      const r = kind === 'buy' ? await purchase(selected) : await restorePurchases();
      if (r.ok) {
        setNote({ text: kind === 'buy' ? 'Danke, deine Mitgliedschaft ist aktiv.' : 'Deine Mitgliedschaft ist wieder da.', good: true });
        if (mode === 'voluntary') onClose?.();
      } else if (!r.cancelled) setNote({ text: r.message, good: false });
    } catch {
      setNote({ text: 'Das hat nicht geklappt. Bitte später noch einmal versuchen.', good: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {onClose && (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Schließen" onPress={onClose} hitSlop={12} style={styles.close}>
            <AppText style={styles.closeText}>Schließen</AppText>
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gapM}>
          <AppText variant="label" style={styles.kicker}>
            CUMO DRIVE
          </AppText>
          <AppText variant="display" style={styles.headline}>
            {mode === 'expired' ? 'Deine Testphase ist vorbei' : 'CUMO DRIVE Mitgliedschaft'}
          </AppText>
          <AppText muted>
            {mode === 'expired'
              ? 'Wähle einen Plan, um weiter Touren zu planen und gemeinsam zu fahren. Deine Touren, Fahrten und Fahrzeuge bleiben in deinem Konto.'
              : 'Alles für kurvige Touren und Gruppenfahrten in einer Mitgliedschaft.'}
          </AppText>
        </View>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefit}>
              <View style={styles.dot} />
              <AppText style={styles.benefitText}>{b}</AppText>
            </View>
          ))}
        </View>

        <View style={styles.gapS} accessibilityRole="radiogroup">
          {PRICES.map((p) => (
            <PlanCard key={p.id} price={p} selected={p.id === selected} onPress={() => setSelected(p.id)} />
          ))}
        </View>

        <View style={styles.gapS}>
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('buy')} style={[styles.primary, !!busy && styles.disabled]}>
            {busy === 'buy' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Weiter mit {plan.name}</AppText>}
          </Pressable>
          {note && <AppText style={[styles.note, note.good && styles.noteGood]}>{note.text}</AppText>}
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('restore')} style={styles.secondary}>
            {busy === 'restore' ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.secondaryText}>Käufe wiederherstellen</AppText>}
          </Pressable>
        </View>

        <View style={styles.clubBox}>
          <AppText style={styles.clubTitle}>Für Clubs und Veranstalter: CUMO DRIVE Club bis 20 Fahrzeuge, auf Rechnung</AppText>
          <AppText variant="caption" muted>
            Mitglieder eines aktiven Clubs brauchen keinen eigenen Plan. Schreib uns an
          </AppText>
          <AppText selectable style={styles.mail}>
            {CONTACT_EMAIL}
          </AppText>
        </View>

        <View style={styles.gapS}>
          <AppText variant="caption" muted>
            Woche, Monat und Jahr verlängern sich automatisch, wenn du nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple ID kündigst. Der Saison Pass gilt 6 Monate und endet von selbst.
          </AppText>
          {/* TODO: AGB und Datenschutz verlinken, sobald die Seiten auf rallycumo.de stehen */}
          <AppText variant="caption" muted>
            AGB und Datenschutz folgen.
          </AppText>
        </View>

        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({ price, selected, onPress }: { price: Price; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${price.name}, ${price.priceText} ${price.periodText}`}
      onPress={onPress}
      style={[styles.card, price.highlight && styles.cardHighlight, selected && styles.cardSelected]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={styles.flex}>
        <View style={styles.row}>
          <AppText style={styles.planName}>{price.name}</AppText>
          {price.highlight && (
            <View style={styles.pill}>
              <AppText variant="caption" style={styles.pillText}>
                Bester Preis
              </AppText>
            </View>
          )}
        </View>
        <AppText variant="caption" muted>
          {price.perMonthText ?? (price.renews ? 'Abo, jederzeit kündbar' : 'Kein Abo')}
        </AppText>
      </View>
      <View style={styles.priceCol}>
        <AppText style={styles.price}>{price.priceText}</AppText>
        <AppText variant="caption" muted>
          {price.periodText}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.ground },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.xl, paddingTop: Spacing.s },
  close: { height: 36, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface, justifyContent: 'center' },
  closeText: { fontFamily: Fonts.semibold, fontSize: 14 },
  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  flex: { flex: 1 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  kicker: { color: Colors.signal },
  headline: { fontSize: 34, lineHeight: 36 },
  benefits: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.signal },
  benefitText: { fontFamily: Fonts.medium, fontSize: 15, flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, paddingHorizontal: Spacing.l, paddingVertical: Spacing.l },
  cardHighlight: { backgroundColor: Colors.surface2 },
  cardSelected: { backgroundColor: Colors.signalTint },
  radio: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: Colors.signal },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.onSignal },
  planName: { fontFamily: Fonts.displayBold, fontSize: 18 },
  pill: { backgroundColor: Colors.signal, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, paddingVertical: 2 },
  pillText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  priceCol: { alignItems: 'flex-end' },
  price: { fontFamily: Fonts.displayBold, fontSize: 18, fontVariant: ['tabular-nums'] },
  primary: { height: 54, borderRadius: 27, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 16 },
  secondary: { height: 48, borderRadius: 24, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 15 },
  disabled: { opacity: 0.5 },
  note: { color: Colors.warn, fontFamily: Fonts.medium, fontSize: 14, textAlign: 'center' },
  noteGood: { color: Colors.good },
  clubBox: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.xs },
  clubTitle: { fontFamily: Fonts.semibold, fontSize: 15, marginBottom: Spacing.xs },
  mail: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
});
