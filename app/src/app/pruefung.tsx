/**
 * Prüfbereich für Admins (Koray 12.11.): offene Meldungen mit der Kopie des Inhalts.
 * In Ordnung, Entfernen (mit Hinweis an den Betroffenen) oder Konto sperren, beides mit Rückfrage.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SubScreen } from '@/components/settings/settings-ui';
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { shortDate } from '@/lib/ausfahrten';
import { adminReports, adminResolve, KIND_LABEL, reasonLabel, type AdminReport } from '@/lib/moderation';
import { showToast } from '@/lib/toast';

type Act = 'ok' | 'entfernt' | 'gesperrt';

export default function Pruefung() {
  const [list, setList] = useState<AdminReport[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ r: AdminReport; act: Act } | null>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    adminReports()
      .then(setList)
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const resolve = async (r: AdminReport, act: Act) => {
    setBusy(r.id);
    try {
      await adminResolve(r.id, act, why);
      setWhy('');
      showToast(act === 'ok' ? 'Als in Ordnung markiert' : act === 'entfernt' ? 'Inhalt entfernt' : 'Konto gesperrt');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SubScreen title="Prüfung">
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {list?.length === 0 && <AppText muted>Keine offenen Meldungen.</AppText>}
      {list?.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.row}>
            <AppText style={styles.kicker}>{reasonLabel(r.reason)}</AppText>
            <AppText variant="caption" muted>{shortDate(r.createdAt)}</AppText>
          </View>
          <AppText muted>{KIND_LABEL[r.kind]} von {r.targetName ?? 'unbekannt'}{r.targetReports > 1 ? `, ${r.targetReports} Meldungen insgesamt` : ''}{r.targetBanned ? ', schon gesperrt' : ''}</AppText>
          <View style={styles.snap}>
            <AppText style={styles.snapText}>{r.snapshot ?? 'Kein Inhalt gespeichert'}</AppText>
          </View>
          {r.note ? <AppText muted>Notiz von {r.reporterName ?? 'Melder'}: {r.note}</AppText> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy === r.id} onPress={() => void resolve(r, 'ok')} style={styles.btn}>
              {busy === r.id ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.btnText}>In Ordnung</AppText>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAsk({ r, act: 'entfernt' })} style={styles.btn}>
              <AppText style={styles.btnText}>Entfernen</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAsk({ r, act: 'gesperrt' })} style={[styles.btn, styles.danger]}>
              <AppText style={[styles.btnText, styles.dangerText]}>Sperren</AppText>
            </Pressable>
          </View>
        </View>
      ))}
      <ConfirmSheet
        visible={!!ask}
        title={ask?.act === 'gesperrt' ? `Möchtest du ${ask.r.targetName ?? 'dieses Konto'} sperren?` : 'Möchtest du diesen Inhalt entfernen?'}
        text={ask?.act === 'gesperrt' ? 'Der Inhalt wird entfernt, das Konto kann nicht mehr schreiben und verschwindet aus der Community. Die Person bekommt einen Hinweis mit Begründung.' : 'Die Person bekommt einen Hinweis mit Begründung.'}
        confirmLabel={ask?.act === 'gesperrt' ? 'Sperren' : 'Entfernen'}
        onConfirm={() => ask && void resolve(ask.r, ask.act)}
        onClose={() => setAsk(null)}
      />
      {ask && (
        <TextInput
          maxFontSizeMultiplier={1.2}
          value={why}
          onChangeText={(t) => setWhy(t.slice(0, 300))}
          placeholder="Begründung (optional, sonst der Grund der Meldung)"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          accessibilityLabel="Begründung"
        />
      )}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.s },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.stopText },
  snap: { backgroundColor: Colors.surface2, borderRadius: Radius.m, padding: Spacing.m },
  snapText: { fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  btn: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  danger: { backgroundColor: Colors.signalTint },
  dangerText: { color: Colors.stopText },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
});
