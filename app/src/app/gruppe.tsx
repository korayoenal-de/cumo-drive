/**
 * Gruppenfahrt: Fahrt starten oder mit Code beitreten, die anderen live auf der Karte sehen,
 * Kurznachrichten schicken und die Tour der Lead übernehmen. Ohne Konto, über Supabase Realtime.
 */
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';

import { RouteMap } from '@/components/map/route-map';
import type { OtherDriver } from '@/components/map/route-map-shared';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { setActiveTour, useActiveTour } from '@/lib/active-tour';
import {
  createRide,
  joinRide,
  leaveRide,
  loadProfile,
  normalizeCode,
  QUICK_MESSAGES,
  sendMessage,
  setRole,
  shareTour,
  useRide,
  type Member,
  type Role,
} from '@/lib/group/ride';
import { createHandoff, fetchHandoff } from '@/lib/handoff';
import { DEFAULT_AVOID } from '@/lib/valhalla';
import { formatKm, haversine, type LatLon, type Tour } from '@/lib/tour';

const ROLE_LABEL: Record<Role, string> = { lead: 'Lead', schluss: 'Schlusslicht', mitfahrer: 'Mitfahrer' };
const EMPTY_TOUR: Tour = { name: '', laenge_km: 0, wegpunkte: [], linie: [], warnungen: [] };

/** Link, der die App in Expo Go direkt im Gruppe Tab mit Code öffnet. */
function rideLink(code: string) {
  return `exp://u.expo.dev/44e0d073-6f59-455d-8a50-0f11f6fef4b7/--/gruppe?runtime-version=exposdk%3A58.0.0&channel-name=preview&code=${code}`;
}

/** Zurück zum Planer: die Gruppenfahrt ist kein eigener Tab mehr. */
function BackLink() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Zurück"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
      style={styles.back}>
      <AppText style={styles.backText}>‹ Zurück</AppText>
    </Pressable>
  );
}

export default function Gruppe() {
  const ride = useRide();
  return ride.status === 'aus' || ride.status === 'fehler' ? <Start error={ride.error} /> : <Active />;
}

function Start({ error }: { error: string | null }) {
  const params = useLocalSearchParams<{ code?: string }>();
  const active = useActiveTour();
  const [name, setName] = useState('');
  const [car, setCar] = useState('');
  const [code, setCode] = useState(params.code ? normalizeCode(String(params.code)) : '');
  const [withTour, setWithTour] = useState(true);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    loadProfile().then((p) => {
      if (!p) return;
      setName((n) => n || p.name);
      setCar((c) => c || p.car);
    });
  }, []);

  const start = async () => {
    setBusy(true);
    setLocal(null);
    try {
      let tourCode: string | null = null;
      if (withTour && active) tourCode = await createHandoff(active.tour, active.profile, active.avoid).catch(() => null);
      await createRide(name, car, tourCode);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (normalizeCode(code).length !== 6) {
      setLocal('Der Fahrtcode hat 6 Zeichen.');
      return;
    }
    setBusy(true);
    setLocal(null);
    try {
      await joinRide(code, name, car);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackLink />
      <AppText variant="display">{'Gruppen\nfahrt'}</AppText>
      <AppText muted>Alle sehen sich live auf der Karte und schicken sich Kurznachrichten. Sprechfunk folgt.</AppText>

      <View style={styles.card}>
        <AppText variant="label">Du</AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Dein Name"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          accessibilityLabel="Dein Name"
          autoCapitalize="words"
        />
        <TextInput
          value={car}
          onChangeText={setCar}
          placeholder="Dein Auto, zum Beispiel Cayman GT4"
          placeholderTextColor={Colors.muted}
          style={styles.input}
          accessibilityLabel="Dein Auto"
        />
      </View>

      <View style={styles.card}>
        <AppText variant="label">Fahrt starten</AppText>
        <AppText muted>Du fährst vorne (Lead) und bekommst einen Code für die anderen.</AppText>
        {active && (
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: withTour }} onPress={() => setWithTour(!withTour)} style={styles.checkRow}>
            <View style={[styles.check, withTour && styles.checkOn]}>{withTour && <AppText style={styles.checkMark}>✓</AppText>}</View>
            <AppText style={styles.flex}>
              Tour „{active.tour.name}“ teilen ({formatKm(active.tour.laenge_km, 0)} km)
            </AppText>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" disabled={busy || !name.trim()} onPress={start} style={[styles.primary, (busy || !name.trim()) && styles.disabled]}>
          {busy ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Fahrt starten</AppText>}
        </Pressable>
      </View>

      <View style={styles.card}>
        <AppText variant="label">Beitreten</AppText>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(normalizeCode(t))}
          placeholder="Fahrtcode, 6 Zeichen"
          placeholderTextColor={Colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.codeInput]}
          accessibilityLabel="Fahrtcode"
        />
        <Pressable accessibilityRole="button" disabled={busy || !name.trim()} onPress={join} style={[styles.secondary, styles.secondaryOnSurface, (busy || !name.trim()) && styles.disabled]}>
          <AppText style={styles.secondaryText}>Beitreten</AppText>
        </Pressable>
      </View>

      {(local || error) && <AppText style={styles.error}>{local ?? error}</AppText>}
      {!name.trim() && <AppText variant="caption" muted>Gib zuerst deinen Namen ein, damit die anderen wissen, wer du bist.</AppText>}
    </Screen>
  );
}

function Active() {
  const ride = useRide();
  const active = useActiveTour();
  const [me, setMe] = useState<LatLon | null>(null);
  const [loadingTour, setLoadingTour] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // eigene Position aus der Gruppe (die Fahrt verfolgt den Standort selbst)
  const myMember = ride.members.find((m) => m.id === ride.me?.id);
  const myPos = myMember?.p ?? me;
  useEffect(() => {
    if (myMember?.p) return;
    Location.getLastKnownPositionAsync()
      .then((p) => p && setMe([p.coords.latitude, p.coords.longitude]))
      .catch(() => undefined);
  }, [myMember?.p]);

  const others: OtherDriver[] = useMemo(
    () =>
      ride.members
        .filter((m) => m.id !== ride.me?.id && m.p)
        .map((m) => ({ id: m.id, p: m.p!, name: m.name, role: m.role, stale: !m.seenAt || now - m.seenAt > 60000 })),
    [ride.members, ride.me?.id, now],
  );

  const loadTour = async () => {
    if (!ride.tourCode) return;
    setLoadingTour(true);
    setTourError(null);
    try {
      const h = await fetchHandoff(ride.tourCode);
      if (!h) throw new Error('Die geteilte Tour ist abgelaufen.');
      setActiveTour(h.tour, h.profile, h.avoid ?? DEFAULT_AVOID);
      router.push('/karte');
    } catch (e) {
      setTourError(e instanceof Error ? e.message : 'Die Tour konnte nicht geladen werden.');
    } finally {
      setLoadingTour(false);
    }
  };

  const shareActiveTour = async () => {
    if (!active) return;
    setLoadingTour(true);
    try {
      shareTour(await createHandoff(active.tour, active.profile, active.avoid));
    } catch (e) {
      setTourError(e instanceof Error ? e.message : 'Die Tour konnte nicht geteilt werden.');
    } finally {
      setLoadingTour(false);
    }
  };

  const invite = () =>
    Share.share({
      message: `Fahr mit bei CUMO DRIVE. Code ${ride.code!.toUpperCase()} in der App unter Planen, Gruppe, eingeben oder diesen Link öffnen: ${rideLink(ride.code!)}`,
    }).catch(() => undefined);

  const isLead = ride.myRole === 'lead';
  const hasTour = !!active && active.tour.linie.length > 0;

  return (
    <Screen>
      <BackLink />
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <AppText variant="label">Fahrtcode</AppText>
          <AppText style={styles.code} selectable>
            {ride.code!.slice(0, 3).toUpperCase()} {ride.code!.slice(3).toUpperCase()}
          </AppText>
          <AppText variant="caption" muted>
            Du bist {ROLE_LABEL[ride.myRole]}
            {ride.status === 'verbinde' ? ', verbinde …' : `, ${ride.members.length} in der Gruppe`}
          </AppText>
        </View>
        <Pressable accessibilityRole="button" onPress={invite} style={styles.secondarySmall}>
          <AppText style={styles.secondaryText}>Einladen</AppText>
        </Pressable>
      </View>

      <View style={styles.mapBox}>
        <RouteMap tour={hasTour ? active!.tour : EMPTY_TOUR} others={others} showUser style={StyleSheet.absoluteFill} />
        {others.length === 0 && (
          <View style={styles.mapHint} pointerEvents="none">
            <AppText variant="caption">Noch niemand sonst unterwegs. Teile den Code.</AppText>
          </View>
        )}
      </View>

      {ride.tourCode && !isLead && (
        <Pressable accessibilityRole="button" onPress={loadTour} disabled={loadingTour} style={styles.primary}>
          {loadingTour ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Tour der Lead übernehmen</AppText>}
        </Pressable>
      )}
      {isLead && hasTour && !ride.tourCode && (
        <Pressable accessibilityRole="button" onPress={shareActiveTour} disabled={loadingTour} style={styles.secondary}>
          <AppText style={styles.secondaryText}>Tour „{active!.tour.name}“ mit allen teilen</AppText>
        </Pressable>
      )}
      {hasTour && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/navigation')} style={isLead || !ride.tourCode ? styles.primary : styles.secondary}>
          <AppText style={isLead || !ride.tourCode ? styles.primaryText : styles.secondaryText}>Losfahren</AppText>
        </Pressable>
      )}
      {tourError && <AppText style={styles.error}>{tourError}</AppText>}

      <View style={styles.card}>
        <AppText variant="label">Kurznachricht an alle</AppText>
        <View style={styles.chips}>
          {QUICK_MESSAGES.map((m) => (
            <Pressable key={m} accessibilityRole="button" onPress={() => sendMessage(m)} style={({ pressed }) => [styles.msgChip, pressed && styles.pressed]}>
              <AppText style={styles.msgChipText}>{m}</AppText>
            </Pressable>
          ))}
        </View>
        {ride.messages.slice(0, 5).map((m) => (
          <AppText key={m.id} variant="caption" muted={m.from === ride.me?.id}>
            {new Date(m.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} {m.from === ride.me?.id ? 'Du' : m.name}: {m.text}
          </AppText>
        ))}
      </View>

      <View style={styles.card}>
        <AppText variant="label">In der Gruppe</AppText>
        {ride.members.map((m) => (
          <MemberRow key={m.id} m={m} me={ride.me?.id === m.id} myPos={myPos} now={now} canAssign={isLead && m.id !== ride.me?.id} />
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={() => void leaveRide()} style={styles.leave}>
        <AppText style={styles.leaveText}>Fahrt verlassen</AppText>
      </Pressable>
    </Screen>
  );
}

function MemberRow({ m, me, myPos, now, canAssign }: { m: Member; me: boolean; myPos: LatLon | null; now: number; canAssign: boolean }) {
  const dist = !me && m.p && myPos ? haversine(m.p, myPos) / 1000 : null;
  const ago = m.seenAt ? Math.round((now - m.seenAt) / 1000) : null;
  return (
    <View style={styles.memberRow}>
      <View style={[styles.dot, { backgroundColor: m.role === 'lead' ? Colors.signal : m.role === 'schluss' ? Colors.warn : Colors.text }]} />
      <View style={styles.flex}>
        <AppText style={styles.memberName}>
          {m.name}
          {me ? ' (du)' : ''}
        </AppText>
        <AppText variant="caption" muted>
          {[ROLE_LABEL[m.role], m.car, dist != null ? `${formatKm(dist, dist < 10 ? 1 : 0)} km entfernt` : null, ago == null ? 'noch keine Position' : ago > 60 ? `vor ${Math.round(ago / 60)} min` : null]
            .filter(Boolean)
            .join(', ')}
        </AppText>
      </View>
      {canAssign && (
        <Pressable accessibilityRole="button" onPress={() => setRole(m.id, m.role === 'schluss' ? 'mitfahrer' : 'schluss')} style={styles.roleBtn}>
          <AppText variant="caption">{m.role === 'schluss' ? 'Kein Schluss' : 'Schlusslicht'}</AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.muted },
  flex: { flex: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  input: {
    height: 50,
    paddingHorizontal: Spacing.l,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.m,
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 16,
  },
  codeInput: { fontFamily: Fonts.displayBold, fontSize: 22, letterSpacing: 6, textTransform: 'uppercase' },
  primary: { height: 54, borderRadius: 27, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 17 },
  secondary: { minHeight: 50, borderRadius: 25, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  secondaryOnSurface: { backgroundColor: Colors.surface2 },
  secondarySmall: { height: 40, borderRadius: 20, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text },
  disabled: { opacity: 0.4 },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Colors.muted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.signal, borderColor: Colors.signal },
  checkMark: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: 14, lineHeight: 16 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.m },
  code: { fontFamily: Fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: 4 },
  mapBox: { height: 340, borderRadius: Radius.l, overflow: 'hidden', backgroundColor: Colors.surface },
  mapHint: { position: 'absolute', left: Spacing.m, right: Spacing.m, bottom: Spacing.m, padding: Spacing.s, borderRadius: Radius.s, backgroundColor: 'rgba(11,11,12,0.85)', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  msgChip: { minHeight: 44, paddingHorizontal: Spacing.l, borderRadius: 22, backgroundColor: Colors.surface2, justifyContent: 'center' },
  msgChipText: { fontFamily: Fonts.semibold, fontSize: 15 },
  pressed: { opacity: 0.7 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.xs },
  dot: { width: 12, height: 12, borderRadius: 6 },
  memberName: { fontFamily: Fonts.semibold, fontSize: 16 },
  roleBtn: { paddingHorizontal: Spacing.m, height: 32, borderRadius: 16, backgroundColor: Colors.surface2, justifyContent: 'center' },
  leave: { alignSelf: 'center', paddingVertical: Spacing.m },
  leaveText: { color: Colors.muted, fontFamily: Fonts.semibold },
});
