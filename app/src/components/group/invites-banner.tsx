/**
 * Einladungen zu Gruppenfahrten über den Tabs: „Koray lädt dich zur Tour Odenwald Runde ein“ mit
 * Zusagen und Absagen. Nach der Zusage (und bei zugesagten Fahrten, die noch laufen) gibt es
 * „Jetzt mitfahren“: Tour laden, dem Live Kanal beitreten und die Navigation öffnen.
 * Fragt beim Öffnen der App und danach jede Minute ab, ohne Push Mitteilungen.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_SPACE } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { myInvites, respondInvite, type MyInvite } from '@/lib/group/invites';
import { useRide } from '@/lib/group/ride';
import { myVehicleLabel, rideAlong } from '@/lib/group/start';
import { formatKm } from '@/lib/tour';

const POLL_MS = 60000;

export function InvitesBanner() {
  const session = useSession();
  const ride = useRide();
  const insets = useSafeAreaInsets();
  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);

  const userId = session?.user.id;
  const poll = useCallback(() => {
    if (!userId) return;
    myInvites()
      .then(setInvites)
      .catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') poll();
    });
    return () => {
      clearTimeout(first);
      clearInterval(t);
      sub.remove();
    };
  }, [userId, poll]);

  const inThisRide = (id: string) => ride.rideId === id && (ride.status === 'aktiv' || ride.status === 'verbinde');
  const shown = invites.filter((i) => !hidden.has(i.rideId) && !inThisRide(i.rideId)).slice(0, 3);
  if (!userId || shown.length === 0) return null;

  const hide = (id: string) => setHidden((h) => new Set(h).add(id));

  const respond = async (inv: MyInvite, accept: boolean) => {
    setBusy(inv.rideId);
    setErr(null);
    try {
      await respondInvite(inv.rideId, accept, myVehicleLabel());
      setInvites((list) => (accept ? list.map((i) => (i.rideId === inv.rideId ? { ...i, myStatus: 'zugesagt' } : i)) : list.filter((i) => i.rideId !== inv.rideId)));
    } catch (e) {
      setErr({ id: inv.rideId, text: e instanceof Error ? e.message : 'Das hat nicht geklappt.' });
    } finally {
      setBusy(null);
    }
  };

  const join = async (inv: MyInvite) => {
    setBusy(inv.rideId);
    setErr(null);
    try {
      await rideAlong(inv.rideId);
      router.push('/navigation');
    } catch (e) {
      setErr({ id: inv.rideId, text: e instanceof Error ? e.message : 'Mitfahren hat nicht geklappt.' });
    } finally {
      setBusy(null);
    }
  };

  const accessory = ride.status === 'aktiv' || ride.status === 'verbinde' ? 56 : 0;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_SPACE + accessory }]}>
      {shown.map((inv) => {
        const open = inv.myStatus === 'eingeladen';
        const km = inv.km != null ? `, ${formatKm(inv.km, 0)} km` : '';
        const title = open
          ? `${inv.ownerName} lädt dich zur Tour ${inv.name} ein`
          : inv.rideStatus === 'laeuft'
            ? `${inv.name} läuft gerade, ${inv.ownerName} fährt vorne`
            : `Du fährst mit: ${inv.name} mit ${inv.ownerName}`;
        const isBusy = busy === inv.rideId;
        return (
          <View key={inv.rideId} style={styles.card} accessibilityRole="summary">
            <AppText variant="label" style={styles.kicker}>
              Gruppenfahrt{km}
            </AppText>
            <AppText style={styles.title}>{title}</AppText>
            {err?.id === inv.rideId && <AppText style={styles.error}>{err.text}</AppText>}
            <View style={styles.row}>
              {open ? (
                <>
                  <Btn label="Zusagen" primary busy={isBusy} disabled={!!busy} onPress={() => void respond(inv, true)} />
                  <Btn label="Absagen" disabled={!!busy} onPress={() => void respond(inv, false)} />
                </>
              ) : (
                <>
                  <Btn label="Jetzt mitfahren" primary busy={isBusy} disabled={!!busy} onPress={() => void join(inv)} />
                  <Btn label="Später" disabled={!!busy} onPress={() => hide(inv.rideId)} />
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Btn({ label, primary, busy, disabled, onPress }: { label: string; primary?: boolean; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.btn, primary ? styles.btnPrimary : styles.btnSecondary, (pressed || disabled) && styles.dim]}>
      {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={primary ? styles.btnPrimaryText : styles.btnText}>{label}</AppText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.l, right: Spacing.l, gap: Spacing.s, zIndex: 90 },
  card: { padding: Spacing.l, borderRadius: Radius.l, backgroundColor: Colors.surface2, gap: Spacing.s, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  kicker: { color: Colors.signal },
  title: { fontFamily: Fonts.bold, fontSize: 17 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  row: { flexDirection: 'row', gap: Spacing.s },
  btn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.m },
  btnPrimary: { backgroundColor: Colors.signal },
  btnSecondary: { backgroundColor: Colors.surface },
  btnPrimaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 15 },
  btnText: { color: Colors.text, fontFamily: Fonts.semibold, fontSize: 15 },
  dim: { opacity: 0.6 },
});
