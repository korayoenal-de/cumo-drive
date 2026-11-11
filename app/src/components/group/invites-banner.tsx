/**
 * Einladungen zu Gruppenfahrten. Seit 11.11. (Koray) nicht mehr als Karte über jedem Screen, sondern wie eine
 * Nachricht: Zahl an der Community Plakette und am Reiter Ausfahrten, die Karten selbst oben in den Ausfahrten.
 * Zusagen und Absagen; nach der Zusage (und bei zugesagten Fahrten, die noch laufen) „Jetzt mitfahren“:
 * Tour laden, dem Live Kanal beitreten und die Navigation öffnen.
 * Fragt beim Öffnen der App und danach jede Minute ab; Push kommt zusätzlich über notify.
 */
import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { myInvites, respondInvite, type MyInvite } from '@/lib/group/invites';
import { useRide } from '@/lib/group/ride';
import { myVehicleLabel, rideAlong } from '@/lib/group/start';
import { formatKm } from '@/lib/tour';

const POLL_MS = 60000;

// Gemeinsamer Stand für Plakette, Reiter und Liste: ein Abruf, alle sehen dasselbe
let invites: MyInvite[] = [];
let hidden = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setInvites = (v: MyInvite[]) => {
  invites = v;
  emit();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
let snap = { invites, hidden };
const snapshot = () => (snap.invites === invites && snap.hidden === hidden ? snap : (snap = { invites, hidden }));

export function refreshInvites() {
  myInvites()
    .then(setInvites)
    .catch(() => undefined);
}

/** Abruf einmal in der App (Tableiste): beim Start, jede Minute und beim Zurückkommen */
export function useInvitesWatcher() {
  const session = useSession();
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setInvites([]);
      return;
    }
    const first = setTimeout(refreshInvites, 0);
    const t = setInterval(refreshInvites, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshInvites();
    });
    return () => {
      clearTimeout(first);
      clearInterval(t);
      sub.remove();
    };
  }, [userId]);
}

/** Offene Einladungen und laufende zugesagte Fahrten, ohne die schon gefahrene und die mit „Später“ */
export function useInvites(): MyInvite[] {
  const ride = useRide();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const inThisRide = (id: string) => ride.rideId === id && (ride.status === 'aktiv' || ride.status === 'verbinde');
  return s.invites.filter((i) => !s.hidden.has(i.rideId) && !inThisRide(i.rideId));
}

/** Zahl für die Plaketten: was eine Antwort oder ein Mitfahren braucht */
export function useInviteCount(): number {
  return useInvites().length;
}

/** Karten oben in den Ausfahrten */
export function InvitesList() {
  const shown = useInvites().slice(0, 3);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  if (shown.length === 0) return null;

  const hide = (id: string) => {
    hidden = new Set(hidden).add(id);
    emit();
  };

  const respond = async (inv: MyInvite, accept: boolean) => {
    setBusy(inv.rideId);
    setErr(null);
    try {
      await respondInvite(inv.rideId, accept, myVehicleLabel());
      setInvites(accept ? invites.map((i) => (i.rideId === inv.rideId ? { ...i, myStatus: 'zugesagt' } : i)) : invites.filter((i) => i.rideId !== inv.rideId));
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

  return (
    <View style={styles.wrap}>
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
  wrap: { gap: Spacing.s },
  card: { padding: Spacing.l, borderRadius: Radius.l, backgroundColor: Colors.surface, gap: Spacing.s },
  kicker: { color: Colors.signal },
  title: { fontFamily: Fonts.bold, fontSize: Type.title },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  row: { flexDirection: 'row', gap: Spacing.s },
  btn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.m },
  btnPrimary: { backgroundColor: Colors.signal },
  btnSecondary: { backgroundColor: Colors.surface2 },
  btnPrimaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
  btnText: { color: Colors.text, fontFamily: Fonts.semibold, fontSize: Type.body },
  dim: { opacity: 0.6 },
});
