import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/ui/tap';

import Planner from '@/components/planner/planner.web';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { useAuthReady, useSession } from '@/lib/auth';
import { loadRoadData, roadDataReady } from '@/lib/road-data';
import { t } from '@/i18n';

/** Vollflächiger Web Planer unter /planer (Desktop), nur mit Konto. Strecken und Pässe kommen nach der Anmeldung vom Server. */
export default function PlanerSeite() {
  const session = useSession();
  const ready = useAuthReady();
  const [data, setData] = useState<'laden' | 'ok' | 'fehler'>(roadDataReady() ? 'ok' : 'laden');
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId || data === 'ok') return;
    let live = true;
    void loadRoadData().then((ok) => live && setData(ok ? 'ok' : 'fehler'));
    return () => {
      live = false;
    };
  }, [userId, data]);
  if (!ready) return null;
  if (!session) return <Redirect href="/login" />;
  if (data === 'ok') return <Planner />;
  return (
    <View style={styles.wrap}>
      {data === 'laden' ? (
        <ActivityIndicator color={Colors.signal} />
      ) : (
        <>
          <AppText muted>{t('Strecken und Pässe konnten nicht geladen werden.')}</AppText>
          <Pressable accessibilityRole="button" onPress={() => setData('laden')} style={styles.retry}>
            <AppText style={{ color: Colors.signal }}>{t('Nochmal versuchen')}</AppText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.m, backgroundColor: Colors.ground },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.m },
});
