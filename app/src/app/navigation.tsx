/**
 * Navigationsscreen: Karte vollflächig, oben das nächste Manöver, unten Ankunft und Steuerung.
 * Läuft außerhalb der Tabs im Vollbild. Die Logik kommt aus useNavigation (src/lib/navigation).
 */
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/route-map';
import { BigButton, BottomBar, InfoCard, ManeuverCard, Recalculating } from '@/components/navigation/nav-panels';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useActiveTour } from '@/lib/active-tour';
import { useNavigation } from '@/lib/navigation';
import type { NavRequest } from '@/lib/navigation/types';
import { useRideMode } from '@/lib/ride-mode';
import { formatKm, type Tour } from '@/lib/tour';

export default function NavigationScreen() {
  useKeepAwake();
  const active = useActiveTour();
  const insets = useSafeAreaInsets();
  const [rideMode] = useRideMode();
  const [secret, setSecret] = useState(false);
  const showSim = __DEV__ || secret;

  const req = useMemo<NavRequest | null>(
    () => (active ? { tour: active.tour, profile: active.profile, avoid: active.avoid } : null),
    [active],
  );
  const [state, controls] = useNavigation(req);
  // Restkilometer beim Start, daraus ergeben sich am Ende die gefahrenen km
  const [startKm, setStartKm] = useState<number | null>(null);
  if (state.status === 'laeuft' && startKm == null && state.remainingKm != null) setStartKm(state.remainingKm);

  // Tour für die Karte: geplante Linie mit Warnungen, darunter die gefahrene Route der Navigation
  const mapTour = useMemo<Tour | null>(() => {
    if (!active) return null;
    if (!state.route) return active.tour;
    return { ...active.tour, linie: [{ c: 'ok', p: state.route.shape }, ...active.tour.linie] };
  }, [active, state.route]);

  const close = () => {
    controls.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/planen');
  };

  if (!active || !mapTour) {
    return (
      <View style={[styles.root, styles.pad, { paddingTop: insets.top + Spacing.xl }]}>
        <InfoCard>
          <AppText variant="title">Keine Tour gewählt.</AppText>
          <AppText muted>Erstelle zuerst eine Tour im Tab Planen und tippe auf Losfahren.</AppText>
          <BigButton label="Schließen" kind="ghost" onPress={close} />
        </InfoCard>
      </View>
    );
  }

  const { status, route } = state;
  const running = status === 'laeuft' || status === 'pausiert' || status === 'neuberechnung';
  const maneuver = route?.maneuvers[state.next];
  const then = route?.maneuvers[state.next + 1];
  const drivenKm = route ? Math.max(0, (startKm ?? route.km) - (state.remainingKm ?? 0)) : 0;

  return (
    <View style={styles.root}>
      <RouteMap
        tour={mapTour}
        style={StyleSheet.absoluteFill}
        followUser={running}
        showUser
        position={state.position}
        heading={state.heading}
        edgePadding={{ top: insets.top + 60, right: 40, bottom: insets.bottom + 260, left: 40 }}
      />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.s }]} pointerEvents="box-none">
        {running && maneuver && <ManeuverCard maneuver={maneuver} distM={state.distToNextM} then={then} />}
        {status === 'neuberechnung' && <Recalculating first={!route} />}
      </View>

      <View style={[styles.bottom, !running && { paddingBottom: insets.bottom + Spacing.m }]} pointerEvents="box-none">
        {running && (
          <BottomBar
            eta={state.eta}
            remainingKm={state.remainingKm}
            voice={state.voice}
            group={rideMode === 'gruppe'}
            showSim={showSim}
            bottomInset={insets.bottom + Spacing.m}
            onEnd={close}
            onVoice={() => controls.setVoice(!state.voice)}
            onSecret={() => setSecret(true)}
            onSimulate={() => controls.simulate(true)}
          />
        )}

        {status === 'bereit' && (
          <View style={styles.pad}>
            <InfoCard>
              <Pressable onLongPress={() => setSecret(true)} delayLongPress={800}>
                <AppText variant="label">Bereit</AppText>
                <AppText style={styles.tourName} numberOfLines={2}>{active.tour.name}</AppText>
                <AppText variant="caption" muted>
                  {formatKm(route?.km ?? active.tour.laenge_km, 0)} km
                  {active.tour.minutes ? `, etwa ${Math.round(active.tour.minutes)} min` : ''}
                </AppText>
              </Pressable>
              <BigButton label="Start" onPress={() => void controls.start()} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <BigButton label="Schließen" kind="ghost" onPress={close} />
                </View>
                {showSim && (
                  <View style={styles.flex}>
                    <BigButton label="Simulieren" kind="ghost" onPress={() => controls.simulate(true)} />
                  </View>
                )}
              </View>
            </InfoCard>
          </View>
        )}

        {status === 'angekommen' && (
          <View style={styles.pad}>
            <InfoCard tone="good">
              <AppText variant="label">Angekommen</AppText>
              <AppText style={styles.congrats}>Starke Runde!</AppText>
              <AppText muted>
                {formatKm(drivenKm || route?.km || active.tour.laenge_km)} km gefahren auf {active.tour.name}.
              </AppText>
              <BigButton label="Fertig" onPress={close} />
            </InfoCard>
          </View>
        )}

        {status === 'fehler' && (
          <View style={styles.pad}>
            <InfoCard tone="signal">
              <AppText variant="label">Navigation gestoppt</AppText>
              <AppText>{state.error || 'Die Route konnte nicht geladen werden.'}</AppText>
              <BigButton label="Nochmal" onPress={() => void controls.start()} />
              <BigButton label="Schließen" kind="ghost" onPress={close} />
            </InfoCard>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ground },
  pad: { paddingHorizontal: Spacing.l },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.s },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.m, gap: Spacing.s },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tourName: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 30, textTransform: 'uppercase', marginTop: 4 },
  congrats: { fontFamily: Fonts.display, fontSize: 34, lineHeight: 38, textTransform: 'uppercase' },
});
