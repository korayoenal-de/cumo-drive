/** Blockierte Drivers (Koray 12.11.): Liste mit Aufheben. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';

import { Avatar } from '@/components/community/ride-bits';
import { SubScreen } from '@/components/settings/settings-ui';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { listBlocks, unblockUser, type Blocked } from '@/lib/moderation';
import { showToast } from '@/lib/toast';
import { t } from '@/i18n';

export default function Blockiert() {
  const [list, setList] = useState<Blocked[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    listBlocks()
      .then(setList)
      .catch((e: Error) => setErr(e.message));
  }, []);
  const lift = async (b: Blocked) => {
    setBusy(b.userId);
    try {
      await unblockUser(b.userId);
      setList((l) => l?.filter((x) => x.userId !== b.userId) ?? l);
      showToast(t('{name} ist nicht mehr blockiert', { name: b.name }));
    } catch (e) {
      showToast(e instanceof Error ? e.message: t('Das hat nicht geklappt.'), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <SubScreen title={t('Blockiert')}>
      <AppText muted>{t('Blockierte Fahrer können dir nicht schreiben, und ihr seht euch nicht unter Drivers. Sie erfahren nichts davon.')}</AppText>
      {list === null && !err && <ActivityIndicator color={Colors.muted} />}
      {err && <AppText style={styles.error}>{err}</AppText>}
      {list?.length === 0 && <AppText muted>{t('Du hast niemanden blockiert.')}</AppText>}
      <View style={styles.list}>
        {list?.map((b) => (
          <View key={b.userId} style={styles.row}>
            <Avatar name={b.name} userId={b.userId} size={40} />
            <AppText style={styles.name} numberOfLines={1}>{b.name}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('{name} nicht mehr blockieren', { name: b.name })} onPress={() => void lift(b)} style={styles.btn}>
              {busy === b.userId ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.btnText}>{t('Aufheben')}</AppText>}
            </Pressable>
          </View>
        ))}
      </View>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, padding: Spacing.m, backgroundColor: Colors.surface, borderRadius: Radius.l },
  name: { flex: 1, fontFamily: Fonts.bold, fontSize: Type.title },
  btn: { height: Size.chip, paddingHorizontal: Spacing.l, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  error: { color: Colors.danger, fontFamily: Fonts.semibold },
});
