/**
 * Paywall der CUMO DRIVE Mitgliedschaft. Zwei Anlässe: die Testphase ist vorbei (mode "expired")
 * oder man schaut sich die Mitgliedschaft freiwillig an (mode "voluntary", mit Schließen).
 * Mit gebuchtem Plan oder Club (Koray 17.11.) zeigt sie stattdessen „Dein Plan“: welcher Plan, bis wann, ob er sich
 * verlängert; Hauptaktion Abo verwalten (Apples Seite), Plan wechseln klappt die Pläne auf.
 * Käufe laufen über den Adapter in lib/purchase (RevenueCat). Die Preise kommen aus dem App Store, solange
 * sie noch laden oder ohne Store gelten die festen Preise aus entitlement.ts.
 */
import { useState, type ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type, Size } from '@/constants/theme';
import { CONTACT_EMAIL, formatUntil, PRICES, useEntitlement, type PlanId, type Price } from '@/lib/entitlement';
import { readLibrary } from '@/lib/library';
import { exportAllTours } from '@/lib/route-file';
import { manageSubscription, purchase, restorePurchases, useCurrentPlan, useFreeTrials, useStorePrices, type CurrentPlan } from '@/lib/purchase';
import { t, tr } from '@/i18n';

const BENEFITS = [
  t('Kurvige Touren planen'),
  t('Gruppenfahrten bis 6 Fahrzeuge'),
  t('Navigation mit Ansagen und Live Activity'),
  t('Fahrten und Statistik je Fahrzeug'),
];

export type PaywallMode = 'expired' | 'voluntary';

/**
 * Nach dem Ende der Testphase oder des Plans: Touren bleiben im Konto und lassen sich jederzeit als GPX mitnehmen
 * (Koray 17.11., Nutzerstimmen der Wettbewerber: Touren nach dem Abo weg).
 */
function SaveTours() {
  const [err, setErr] = useState(false);
  const tours = readLibrary();
  if (!tours.length) return null;
  const label = tours.length === 1 ? t('Deine Tour als GPX sichern') : tr('Deine {n} Touren als GPX sichern', { n: tours.length });
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setErr(false);
          exportAllTours(tours, t('CUMO DRIVE Touren')).catch(() => setErr(true));
        }}
        style={styles.saveTours}>
        <AppText style={styles.saveToursText}>{label}</AppText>
      </Pressable>
      {err && <AppText style={styles.note}>{t('Das hat nicht geklappt. Bitte später noch einmal versuchen.')}</AppText>}
    </>
  );
}

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
  const ent = useEntitlement();
  const current = useCurrentPlan();
  /** Plan oder Club aktiv: „Dein Plan“ statt Verkauf */
  const hasPlan = mode === 'voluntary' && ent.active && ent.source !== 'test';
  const [changing, setChanging] = useState(false);
  const [selected, setSelected] = useState<PlanId>('jahr');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const plan = PRICES.find((p) => p.id === selected) ?? PRICES[0];
  const storePrices = useStorePrices();
  const free = useFreeTrials();
  const anyFree = Object.values(free).some(Boolean);
  /** eigene Testphase läuft noch (Start: 30 Tage) */
  const inTrial = mode === 'voluntary' && ent.active && ent.source === 'test' && !ent.loading;

  const run = async (kind: 'buy' | 'restore') => {
    setBusy(kind);
    setNote(null);
    try {
      const r = kind === 'buy' ? await purchase(selected) : await restorePurchases();
      if (r.ok) {
        setNote({ text: kind === 'buy' ? t('Danke, deine Mitgliedschaft ist aktiv.') : t('Deine Mitgliedschaft ist wieder da.'), good: true });
        if (mode === 'voluntary') onClose?.();
      } else if (!r.cancelled) setNote({ text: r.message, good: false });
    } catch {
      setNote({ text: t('Das hat nicht geklappt. Bitte später noch einmal versuchen.'), good: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {onClose && (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Schließen')} onPress={onClose} hitSlop={12} style={styles.close}>
            <SymbolView name="xmark" size={20} weight="semibold" tintColor={Colors.text} />
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.gapM}>
          <AppText variant="label" style={styles.kicker}>
            CUMO DRIVE
          </AppText>
          <AppText variant="display" style={styles.headline}>
            {mode === 'expired' ? (ent.source === 'test' ? t('Deine Testphase ist vorbei') : t('Deine Mitgliedschaft ist abgelaufen')) : hasPlan ? t('Dein Plan') : 'CUMO DRIVE Mitgliedschaft'}
          </AppText>
          {inTrial && (
            <View style={styles.trialBox}>
              <AppText style={styles.trialTitle}>
                {ent.daysLeft <= 1 ? t('Noch 1 Tag kostenlos') : tr('Noch {n} Tage kostenlos', { n: ent.daysLeft })}
              </AppText>
              <AppText muted>
                {anyFree
                  ? t('Du musst jetzt nichts tun. Wählst du schon jetzt Jahr, Monat oder Woche, ist der erste Monat kostenlos, abgebucht wird erst danach.')
                  : t('Du musst jetzt nichts tun. Ein Plan, den du jetzt wählst, beginnt sofort.')}
              </AppText>
            </View>
          )}
          {!hasPlan && !inTrial && (
            <AppText muted>
              {mode === 'expired'
                ? t('Wähle einen Plan, um weiter Touren zu planen und gemeinsam zu fahren. Deine Touren, Fahrten und Fahrzeuge bleiben in deinem Konto.')
                : t('Alles für kurvige Touren und Gruppenfahrten in einer Mitgliedschaft.')}
            </AppText>
          )}
        </View>

        {hasPlan && <PlanStatus current={current} storePrices={storePrices} />}

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefit}>
              <View style={styles.dot} />
              <AppText style={styles.benefitText}>{b}</AppText>
            </View>
          ))}
        </View>

        {hasPlan && !changing && (
          <View style={styles.gapS}>
            {current && current.id !== 'saison' && (
              <Pressable accessibilityRole="button" onPress={() => void manageSubscription()} style={styles.primary}>
                <AppText style={styles.primaryText}>{t('Abo verwalten')}</AppText>
              </Pressable>
            )}
            {ent.source === 'plan' && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSelected((PRICES.find((p) => p.id !== current?.id) ?? PRICES[0]).id);
                  setChanging(true);
                }}
                style={styles.secondary}>
                <AppText style={styles.secondaryText}>{t('Plan wechseln')}</AppText>
              </Pressable>
            )}
            {current && current.id !== 'saison' && (
              <AppText variant="caption" muted>
                {t('Kündigen und Wechseln zwischen Jahr, Monat und Woche laufen über deine Apple ID. Bezahlte Zeit bleibt dir bis zum Ende erhalten.')}
              </AppText>
            )}
          </View>
        )}

        {(!hasPlan || changing) && (
        <View style={styles.gapS} accessibilityRole="radiogroup">
          {PRICES.filter((p) => !current || p.id !== current.id).map((p) => (
            <PlanCard key={p.id} price={storePrices[p.id] ? { ...p, priceText: storePrices[p.id] as string } : p} free={!!free[p.id]} selected={p.id === selected} onPress={() => setSelected(p.id)} />
          ))}
        </View>
        )}

        <View style={styles.gapS}>
          {(!hasPlan || changing) && (
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('buy')} style={[styles.primary, !!busy && styles.disabled]}>
            {busy === 'buy' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>{free[selected] ? tr('{name} mit Gratismonat starten', { name: plan.name }) : t('Weiter mit ') + plan.name}</AppText>}
          </Pressable>
          )}
          {note && <AppText style={[styles.note, note.good && styles.noteGood]}>{note.text}</AppText>}
          {!hasPlan && (
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('restore')} style={styles.secondary}>
            {busy === 'restore' ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.secondaryText}>{t('Käufe wiederherstellen')}</AppText>}
          </Pressable>
          )}
          {mode === 'expired' && <SaveTours />}
        </View>

        {ent.source !== 'club' && (
        <View style={styles.clubBox}>
          <AppText style={styles.clubTitle}>{t('Für Clubs und Veranstalter: CUMO DRIVE Club bis 20 Fahrzeuge, auf Rechnung')}</AppText>
          <AppText variant="caption" muted>
            {t('Mitglieder eines aktiven Clubs brauchen keinen eigenen Plan. Schreib uns an')}
          </AppText>
          <AppText selectable style={styles.mail}>
            {CONTACT_EMAIL}
          </AppText>
        </View>
        )}

        <View style={styles.gapS}>
          <AppText variant="caption" muted>
            {t('Woche, Monat und Jahr verlängern sich automatisch, wenn du nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple ID kündigst. Der Saison Pass gilt 6 Monate und endet von selbst.')}
            {anyFree ? ' ' + t('Ein Gratismonat geht in das gewählte Abo über, wenn du nicht spätestens 24 Stunden vor seinem Ende kündigst.') : ''}
          </AppText>
          {/* Pflicht bei Abos (App Store Regel 3.1.2): Nutzungsbedingungen, Apple EULA und Datenschutz */}
          <View style={styles.legal}>
            {LEGAL_LINKS.map((l) => (
              <Pressable key={l.url} accessibilityRole="link" onPress={() => void Linking.openURL(l.url)} hitSlop={6}>
                <AppText variant="caption" style={styles.legalLink}>
                  {l.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {footer}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Karte „Dein Plan“: Name, Preis, Stand. Ohne Daten aus dem App Store (Web, Club, Plan vom Betreiber) nur der Stand aus dem Konto */
function PlanStatus({ current, storePrices }: { current: CurrentPlan | null; storePrices: Partial<Record<PlanId, string>> }) {
  const ent = useEntitlement();
  const price = current ? PRICES.find((p) => p.id === current.id) : undefined;
  const until = formatUntil(current?.until ?? ent.until);
  const name = ent.source === 'club' ? (ent.clubName ?? t('Club')) : (price?.name ?? t('Plan aktiv'));
  const status =
    ent.source === 'club'
      ? tr('Über deinen Club, gültig bis {until}. Gruppen bis {maxVehicles} Fahrzeuge.', { until, maxVehicles: ent.maxVehicles })
      : !current
        ? tr('Gültig bis {until}.', { until })
        : current.trial
          ? current.willRenew
            ? tr('Gratismonat bis {until}, danach beginnt dein Plan. Bis dahin wird nichts abgebucht.', { until })
            : tr('Gratismonat gekündigt, gilt noch bis {until}.', { until })
        : current.id === 'saison'
          ? tr('Gilt bis {until} und endet von selbst.', { until })
          : current.willRenew
            ? tr('Verlängert sich am {until}.', { until })
            : tr('Gekündigt, gilt noch bis {until}.', { until });
  return (
    <View style={styles.statusCard} accessible accessibilityLabel={`${name}. ${status}`}>
      <View style={styles.row}>
        <AppText style={[styles.statusName, styles.flex]} numberOfLines={1}>
          {name}
        </AppText>
        <View style={[styles.statusPill, current && !current.willRenew && current.id !== 'saison' && styles.statusPillWarn]}>
          <AppText variant="caption" style={[styles.statusPillText, current && !current.willRenew && current.id !== 'saison' && styles.statusPillTextWarn]}>
            {current && !current.willRenew && current.id !== 'saison' ? t('Gekündigt') : current?.trial ? t('Gratismonat') : t('Aktiv')}
          </AppText>
        </View>
      </View>
      {price && (
        <AppText style={styles.statusPrice}>
          {storePrices[price.id] ?? price.priceText} <AppText muted>{price.periodText}</AppText>
        </AppText>
      )}
      <AppText muted>{status}</AppText>
    </View>
  );
}

const LEGAL_LINKS = [
  { label: t('Nutzungsbedingungen'), url: 'https://cumodrive.de/agb' },
  { label: t('Apple Lizenzvertrag'), url: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/' },
  { label: t('Datenschutz'), url: 'https://cumodrive.de/datenschutz' },
];

function PlanCard({ price, free, selected, onPress }: { price: Price; free: boolean; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${price.name}, ${free ? t('Erster Monat kostenlos') + ', ' : ''}${price.priceText} ${price.periodText}`}
      onPress={onPress}
      style={[styles.card, price.highlight && styles.cardHighlight, selected && styles.cardSelected]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
      <View style={styles.flex}>
        <View style={styles.row}>
          <AppText style={styles.planName}>{price.name}</AppText>
          {price.highlight && (
            <View style={styles.pill}>
              <AppText variant="caption" style={styles.pillText}>
                {t('Bester Preis')}
              </AppText>
            </View>
          )}
        </View>
        {free ? (
          <AppText variant="caption" style={styles.freeText}>
            {t('Erster Monat kostenlos')}
          </AppText>
        ) : (
          <AppText variant="caption" muted>
            {price.perMonthText ?? (price.renews ? t('Abo, jederzeit kündbar') : t('Kein Abo'))}
          </AppText>
        )}
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
  legal: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.l, rowGap: Spacing.s },
  trialBox: { backgroundColor: Colors.goodTint, borderRadius: Radius.m, padding: Spacing.m, gap: Spacing.xs },
  trialTitle: { color: Colors.good, fontFamily: Fonts.bold, fontSize: Type.body },
  freeText: { color: Colors.good, fontFamily: Fonts.semibold },
  saveTours: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  saveToursText: { color: Colors.muted, fontFamily: Fonts.semibold, fontSize: Type.body, textDecorationLine: 'underline' },
  legalLink: { color: Colors.text, textDecorationLine: 'underline', minHeight: 24 },
  safe: { flex: 1, backgroundColor: Colors.ground },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.xl, paddingTop: Spacing.s },
  close: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.xxl },
  flex: { flex: 1 },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  kicker: { color: Colors.signal },
  headline: { fontSize: Type.display, lineHeight: 36 },
  benefits: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.signal },
  benefitText: { fontFamily: Fonts.medium, fontSize: Type.body, flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l, paddingHorizontal: Spacing.l, paddingVertical: Spacing.l },
  cardHighlight: { backgroundColor: Colors.surface2 },
  cardSelected: { backgroundColor: Colors.signalTint },
  radio: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: Colors.signal },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.onSignal },
  planName: { fontFamily: Fonts.bold, fontSize: Type.title },
  pill: { backgroundColor: Colors.signal, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, paddingVertical: 2 },
  pillText: { color: Colors.onSignal, fontFamily: Fonts.semibold, fontSize: Type.caption },
  priceCol: { alignItems: 'flex-end' },
  price: { fontFamily: Fonts.display, fontSize: Type.metric, fontVariant: ['tabular-nums'] },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.input },
  secondary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  disabled: { opacity: 0.5 },
  note: { color: Colors.warn, fontFamily: Fonts.medium, fontSize: Type.small, textAlign: 'center' },
  noteGood: { color: Colors.good },
  statusCard: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.xs },
  statusName: { fontFamily: Fonts.display, fontSize: Type.metric, textTransform: 'uppercase' },
  statusPrice: { fontFamily: Fonts.semibold, fontSize: Type.body, fontVariant: ['tabular-nums'] },
  statusPill: { backgroundColor: Colors.goodTint, borderRadius: Radius.pill, paddingHorizontal: Spacing.s, paddingVertical: 2 },
  statusPillWarn: { backgroundColor: Colors.warnTint },
  statusPillText: { color: Colors.good, fontFamily: Fonts.semibold },
  statusPillTextWarn: { color: Colors.warn },
  clubBox: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.xs },
  clubTitle: { fontFamily: Fonts.semibold, fontSize: Type.body, marginBottom: Spacing.xs },
  mail: { fontFamily: Fonts.semibold, fontSize: Type.input, color: Colors.text },
});
