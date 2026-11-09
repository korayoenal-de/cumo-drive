/**
 * Laufende Gruppenfahrt: die anderen live auf der Karte sehen, Kurznachrichten schicken und
 * Rollen verteilen. Gruppenfahrten startet man aus Meine Touren (Als Gruppe fahren, Mitfahrer mit
 * Namen einladen); Eingeladene sagen über die Einladung in der App zu und fahren mit.
 * Beitreten per Code gibt es in der App nicht mehr.
 */
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { RouteMap } from '@/components/map/route-map';
import type { OtherDriver } from '@/components/map/route-map-shared';
import { Screen } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Size, Spacing, Type } from '@/constants/theme';
import { setActiveTour, useActiveTour } from '@/lib/active-tour';
import { setRideStatus } from '@/lib/group/invites';
import { endRideForAll, leaveRide, QUICK_MESSAGES, sendMessage, setRole, shareTour, useRide, type Member, type Role } from '@/lib/group/ride';
import { createHandoff, fetchHandoff } from '@/lib/handoff';
import { DEFAULT_AVOID } from '@/lib/valhalla';
import { formatKm, haversine, type LatLon, type Tour } from '@/lib/tour';

const ROLE_LABEL: Record<Role, string> = { lead: 'Lead', schluss: 'Schlusslicht', mitfahrer: 'Mitfahrer' };
const EMPTY_TOUR: Tour = { name: '', laenge_km: 0, wegpunkte: [], linie: [], warnungen: [] };

/** Zurück: die Gruppenfahrt ist kein eigener Tab. */
function BackLink() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Zurück"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
      style={styles.back}>
      <SymbolView name="chevron.left" size={18} weight="semibold" tintColor={Colors.text} />
    </Pressable>
  );
}

export default function Gruppe() {
  const ride = useRide();
  return ride.status === 'aus' || ride.status === 'fehler' ? <Start error={ride.error} /> : <Active />;
}

/** Ohne laufende Fahrt: erklären, wie man eine Gruppenfahrt startet oder mitfährt. */
function Start({ error }: { error: string | null }) {
  return (
    <Screen>
      <BackLink />
      <AppText variant="display">{'Gruppen\nfahrt'}</AppText>
      <AppText muted>Alle sehen sich live auf der Karte und schicken sich Kurznachrichten. Sprechfunk folgt.</AppText>
      <View style={styles.card}>
        <AppText variant="label">So geht es</AppText>
        <AppText>Öffne eine gespeicherte Tour in Meine Touren, tippe auf Losfahren und dann auf Als Gruppe fahren. Dort lädst du bis zu 5 Mitfahrer mit ihrem Namen ein.</AppText>
        <AppText muted>Wurdest du eingeladen, erscheint die Einladung unten über den Tabs. Nach der Zusage fährst du mit einem Tipp mit.</AppText>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/touren')} style={[styles.secondary, styles.secondaryOnSurface]}>
          <AppText style={styles.secondaryText}>Zu Meine Touren</AppText>
        </Pressable>
      </View>
      {error && <AppText style={styles.error}>{error}</AppText>}
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

  const [ending, setEnding] = useState(false);
  const end = async () => {
    setEnding(true);
    try {
      if (ride.rideId) await setRideStatus(ride.rideId, 'beendet').catch(() => undefined);
      await endRideForAll();
    } finally {
      setEnding(false);
    }
  };

  const isLead = ride.myRole === 'lead';
  const hasTour = !!active && active.tour.linie.length > 0;

  return (
    <Screen>
      <BackLink />
      <View style={styles.gapXs}>
        <AppText variant="label">Gruppenfahrt</AppText>
        <AppText style={styles.title} numberOfLines={2}>
          {ride.name ?? (ride.code ? `Fahrt ${ride.code.toUpperCase()}` : active?.tour.name || 'Gruppenfahrt')}
        </AppText>
        <AppText variant="caption" muted>
          Du bist {ROLE_LABEL[ride.myRole]}
          {ride.status === 'verbinde' ? ', verbinde …' : `, ${ride.members.length} in der Gruppe`}
        </AppText>
      </View>

      <View style={styles.mapBox}>
        <RouteMap tour={hasTour ? active!.tour : EMPTY_TOUR} others={others} showUser style={StyleSheet.absoluteFill} />
        {others.length === 0 && (
          <View style={styles.mapHint} pointerEvents="none">
            <AppText variant="caption">Noch niemand sonst unterwegs.</AppText>
          </View>
        )}
      </View>

      {ride.tourCode && !isLead && (
        <Pressable accessibilityRole="button" onPress={loadTour} disabled={loadingTour} style={styles.primary}>
          {loadingTour ? <ActivityIndicator color={Colors.onSignal} /> : <AppText style={styles.primaryText}>Tour der Lead übernehmen</AppText>}
        </Pressable>
      )}
      {isLead && hasTour && !ride.tourCode && !ride.rideId && (
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

      {isLead && ride.rideId && (
        <Pressable accessibilityRole="button" disabled={ending} onPress={() => void end()} style={styles.secondary}>
          {ending ? <ActivityIndicator color={Colors.text} /> : <AppText style={styles.secondaryText}>Fahrt für alle beenden</AppText>}
        </Pressable>
      )}
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
  back: { alignSelf: 'flex-start', width: Size.icon, height: Size.icon, borderRadius: Radius.pill, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  primary: { height: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.signal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  primaryText: { color: Colors.onSignal, fontFamily: Fonts.bold, fontSize: Type.title },
  secondary: { minHeight: Size.button, borderRadius: Radius.pill, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  secondaryOnSurface: { backgroundColor: Colors.surface2 },
  secondaryText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.text },
  error: { color: Colors.signal, fontFamily: Fonts.semibold },
  gapXs: { gap: Spacing.xs },
  title: { fontFamily: Fonts.display, fontSize: Type.display, lineHeight: 36, textTransform: 'uppercase' },
  mapBox: { height: 340, borderRadius: Radius.l, overflow: 'hidden', backgroundColor: Colors.surface },
  mapHint: { position: 'absolute', left: Spacing.m, right: Spacing.m, bottom: Spacing.m, padding: Spacing.s, borderRadius: Radius.s, backgroundColor: Colors.overlay, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  msgChip: { minHeight: 44, paddingHorizontal: Spacing.l, borderRadius: 22, backgroundColor: Colors.surface2, justifyContent: 'center' },
  msgChipText: { fontFamily: Fonts.semibold, fontSize: Type.body },
  pressed: { opacity: 0.7 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.xs },
  dot: { width: 12, height: 12, borderRadius: 6 },
  memberName: { fontFamily: Fonts.semibold, fontSize: Type.input },
  roleBtn: { paddingHorizontal: Spacing.m, height: Size.chip, borderRadius: Radius.pill, backgroundColor: Colors.surface2, justifyContent: 'center' },
  leave: { alignSelf: 'center', paddingVertical: Spacing.m },
  leaveText: { color: Colors.muted, fontFamily: Fonts.semibold },
});
