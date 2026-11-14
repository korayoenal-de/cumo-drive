/**
 * Paywall im Flow: ein Blatt, dessen Inhalt vom Anlass abhängt (lib/paywall.ts, Leinwand „Paywall im Flow“).
 * Aufbau immer gleich: Bild des Falls, Überschrift, ein Satz mit der Zahl aus der Situation, Außerdem dabei,
 * Preiszeile mit „Andere Pläne“, Mitglied werden, ein ehrlicher Ausweg, Kleingedrucktes mit Wiederherstellen.
 * Einmal im Wurzel Layout eingebunden (PaywallHost).
 */
import { SymbolView, type SFSymbol } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { OptionsSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { listDrives } from '@/lib/drives';
import { PRICES, useEntitlement, type PlanId } from '@/lib/entitlement';
import { readLibrary } from '@/lib/library';
import { askMembership, closePaywall, LIMITS_LIVE, usePaywall, type PaywallCtx, type PaywallKind } from '@/lib/paywall';
import { purchase, restorePurchases } from '@/lib/purchase';

type Benefit = { icon: SFSymbol; title: string; text?: string };

const B = {
  ueberall: { icon: 'globe.europe.africa.fill', title: 'Fahren überall, nicht nur zu Hause' },
  paesse: { icon: 'mountain.2.fill', title: 'Pässe und Traumstrecken in sechs Ländern' },
  gruppe: { icon: 'person.3.fill', title: 'Gruppenfahrten bis 6 Autos' },
  funk: { icon: 'mic.fill', title: 'Funk für deine ganze Gruppe' },
  community: { icon: 'person.2.wave.2.fill', title: 'Ausfahrt in der Community zeigen' },
} satisfies Record<string, Benefit>;

/** Ende der Testphase: ganzheitlich, Fokus Tourenplanung (Koray 14.11.), fünf Vorteile */
const FULL: Benefit[] = [
  { icon: 'point.topleft.down.to.point.bottomright.curvepath', title: 'Routen für Sportwagen', text: 'Kurvig statt schnell, um Orte herum, keine Feldwege, geprüft auf Breite und Belag.' },
  { icon: 'mountain.2.fill', title: '364 Pässe und über 480 Traumstrecken', text: 'Von Hand ausgewählt in sechs Ländern, mit Ansage und Fahrspaß Pegel unterwegs.' },
  { icon: 'arrow.triangle.branch', title: 'Etappen mit eigenem Charakter', text: 'Schnell zum Brenner, dann sehr kurvig bis zum Hotel. Jede Etappe ihr Profil.' },
  { icon: 'person.3.fill', title: 'Gemeinsam fahren mit Funk', text: 'Bis 6 Autos, Treffpunkt, Live Positionen und Funk für alle, die du einlädst.' },
  { icon: 'desktopcomputer', title: 'Große Touren am Rechner', text: 'Im Web Planer mehrtägig planen, auf dem iPhone losfahren.' },
];

type Content = { title: string; text: string; benefits: Benefit[]; escapes: string[]; cta?: string };

const day = (d?: Date) => (d ? d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : '');

function content(kind: PaywallKind, c: PaywallCtx): Content {
  switch (kind) {
    case 'ausserhalb':
      return {
        title: 'Fahr die ganze Runde',
        text: `${c.tourName ?? 'Diese Tour'} verlässt nach ${Math.round(c.insideKm ?? 0)} km dein Heimatgebiet. Als Mitglied fährst du überall, so weit du willst.`,
        benefits: [B.paesse, B.gruppe, B.funk],
        escapes: ['Bis zur Grenze fahren', 'Erst mal speichern'],
      };
    case 'gruppe':
      return {
        title: 'Nimm alle mit',
        text: 'Ohne Mitgliedschaft fahrt ihr zu dritt. Als Mitglied lädst du bis zu 6 Autos ein, und alle können funken, auch ohne eigene Mitgliedschaft.',
        benefits: [B.funk, B.ueberall, B.community],
        escapes: ['Bei drei bleiben'],
      };
    case 'funk':
      return {
        title: 'Sprich mit deiner Gruppe',
        text: 'Funk gehört zur Mitgliedschaft. Knopf halten, sprechen, alle hören dich, ohne Telefonat und ohne Messenger.',
        benefits: [{ icon: 'person.3.fill', title: 'Eigene Gruppen bis 6 Autos, alle funken mit' }, B.ueberall],
        escapes: ['Ohne Funk weiterfahren'],
      };
    case 'heimat':
      return {
        title: 'Überall zu Hause',
        text: 'Dein Heimatgebiet hast du schon einmal geändert, ein zweites Mal geht nicht. Als Mitglied brauchst du keins: Du fährst überall.',
        benefits: [B.gruppe, B.funk],
        escapes: [c.homeName ? `${c.homeName} behalten` : 'Heimatgebiet behalten'],
      };
    case 'testende':
      return {
        title: 'Plan die Tour, die du wirklich fahren willst',
        text: '',
        benefits: FULL,
        escapes: ['Kostenlos weiter'],
      };
    case 'abgelaufen':
      return {
        title: 'Deine Ausfahrt braucht dich',
        text: `Deine Mitgliedschaft ist am ${day(c.expiredAt)} ausgelaufen. Für ${c.rideName ?? 'deine Ausfahrt'} sind ${c.vehicles ?? 4} Autos geplant. Verlängere, damit alle mitfahren und funken können. Die anderen erfahren davon nichts.`,
        benefits: [],
        escapes: ['Organisation übergeben'],
        cta: 'Mitgliedschaft verlängern',
      };
  }
}

export function PaywallHost() {
  const open = usePaywall();
  useTrialEnd();
  // bei jedem neuen Blatt frisch (Plan, Hinweise), über den Schlüssel
  return <OptionsSheet visible={!!open} onClose={() => closePaywall('closed')} scroll>{open && <Body key={`${open.kind}:${JSON.stringify(open.ctx)}`} kind={open.kind} ctx={open.ctx} />}</OptionsSheet>;
}

/**
 * Ende der Testphase (Fall F): einmal am letzten Testtag beim Öffnen der App, mit dem eigenen Gebrauch.
 * Stumm, solange LIMITS_LIVE aus ist.
 */
function useTrialEnd() {
  const session = useSession();
  const e = useEntitlement();
  const uid = session?.user.id ?? null;
  const due = LIMITS_LIVE && !!uid && !e.loading && e.active && e.source === 'test' && e.daysLeft <= 1;
  useEffect(() => {
    if (!due || !uid) return;
    let off = false;
    const key = `cumo.testende.${uid}`;
    void (async () => {
      const seen = await AsyncStorage.getItem(key).catch(() => '1');
      if (seen || off) return;
      await AsyncStorage.setItem(key, '1').catch(() => undefined);
      const drives = await listDrives(200).catch(() => []);
      const stats = {
        tours: readLibrary().length,
        km: drives.reduce((a, d) => a + (d.km || 0), 0),
        drives: drives.length,
        curves: drives.reduce((a, d) => a + (d.curves ?? 0), 0),
      };
      if (!off) void askMembership('testende', { stats });
    })();
    return () => {
      off = true;
    };
  }, [due, uid]);
}

function Body({ kind, ctx }: { kind: PaywallKind; ctx: PaywallCtx }) {
  const c = content(kind, ctx);
  const [plans, setPlans] = useState(false);
  const [plan, setPlan] = useState<PlanId>('jahr');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = async (what: 'buy' | 'restore') => {
    setBusy(what);
    setNote(null);
    try {
      const r = what === 'buy' ? await purchase(plan) : await restorePurchases();
      if (r.ok) closePaywall('member');
      else if (!r.cancelled) setNote(r.message);
    } catch {
      setNote('Das hat nicht geklappt. Bitte später noch einmal versuchen.');
    } finally {
      setBusy(null);
    }
  };
  const chosen = PRICES.find((p) => p.id === plan) ?? PRICES[0];

  return (
    <View style={styles.body}>
      {kind === 'testende' ? <TrialStats ctx={ctx} /> : <Visual kind={kind} ctx={ctx} />}

      <View style={styles.gapS}>
        <AppText style={styles.kicker}>Mitgliedschaft</AppText>
        <AppText style={styles.headline} accessibilityRole="header">
          {c.title.toUpperCase()}
        </AppText>
        {!!c.text && <AppText style={styles.lead}>{c.text}</AppText>}
      </View>

      {kind === 'testende' ? (
        <View style={styles.gapL}>
          {c.benefits.map((b) => (
            <View key={b.title} style={styles.fullRow}>
              <View style={styles.fullIcon}>
                <SymbolView name={b.icon} size={18} tintColor={Colors.signal} />
              </View>
              <View style={styles.flex}>
                <AppText style={styles.fullTitle}>{b.title}</AppText>
                <AppText style={styles.muted}>{b.text}</AppText>
              </View>
            </View>
          ))}
          <View style={styles.freeBox}>
            <AppText style={styles.rowTitle}>Ab morgen kostenlos</AppText>
            <AppText style={styles.muted}>Planen überall, fahren im Heimatgebiet, Gruppen zu dritt ohne Funk. Deine Touren bleiben alle erhalten.</AppText>
          </View>
        </View>
      ) : (
        c.benefits.length > 0 && (
          <View style={styles.gapM}>
            <AppText style={styles.muted}>Außerdem dabei</AppText>
            {c.benefits.map((b) => (
              <View key={b.title} style={styles.benefit}>
                <View style={styles.benefitIcon}>
                  <SymbolView name={b.icon} size={15} tintColor={Colors.text} />
                </View>
                <AppText style={styles.rowTitle}>{b.title}</AppText>
              </View>
            ))}
          </View>
        )
      )}

      <View style={styles.gapM}>
        {plans ? (
          <View style={styles.gapS} accessibilityRole="radiogroup">
            {PRICES.map((p) => {
              const sel = p.id === plan;
              return (
                <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: sel }} accessibilityLabel={`${p.name}, ${p.priceText} ${p.periodText}`} onPress={() => setPlan(p.id)} style={[styles.plan, sel && styles.planSel]}>
                  <View style={[styles.radio, sel && styles.radioSel]} />
                  <View style={styles.flex}>
                    <AppText style={styles.rowTitle}>{p.name}</AppText>
                    <AppText style={styles.muted}>{p.perMonthText ?? p.periodText}</AppText>
                  </View>
                  <AppText style={styles.rowTitle}>{p.priceText}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.priceRow}>
            <AppText style={styles.rowTitle}>
              {PRICES[0].priceText} im Jahr <AppText style={styles.muted}>5 € im Monat</AppText>
            </AppText>
            <Pressable accessibilityRole="button" onPress={() => setPlans(true)} hitSlop={8} style={styles.link}>
              <AppText style={styles.linkText}>Andere Pläne</AppText>
            </Pressable>
          </View>
        )}
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('buy')} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          {busy === 'buy' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.ctaText}>{plans ? `Weiter mit ${chosen.name}` : c.cta ?? 'Mitglied werden'}</AppText>}
        </Pressable>
        {note && <AppText style={styles.note}>{note}</AppText>}
        <View style={styles.escapes}>
          {c.escapes.map((e, i) => (
            <Pressable key={e} accessibilityRole="button" onPress={() => closePaywall(i === 0 ? 'escape' : 'escape2')} style={styles.escape}>
              <AppText style={styles.escapeText}>{e}</AppText>
            </Pressable>
          ))}
        </View>
        <View style={styles.small}>
          <AppText style={styles.fine}>
            {chosen.renews ? 'Verlängert sich automatisch, in deiner Apple ID jederzeit kündbar.' : 'Gilt 6 Monate und endet von selbst.'}
          </AppText>
          <View style={styles.legal}>
            <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void run('restore')} hitSlop={6}>
              <AppText style={styles.fineLink}>{busy === 'restore' ? 'Einen Moment' : 'Käufe wiederherstellen'}</AppText>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://drive.rallycumo.de/agb')} hitSlop={6}>
              <AppText style={styles.fineLink}>Bedingungen</AppText>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')} hitSlop={6}>
              <AppText style={styles.fineLink}>Apple Lizenz</AppText>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://drive.rallycumo.de/datenschutz')} hitSlop={6}>
              <AppText style={styles.fineLink}>Datenschutz</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Bild des Falls: knapp, aus Flächen der App, ohne Grafikdateien */
function Visual({ kind, ctx }: { kind: PaywallKind; ctx: PaywallCtx }) {
  if (kind === 'ausserhalb') {
    const inside = Math.max(1, ctx.insideKm ?? 1);
    const outside = Math.max(1, ctx.outsideKm ?? 1);
    return (
      <View style={styles.card}>
        <View style={styles.bar}>
          <View style={[styles.barIn, { flex: inside }]} />
          <View style={[styles.barOut, { flex: outside }]} />
        </View>
        <View style={styles.between}>
          <AppText style={[styles.capt, { color: Colors.good }]}>{Math.round(inside)} km im Heimatgebiet</AppText>
          <AppText style={[styles.capt, { color: Colors.signal }]}>{Math.round(outside)} km draußen</AppText>
        </View>
      </View>
    );
  }
  if (kind === 'gruppe' || kind === 'abgelaufen') {
    const n = Math.max(4, Math.min(6, ctx.vehicles ?? 4));
    return (
      <View style={styles.card}>
        {kind === 'abgelaufen' && (
          <View style={styles.gapXs}>
            <AppText style={styles.rideName}>{(ctx.rideName ?? 'Ausfahrt').toUpperCase()}</AppText>
            {ctx.rideDate && <AppText style={styles.muted}>{ctx.rideDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</AppText>}
          </View>
        )}
        <View style={styles.seats}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={[styles.seat, i < 3 && styles.seatTaken, i >= 3 && i < n && (kind === 'abgelaufen' ? styles.seatWarn : styles.seatExtra), i >= n && styles.seatFree]} />
          ))}
        </View>
        <AppText style={[styles.capt, { color: kind === 'abgelaufen' ? Colors.warn : Colors.signal }]}>
          {kind === 'abgelaufen' ? `Ohne Mitgliedschaft: ${n - 3} ${n - 3 === 1 ? 'Auto' : 'Autos'} zu viel, kein Funk` : `3 frei dabei, ${ctx.extraName ?? 'das nächste Auto'} wäre Nummer 4`}
        </AppText>
      </View>
    );
  }
  if (kind === 'funk') {
    return (
      <View style={[styles.card, styles.center]}>
        <View style={styles.mic}>
          <SymbolView name="mic.fill" size={28} tintColor={Colors.muted} />
          <View style={styles.lock}>
            <SymbolView name="lock.fill" size={12} tintColor={Colors.ground} />
          </View>
        </View>
      </View>
    );
  }
  // heimat
  return (
    <View style={[styles.card, styles.center]}>
      <View style={styles.homePill}>
        <SymbolView name="house.fill" size={15} tintColor={Colors.good} />
        <AppText style={[styles.rowTitle, { color: Colors.good }]}>{ctx.homeName ?? 'Dein Heimatgebiet'}, 150 km</AppText>
      </View>
    </View>
  );
}

function TrialStats({ ctx }: { ctx: PaywallCtx }) {
  const s = ctx.stats ?? { tours: 0, km: 0, drives: 0, curves: 0 };
  const cells = [
    ['Touren geplant', String(s.tours)],
    ['Gefahren', `${Math.round(s.km).toLocaleString('de-DE')} KM`],
    ['Fahrten', String(s.drives)],
    ['Kurven', s.curves.toLocaleString('de-DE')],
  ];
  return (
    <View style={styles.gapM}>
      <View style={styles.trialPill}>
        <AppText style={[styles.capt, { color: Colors.signal }]}>Test endet heute</AppText>
      </View>
      <AppText style={styles.headline}>DEINE 14 TAGE</AppText>
      <View style={styles.grid}>
        {cells.map(([l, v]) => (
          <View key={l} style={styles.cell}>
            <AppText style={styles.muted}>{l}</AppText>
            <AppText style={styles.cellValue}>{v}</AppText>
          </View>
        ))}
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.xl, paddingBottom: Spacing.s },
  flex: { flex: 1, minWidth: 0 },
  gapXs: { gap: Spacing.xs },
  gapS: { gap: Spacing.s },
  gapM: { gap: Spacing.m },
  gapL: { gap: Spacing.l },
  center: { alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.signal },
  headline: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 32, color: Colors.text },
  lead: { fontFamily: Fonts.regular, fontSize: Type.title, lineHeight: 24, color: '#C9C9CC' },
  muted: { fontFamily: Fonts.semibold, fontSize: Type.body, lineHeight: 21, color: Colors.muted },
  rowTitle: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  capt: { fontFamily: Fonts.bold, fontSize: Type.caption },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m, minHeight: 110 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 3 },
  barIn: { backgroundColor: Colors.good },
  barOut: { backgroundColor: Colors.signal },
  seats: { flexDirection: 'row', justifyContent: 'space-between' },
  seat: { width: 40, height: 40, borderRadius: 20 },
  seatTaken: { backgroundColor: '#4A3A2A' },
  seatExtra: { backgroundColor: Colors.signalTint, borderWidth: 2, borderColor: Colors.signal },
  seatWarn: { backgroundColor: Colors.warnTint, borderWidth: 2, borderColor: Colors.warn },
  seatFree: { borderWidth: 2, borderColor: Colors.empty, borderStyle: 'dashed' },
  rideName: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text },
  mic: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#232326', alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.warn, alignItems: 'center', justifyContent: 'center' },
  homePill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, backgroundColor: Colors.goodTint, borderRadius: Radius.pill, paddingHorizontal: Spacing.l, height: 40 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  fullRow: { flexDirection: 'row', gap: Spacing.l, alignItems: 'flex-start' },
  fullIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.signalTint, alignItems: 'center', justifyContent: 'center' },
  fullTitle: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.text },
  freeBox: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.xs },
  trialPill: { alignSelf: 'flex-start', backgroundColor: Colors.signalTint, borderRadius: Radius.pill, paddingHorizontal: Spacing.m, height: 28, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  cell: { width: '48%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.xs },
  cellValue: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text },
  rule: { height: 1, backgroundColor: '#232326', marginTop: Spacing.s },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.m },
  link: { minHeight: Size.icon, justifyContent: 'center' },
  linkText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  plan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.l, minHeight: 64, borderRadius: Radius.l, backgroundColor: Colors.surface, paddingHorizontal: Spacing.l },
  planSel: { backgroundColor: 'rgba(226,70,28,0.12)' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#55555A' },
  radioSel: { borderWidth: 7, borderColor: Colors.signal },
  cta: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.onSignal },
  pressed: { opacity: 0.88 },
  note: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.stopText, textAlign: 'center' },
  escapes: { flexDirection: 'row', gap: Spacing.s },
  escape: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  escapeText: { fontFamily: Fonts.bold, fontSize: Type.button, color: Colors.text },
  small: { gap: Spacing.xs, alignItems: 'center' },
  fine: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: '#8E8E93', textAlign: 'center' },
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: Spacing.m, rowGap: Spacing.xs },
  fineLink: { fontFamily: Fonts.semibold, fontSize: Type.caption, color: '#8E8E93', textDecorationLine: 'underline' },
});
