/**
 * Einladungen zu Gruppenfahrten, oben in den Ausfahrten. Ablauf seit 12.11. (Koray, Konzept „Einladen, zusagen,
 * erinnern, losfahren“): Die Zahl steht nur, wenn jetzt etwas zu tun ist. Also bei einer offenen Einladung
 * und wenn der Veranstalter die Gruppenfahrt gestartet hat und du noch nicht drin bist. Eine Zusage für später
 * ist erledigt: Karte und Zahl verschwinden, die Fahrt steht unter „Deine nächsten“, erinnert wird lokal.
 * Fragt beim Öffnen der App und danach jede Minute ab; Push kommt zusätzlich über notify.
 */
import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';

import Animated, { FadeIn } from 'react-native-reanimated';

import { DateBlock } from '@/components/community/ride-bits';
import { OptionsSheet, SHEET_GONE_MS } from '@/components/ui/action-sheet';
import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Leading, Motion, Radius, Size, Spacing, Type } from '@/constants/theme';
import { clock, relDay, type Ausfahrt } from '@/lib/ausfahrten';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { useSession } from '@/lib/auth';
import { declineInvite, myInvites, respondInvite, type MyInvite } from '@/lib/group/invites';
import { useRide } from '@/lib/group/ride';
import { myVehicleLabel, rideAlong } from '@/lib/group/start';
import { formatKm } from '@/lib/tour';

const POLL_MS = 60000;

// Gemeinsamer Stand für Plakette, Reiter und Liste: ein Abruf, alle sehen dasselbe
let invites: MyInvite[] = [];
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
let snap = { invites };
const snapshot = () => (snap.invites === invites ? snap : (snap = { invites }));

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

/** Was jetzt etwas braucht: offene Einladungen und gestartete Fahrten, in denen du noch nicht bist */
export function useInvites(): MyInvite[] {
  const ride = useRide();
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const inThisRide = (id: string) => ride.rideId === id && (ride.status === 'aktiv' || ride.status === 'verbinde');
  return s.invites.filter((i) => !inThisRide(i.rideId) && (i.myStatus === 'eingeladen' || (i.myStatus === 'zugesagt' && i.rideStatus === 'laeuft')));
}

/** Zahl für die Plaketten: was eine Antwort oder ein Mitfahren braucht */
export function useInviteCount(): number {
  return useInvites().length;
}

const DECLINE_REASONS = ['Termin passt nicht', 'Auto nicht fit', 'Zu weit', 'Anderes'];

/** Karten oben in den Ausfahrten; rides liefert Treffpunkt und Strecke, wenn die Fahrt öffentlich ist */
export function InvitesList({ rides, onChanged }: { rides?: Ausfahrt[] | null; onChanged?: () => void }) {
  const shown = useInvites().slice(0, 3);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  const [decline, setDecline] = useState<MyInvite | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  if (shown.length === 0 && !decline) return null;

  const accept = async (inv: MyInvite) => {
    setBusy(inv.rideId);
    setErr(null);
    try {
      await respondInvite(inv.rideId, true, myVehicleLabel());
      setInvites(invites.map((i) => (i.rideId === inv.rideId ? { ...i, myStatus: 'zugesagt' } : i)));
      haptic('ablegen');
      const starts = inv.startsAt ? new Date(inv.startsAt) : null;
      showToast(starts && relDay(starts) !== 'Heute' && relDay(starts) !== 'Morgen' ? 'Du bist dabei. Wir erinnern dich am Vortag.' : 'Du bist dabei.');
      onChanged?.();
    } catch (e) {
      setErr({ id: inv.rideId, text: e instanceof Error ? e.message : 'Das hat nicht geklappt.' });
    } finally {
      setBusy(null);
    }
  };

  const doDecline = async (inv: MyInvite, why: string | null) => {
    setBusy(inv.rideId);
    setErr(null);
    try {
      await declineInvite(inv.rideId, why);
      setInvites(invites.filter((i) => i.rideId !== inv.rideId));
      showToast('Abgesagt', {
        action: {
          label: 'Rückgängig',
          onPress: () =>
            void respondInvite(inv.rideId, true, myVehicleLabel())
              .then(() => {
                refreshInvites();
                onChanged?.();
                showToast('Du bist wieder dabei.');
              })
              .catch((e: Error) => showToast(e.message, { tone: 'error' })),
        },
      });
      onChanged?.();
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
        const r = rides?.find((x) => x.id === inv.rideId) ?? null;
        const starts = r?.startsAt ?? (inv.startsAt ? new Date(inv.startsAt) : null);
        const km = r?.km ?? inv.km;
        const isBusy = busy === inv.rideId;
        const line = [starts ? `${relDay(starts)}, ${clock(starts)} Uhr` : null, r?.meeting?.name ? `Treffpunkt ${r.meeting.name}` : null].filter(Boolean).join(', ');
        if (!open) {
          return (
            <Animated.View key={inv.rideId} entering={FadeIn.duration(Motion.enter)} style={styles.card} accessibilityRole="summary">
              <View style={styles.live}>
                <View style={styles.dot} />
                <AppText style={styles.liveText}>Läuft jetzt</AppText>
              </View>
              <AppText style={styles.bigName} numberOfLines={2}>{inv.name}</AppText>
              <AppText muted>{inv.ownerName} fährt vorne{km != null ? `  ·  ${formatKm(km, 0)} km` : ''}</AppText>
              {err?.id === inv.rideId && <AppText style={styles.error}>{err.text}</AppText>}
              <Btn label="Jetzt mitfahren" primary busy={isBusy} disabled={!!busy} onPress={() => void join(inv)} />
            </Animated.View>
          );
        }
        return (
          <Animated.View key={inv.rideId} entering={FadeIn.duration(Motion.enter)} style={styles.card} accessibilityRole="summary">
            <View style={styles.head}>
              {starts ? <DateBlock d={starts} /> : null}
              <View style={styles.flex}>
                <AppText muted>{inv.ownerName} lädt dich ein</AppText>
                <AppText style={styles.title} numberOfLines={2}>{inv.name}</AppText>
              </View>
            </View>
            {line || km != null ? (
              <AppText muted>{[line, km != null ? `${formatKm(km, 0)} km` : null].filter(Boolean).join('  ·  ')}</AppText>
            ) : null}
            {err?.id === inv.rideId && <AppText style={styles.error}>{err.text}</AppText>}
            <View style={styles.row}>
              <Btn label="Zusagen" primary busy={isBusy} disabled={!!busy} onPress={() => void accept(inv)} />
              <Btn
                label="Absagen"
                disabled={!!busy}
                onPress={() => {
                  setReason(null);
                  setDecline(inv);
                }}
              />
            </View>
          </Animated.View>
        );
      })}
      <OptionsSheet
        visible={!!decline}
        title={decline?.startsAt ? `Möchtest du für ${weekdayLong(new Date(decline.startsAt))} absagen?` : 'Möchtest du absagen?'}
        subtitle={`${decline?.ownerName ?? 'Der Veranstalter'} sieht deine Absage. Wenn du magst, sag kurz warum.`}
        onClose={() => setDecline(null)}>
        <View style={styles.sheet}>
          <View style={styles.chips}>
            {DECLINE_REASONS.map((x) => (
              <Chip key={x} label={x} active={reason === x} onSurface onPress={() => setReason(reason === x ? null : x)} />
            ))}
          </View>
          <View style={styles.row}>
            <Btn label="Abbrechen" onPress={() => setDecline(null)} />
            <Btn
              label="Absagen"
              primary
              onPress={() => {
                const inv = decline;
                setDecline(null);
                if (inv) setTimeout(() => void doDecline(inv, reason), SHEET_GONE_MS);
              }}
            />
          </View>
        </View>
      </OptionsSheet>
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

const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const weekdayLong = (d: Date) => WD_LONG[d.getDay()];

const styles = StyleSheet.create({
  wrap: { gap: Spacing.s },
  card: { padding: Spacing.l, borderRadius: Radius.l, backgroundColor: Colors.surface, gap: Spacing.m },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: Fonts.bold, fontSize: Type.title },
  bigName: { fontFamily: Fonts.display, fontSize: Type.h2, lineHeight: Leading.h2, textTransform: 'uppercase' },
  live: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.good },
  liveText: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.good },
  error: { color: Colors.stopText, fontFamily: Fonts.semibold },
  row: { flexDirection: 'row', gap: Spacing.s },
  sheet: { gap: Spacing.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  btn: { flex: 1, height: Size.button, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.m },
  btnPrimary: { backgroundColor: Colors.signal },
  btnSecondary: { backgroundColor: Colors.surface2 },
  btnPrimaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
  btnText: { color: Colors.text, fontFamily: Fonts.bold, fontSize: Type.body },
  dim: { opacity: 0.6 },
});
