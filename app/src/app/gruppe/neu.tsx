/**
 * Gruppenfahrt mit einer gespeicherten Tour (Parameter tour = ID in Meine Touren).
 * Der Ersteller fährt vorne (Lead) und lädt die Mitfahrer mit ihrem Namen ein, höchstens 6 Fahrzeuge
 * inklusive Ersteller. Die Fahrt wird mit der ersten Einladung angelegt, damit die Einladungen
 * gespeichert sind. „Gruppenfahrt starten“ öffnet die Navigation und den Live Kanal der Fahrt.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import {
  createGroupRide,
  DEFAULT_MAX_MEMBERS,
  findPlannedRide,
  inviteToRide,
  removeFromRide,
  respondInvite,
  rideOverview,
  setRideStatus,
  type InviteStatus,
  type RideMemberRow,
} from '@/lib/group/invites';
import { startAsLead, myVehicleLabel } from '@/lib/group/start';
import { useLibrary } from '@/lib/library';
import { cleanName, findProfiles, useMyProfile, type FoundProfile } from '@/lib/profile';
import { formatKm } from '@/lib/tour';
import { useVehicles } from '@/lib/vehicle';

const STATUS_LABEL: Record<InviteStatus, string> = { eingeladen: 'Eingeladen', zugesagt: 'Zugesagt', abgesagt: 'Abgesagt' };

type RideRef = { id: string; maxMembers: number };

export default function GruppeNeu() {
  const params = useLocalSearchParams<{ tour?: string }>();
  const tourId = typeof params.tour === 'string' ? params.tour : undefined;
  const saved = useLibrary().find((t) => t.id === tourId) ?? null;
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const { current } = useVehicles();

  const [ride, setRide] = useState<RideRef | null>(null);
  const [members, setMembers] = useState<RideMemberRow[]>([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; list: FoundProfile[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const max = ride?.maxMembers ?? DEFAULT_MAX_MEMBERS;
  const others = members.filter((m) => !m.isOwner);
  const taken = 1 + others.filter((m) => m.status !== 'abgesagt').length;
  const full = taken >= max;

  // bereits angelegte, noch nicht gestartete Fahrt zu dieser Tour wieder aufnehmen
  const cloudId = saved?.cloudId;
  useEffect(() => {
    let alive = true;
    findPlannedRide(cloudId)
      .then((r) => {
        if (!alive || !r) return;
        setRide((cur) => cur ?? r);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cloudId]);

  const refresh = useCallback(async (id: string) => {
    try {
      setMembers(await rideOverview(id));
    } catch {
      // nächster Versuch beim nächsten Abfragen
    }
  }, []);

  // Zusagen und Absagen regelmäßig abholen, solange der Screen offen ist
  const rideId = ride?.id;
  useFocusEffect(
    useCallback(() => {
      if (!rideId) return;
      void refresh(rideId);
      const t = setInterval(() => void refresh(rideId), 15000);
      return () => clearInterval(t);
    }, [rideId, refresh]),
  );

  // Vorschläge beim Tippen, kurz verzögert
  const q = cleanName(query);
  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      findProfiles(q)
        .then((list) => alive && setFound({ q, list }))
        .catch(() => alive && setFound({ q, list: [] }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  const invitedIds = new Set(others.filter((m) => m.status !== 'abgesagt').map((m) => m.userId));
  const suggestions = q.length >= 2 && found?.q === q ? found.list.filter((p) => !invitedIds.has(p.id)) : [];
  const searching = q.length >= 2 && found?.q !== q;

  if (!saved) {
    return (
      <Screen>
        <BackLink />
        <AppText variant="display">{'Gruppen\nfahrt'}</AppText>
        <AppText muted>Diese Tour gibt es nicht mehr unter Touren. Wähle dort eine Tour und tippe auf Losfahren, dann Als Gruppe fahren.</AppText>
      </Screen>
    );
  }

  const ensureRide = async (): Promise<RideRef> => {
    if (ride) return ride;
    const r = await createGroupRide(saved);
    setRide(r);
    // eigenes Fahrzeug für die Übersicht der anderen
    await respondInvite(r.id, true, myVehicleLabel()).catch(() => undefined);
    return r;
  };

  const invite = async (p: FoundProfile) => {
    if (busy) return;
    if (full) {
      setErr(`Die Gruppe ist voll, höchstens ${max} Fahrzeuge inklusive dir.`);
      return;
    }
    setBusy(p.id);
    setErr(null);
    try {
      const r = await ensureRide();
      await inviteToRide(r.id, p.id);
      setQuery('');
      await refresh(r.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Einladen hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (m: RideMemberRow) => {
    if (!ride || busy) return;
    setBusy(m.userId);
    setErr(null);
    try {
      await removeFromRide(ride.id, m.userId);
      await refresh(ride.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Entfernen hat nicht geklappt.');
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy('start');
    setErr(null);
    try {
      const r = await ensureRide();
      await setRideStatus(r.id, 'laeuft');
      await startAsLead(r.id, saved.name, saved, saved.profile ?? 'kurvig');
      router.push('/navigation');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Die Fahrt konnte nicht starten.');
    } finally {
      setBusy(null);
    }
  };

  const myName = profile?.displayName ?? 'Du';
  const myCar = current?.model.trim() || profile?.car || null;

  return (
    <Screen>
      <BackLink />
      <View style={styles.gapS}>
        <AppText variant="label">Gruppenfahrt</AppText>
        <AppText variant="display" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
          {saved.name}
        </AppText>
        <AppText muted>
          {formatKm(saved.laenge_km, 0)} km. Lade bis zu {max - 1} Mitfahrer mit ihrem Namen ein. Sie sehen die Einladung in der App und sagen zu oder ab.
        </AppText>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <AppText variant="label">Teilnehmer</AppText>
          <AppText variant="caption" muted accessibilityLabel={`${taken} von ${max} Fahrzeugen`}>
            {taken} von {max}
          </AppText>
        </View>
        <MemberLine name={`${myName} (du)`} vehicle={myCar} badge="Lead" tone="lead" />
        {others.map((m) => (
          <MemberLine
            key={m.userId}
            name={m.name}
            vehicle={m.vehicle}
            badge={STATUS_LABEL[m.status]}
            tone={m.status === 'zugesagt' ? 'good' : m.status === 'abgesagt' ? 'muted' : 'warn'}
            onRemove={() => void remove(m)}
            removing={busy === m.userId}
          />
        ))}
        {others.length === 0 && (
          <AppText variant="caption" muted>
            Noch niemand eingeladen. Such unten nach dem Namen.
          </AppText>
        )}
      </View>

      <View style={styles.card}>
        <AppText variant="label">Mitfahrer einladen</AppText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={full ? 'Die Gruppe ist voll' : 'Name suchen'}
          editable={!full}
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, full && styles.disabled]}
          accessibilityLabel="Mitfahrer mit Namen suchen"
        />
        {searching && <ActivityIndicator color={Colors.muted} />}
        {suggestions.map((p) => (
          <View key={p.id} style={styles.suggestion}>
            <View style={styles.flex}>
              <AppText style={styles.memberName} numberOfLines={1}>
                {p.displayName}
              </AppText>
              {p.car ? (
                <AppText variant="caption" muted numberOfLines={1}>
                  {p.car}
                </AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${p.displayName} einladen`}
              disabled={!!busy || full}
              onPress={() => void invite(p)}
              style={[styles.smallBtn, (!!busy || full) && styles.disabled]}>
              {busy === p.id ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.smallBtnText}>Einladen</AppText>}
            </Pressable>
          </View>
        ))}
        {q.length >= 2 && !searching && suggestions.length === 0 && (
          <AppText variant="caption" muted>
            Niemand mit diesem Namen gefunden.
          </AppText>
        )}
        {q.length > 0 && q.length < 2 && (
          <AppText variant="caption" muted>
            Ab 2 Buchstaben kommen Vorschläge.
          </AppText>
        )}
      </View>

      {err && <AppText style={styles.error}>{err}</AppText>}

      <View style={styles.gapS}>
        <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void start()} style={[styles.primary, !!busy && styles.disabled]}>
          {busy === 'start' ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Gruppenfahrt starten</AppText>}
        </Pressable>
        <AppText variant="caption" muted>
          Du fährst vorne. Wer zugesagt hat, kann jederzeit dazukommen und sieht dich live auf der Karte.
        </AppText>
      </View>
    </Screen>
  );
}

function BackLink() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Zurück"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.navigate('/touren'))}
      style={styles.back}>
      <AppText style={styles.backText}>‹ Zurück</AppText>
    </Pressable>
  );
}

function MemberLine({
  name,
  vehicle,
  badge,
  tone,
  onRemove,
  removing,
}: {
  name: string;
  vehicle: string | null;
  badge: string;
  tone: 'lead' | 'good' | 'warn' | 'muted';
  onRemove?: () => void;
  removing?: boolean;
}) {
  const badgeStyle = tone === 'lead' ? styles.badgeLead : tone === 'good' ? styles.badgeGood : tone === 'warn' ? styles.badgeWarn : styles.badgeMuted;
  const badgeText = tone === 'lead' ? styles.badgeLeadText : tone === 'good' ? styles.goodText : tone === 'warn' ? styles.warnText : styles.mutedText;
  return (
    <View style={styles.memberRow}>
      <View style={styles.flex}>
        <AppText style={styles.memberName} numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" muted numberOfLines={1}>
          {vehicle || 'Fahrzeug unbekannt'}
        </AppText>
      </View>
      <View style={[styles.badge, badgeStyle]}>
        <AppText variant="caption" style={badgeText}>
          {badge}
        </AppText>
      </View>
      {onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${name} entfernen`} hitSlop={8} disabled={removing} onPress={onRemove} style={styles.removeBtn}>
          {removing ? <ActivityIndicator color={Colors.muted} /> : <AppText style={styles.removeText}>✕</AppText>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: Fonts.semibold, fontSize: Type.input, color: Colors.muted },
  flex: { flex: 1, gap: 2 },
  gapS: { gap: Spacing.s },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { height: Size.input, paddingHorizontal: Spacing.l, backgroundColor: Colors.surface2, borderRadius: Radius.m, color: Colors.text, fontFamily: Fonts.medium, fontSize: Type.input },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 48 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, minHeight: 48 },
  memberName: { fontFamily: Fonts.semibold, fontSize: Type.input },
  badge: { paddingHorizontal: Spacing.m, height: 28, borderRadius: Radius.m, justifyContent: 'center' },
  badgeLead: { backgroundColor: Colors.signal },
  badgeLeadText: { color: Colors.onSignal, fontFamily: Fonts.semibold },
  badgeGood: { backgroundColor: Colors.goodTint },
  goodText: { color: Colors.good, fontFamily: Fonts.semibold },
  badgeWarn: { backgroundColor: Colors.warnTint },
  warnText: { color: Colors.warn, fontFamily: Fonts.semibold },
  badgeMuted: { backgroundColor: Colors.surface2 },
  mutedText: { color: Colors.muted, fontFamily: Fonts.semibold },
  removeBtn: { width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: Colors.muted, fontFamily: Fonts.bold, fontSize: Type.small },
  smallBtn: { height: Size.chip, minWidth: 96, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  smallBtnText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.body },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
  disabled: { opacity: 0.4 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
});
