/**
 * Prüfbereich für Admins (Koray 12.11.): offene Meldungen mit der Kopie des Inhalts.
 * In Ordnung, Entfernen (mit Hinweis an den Betroffenen) oder Konto sperren, beides mit Rückfrage.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';

import { Avatar } from '@/components/community/ride-bits';
import { SubScreen } from '@/components/settings/settings-ui';
import { ConfirmSheet } from '@/components/ui/action-sheet';
import { TextField } from '@/components/ui/text-field';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { shortDate } from '@/lib/ausfahrten';
import { adminReports, adminResolve, KIND_LABEL, reasonLabel, type AdminReport } from '@/lib/moderation';
import { showToast } from '@/lib/toast';
import { t, tr } from '@/i18n';

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
      showToast(act === 'ok' ? tr('Als in Ordnung markiert') : act === 'entfernt' ? tr('Inhalt entfernt') : tr('Konto gesperrt'));
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message: t('Das hat nicht geklappt.'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SubScreen title={t('Prüfung')}>
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {list?.length === 0 && <AppText muted>{t('Keine offenen Meldungen.')}</AppText>}
      {list?.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.row}>
            <AppText style={styles.kicker}>{reasonLabel(r.reason)}</AppText>
            <AppText variant="caption" muted>{shortDate(r.createdAt)}</AppText>
          </View>
          <AppText muted>{KIND_LABEL[r.kind]} von {r.targetName ?? 'unbekannt'}{r.targetReports > 1 ? tr(', {targetReports} Meldungen insgesamt', { targetReports: r.targetReports }) : ''}{r.targetBanned ? tr(', schon gesperrt') : ''}</AppText>
          {/* stiller Hinweis des Servers: welches Muster, darunter ein Beispiel (Stufe 2, 13.11.) */}
          {r.kind === 'hinweis' && r.note ? <AppText style={styles.btnText}>{r.note}</AppText> : null}
          <View style={[styles.snap, (r.kind === 'profile' || r.kind === 'hinweis') && styles.snapRow]}>
            {/* gemeldetes Profil: auch das Foto zeigen, Entfernen nimmt es mit weg */}
            {(r.kind === 'profile' || r.kind === 'hinweis') && r.target ? <Avatar name={r.targetName ?? '?'} userId={r.target} size={56} /> : null}
            <AppText style={[styles.snapText, styles.flex]}>{r.snapshot ?? tr('Kein Inhalt gespeichert')}</AppText>
          </View>
          {r.note && r.kind !== 'hinweis' ? <AppText muted>{tr('Notiz von ')}{r.reporterName ?? tr('Melder')}: {r.note}</AppText> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy === r.id} onPress={() => void resolve(r, 'ok')} style={styles.btn}>
              {busy === r.id ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.btnText}>{t('In Ordnung')}</AppText>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAsk({ r, act: 'entfernt' })} style={styles.btn}>
              <AppText style={styles.btnText}>{t('Entfernen')}</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setAsk({ r, act: 'gesperrt' })} style={[styles.btn, styles.danger]}>
              <AppText style={[styles.btnText, styles.dangerText]}>{t('Sperren')}</AppText>
            </Pressable>
          </View>
        </View>
      ))}
      <ConfirmSheet
        visible={!!ask}
        title={ask?.act === 'gesperrt' ? tr('Möchtest du {v0} sperren?', { v0: ask.r.targetName ?? 'dieses Konto' }) : tr('Möchtest du diesen Inhalt entfernen?')}
        text={ask?.act === 'gesperrt' ? tr('Der Inhalt wird entfernt, das Konto kann nicht mehr schreiben und verschwindet aus der Community. Die Person bekommt einen Hinweis mit Begründung.') : tr('Die Person bekommt einen Hinweis mit Begründung.')}
        confirmLabel={ask?.act === 'gesperrt' ? tr('Sperren') : tr('Entfernen')}
        onConfirm={() => ask && void resolve(ask.r, ask.act)}
        onClose={() => setAsk(null)}
      />
      {ask && (
        <TextField
          maxFontSizeMultiplier={1.2}
          value={why}
          onChangeText={(t) => setWhy(t.slice(0, 300))}
          placeholder={t('Begründung (optional, sonst der Grund der Meldung)')}
          placeholderTextColor={Colors.muted}
          style={styles.input}
          accessibilityLabel={t('Begründung')}
        />
      )}
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  snapRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  flex: { flex: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.s },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { fontFamily: Fonts.bold, fontSize: Type.title, color: Colors.danger },
  snap: { backgroundColor: Colors.surface2, borderRadius: Radius.m, padding: Spacing.m },
  snapText: { fontFamily: Fonts.medium, fontSize: Type.body, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  btn: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  danger: { backgroundColor: Colors.dangerTint },
  dangerText: { color: Colors.danger },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
});
