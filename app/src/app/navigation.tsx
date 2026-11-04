/**
 * Navigationsscreen: Karte vollflächig, oben das nächste Manöver, unten Ankunft und Steuerung.
 * Läuft außerhalb der Tabs im Vollbild. Die Logik kommt aus useNavigation (src/lib/navigation).
 */
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/route-map';
import { soonThresholdM } from '@/components/navigation/maneuver-geometry';
import { BigButton, BottomBar, InfoCard, ManeuverCard, Recalculating } from '@/components/navigation/nav-panels';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useActiveTour } from '@/lib/active-tour';
import { useSession } from '@/lib/auth';
import { saveDrive } from '@/lib/drives';
import { useNavigation } from '@/lib/navigation';
import type { NavEntry, NavRequest } from '@/lib/navigation/types';
import { QUICK_MESSAGES, sendMessage, sendPosition, useRide } from '@/lib/group/ride';
import { useRideMode } from '@/lib/ride-mode';
import { fmtG, rideStats, type RideStats, type Sample } from '@/lib/ride-stats';
import { flatten, formatKm, haversine, type LatLon, type Tour } from '@/lib/tour';

export default function NavigationScreen() {
  useKeepAwake();
  const active = useActiveTour();
  const insets = useSafeAreaInsets();
  const [rideMode] = useRideMode();
  const [secret, setSecret] = useState(false);
  const showSim = __DEV__ || secret;

  const [entry, setEntry] = useState<NavEntry>('einsteigen');
  // Abstand zum Tourstart vorab, damit bei weiter Anreise die passende Wahl vorgeschlagen wird
  const [here, setHere] = useState<LatLon | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const p =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      if (alive && p) setHere([p.coords.latitude, p.coords.longitude]);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const toStartKm = useMemo(() => {
    const first = active ? flatten(active.tour)[0]?.p : undefined;
    return here && first ? haversine(here, first) / 1000 : null;
  }, [here, active]);
  const far = toStartKm != null && toStartKm > 30;
  const [entryTouched, setEntryTouched] = useState(false);
  const effEntry: NavEntry = entryTouched ? entry : far ? 'anfahrt' : entry;
  const req = useMemo<NavRequest | null>(
    () =>
      active
        ? {
            tour: active.tour,
            profile: active.profile,
            avoid: active.avoid,
            entry: effEntry,
          }
        : null,
    [active, effEntry],
  );
  const [state, controls] = useNavigation(req);
  const ride = useRide();
  const inRide = ride.status === 'aktiv';
  const [msgOpen, setMsgOpen] = useState(false);
  // Position der Navigation (auch simuliert) an die Gruppe geben
  useEffect(() => {
    if (inRide && state.position) sendPosition(state.position, state.heading, state.speedKmh);
  }, [inRide, state.position, state.heading, state.speedKmh]);
  const others = useMemo(
    () =>
      ride.members
        .filter((m) => m.id !== ride.me?.id && m.p)
        .map((m) => ({
          id: m.id,
          p: m.p!,
          name: m.name,
          role: m.role,
          stale: !m.seenAt,
        })),
    [ride.members, ride.me?.id],
  );
  // Restkilometer beim Start, daraus ergeben sich am Ende die gefahrenen km
  const [startKm, setStartKm] = useState<number | null>(null);
  if (state.status === 'laeuft' && startKm == null && state.remainingKm != null) setStartKm(state.remainingKm);

  // Tour für die Karte: geplante Linie mit Warnungen, darunter die gefahrene Route der Navigation
  const mapTour = useMemo<Tour | null>(() => {
    if (!active) return null;
    if (!state.route) return active.tour;
    return {
      ...active.tour,
      linie: [{ c: 'ok', p: state.route.shape }, ...active.tour.linie],
    };
  }, [active, state.route]);

  // Fahrtstatistik: GPS Punkte während der Fahrt sammeln
  const samples = useRef<Sample[]>([]);
  const [summary, setSummary] = useState<RideStats | null>(null);
  useEffect(() => {
    if (state.status !== 'laeuft' || !state.position) return;
    const last = samples.current[samples.current.length - 1];
    if (last && last.p[0] === state.position[0] && last.p[1] === state.position[1]) return;
    samples.current.push({ t: Date.now(), p: state.position, v: state.speedKmh, h: state.heading });
  }, [state.status, state.position, state.speedKmh, state.heading]);
  const [arrivedStats, setArrivedStats] = useState<RideStats | null>(null);
  useEffect(() => {
    if (state.status !== 'angekommen') return;
    const t = setTimeout(() => setArrivedStats(rideStats(samples.current)), 0);
    return () => clearTimeout(t);
  }, [state.status]);
  const shownStats = summary ?? arrivedStats;

  // Gefahrene Tour einmal im Konto speichern (nicht bei Simulation, nicht ohne Konto)
  const simulated = useRef(false);
  const session = useSession();
  const [saved, setSaved] = useState<'nein' | 'ok' | 'fehler' | 'simulation' | 'ohne_konto' | null>(null);
  const savedFor = useRef<RideStats | null>(null);
  useEffect(() => {
    if (!shownStats || savedFor.current === shownStats || !active) return;
    savedFor.current = shownStats;
    const why = simulated.current ? 'simulation' : !session ? 'ohne_konto' : shownStats.km < 1 ? 'nein' : null;
    if (why) {
      const t = setTimeout(() => setSaved(why), 0);
      return () => clearTimeout(t);
    }
    saveDrive(active.tour.name, shownStats, samples.current)
      .then(() => setSaved('ok'))
      .catch(() => setSaved('fehler'));
  }, [shownStats, session, active]);
  const pins = useMemo(() => {
    if (!shownStats) return undefined;
    const out = [];
    if (shownStats.maxKmh) out.push({ id: 'v', p: shownStats.maxKmh.p, label: `${Math.round(shownStats.maxKmh.value)} km/h`, title: 'Höchstgeschwindigkeit' });
    if (shownStats.maxLatG) out.push({ id: 'q', p: shownStats.maxLatG.p, label: fmtG(shownStats.maxLatG.value), title: 'Größte Querbeschleunigung' });
    if (shownStats.maxBrakeG) out.push({ id: 'b', p: shownStats.maxBrakeG.p, label: `−${fmtG(shownStats.maxBrakeG.value)}`, title: 'Stärkste Bremsung' });
    return out;
  }, [shownStats]);

  const exit = () => {
    controls.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/planen');
  };
  // Beenden mitten in der Fahrt: erst die Statistik zeigen, wenn es genug Punkte gibt
  const close = () => {
    if (!summary && state.status === 'laeuft') {
      const st = rideStats(samples.current);
      if (st && st.km > 1) {
        controls.stop();
        setSummary(st);
        return;
      }
    }
    exit();
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
        others={others}
        pins={pins}
        edgePadding={{
          top: insets.top + 60,
          right: 40,
          bottom: insets.bottom + 260,
          left: 40,
        }}
      />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.s }]} pointerEvents="box-none">
        {running && maneuver && <ManeuverCard maneuver={maneuver} distM={state.distToNextM} then={then} soon={state.distToNextM != null && state.distToNextM <= soonThresholdM(state.speedKmh)} />}
        {status === 'neuberechnung' && <Recalculating first={!route} />}
      </View>

      <View style={[styles.bottom, !running && { paddingBottom: insets.bottom + Spacing.m }]} pointerEvents="box-none">
        {running && (
          <>
            {inRide && msgOpen && (
              <View style={styles.msgSheet}>
                <AppText variant="label">An die Gruppe</AppText>
                <View style={styles.msgChips}>
                  {QUICK_MESSAGES.map((m) => (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      onPress={() => {
                        sendMessage(m);
                        setMsgOpen(false);
                      }}
                      style={({ pressed }) => [styles.msgChip, pressed && { opacity: 0.7 }]}
                    >
                      <AppText style={styles.msgChipText}>{m}</AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <BottomBar
              eta={state.eta}
              remainingKm={state.remainingKm}
              voice={state.voice}
              group={rideMode === 'gruppe' || inRide}
              onFunk={inRide ? () => setMsgOpen(!msgOpen) : undefined}
              showSim={showSim}
              bottomInset={insets.bottom + Spacing.m}
              onEnd={close}
              onVoice={() => controls.setVoice(!state.voice)}
              onSecret={() => setSecret(true)}
              onSimulate={() => {
                simulated.current = true;
                controls.simulate(true);
              }}
            />
          </>
        )}

        {status === 'bereit' && !summary && (
          <View style={styles.pad}>
            <InfoCard>
              <Pressable onLongPress={() => setSecret(true)} delayLongPress={800}>
                <AppText variant="label">Bereit</AppText>
                <AppText style={styles.tourName} numberOfLines={2}>
                  {active.tour.name}
                </AppText>
                <AppText variant="caption" muted>
                  {formatKm(route?.km ?? active.tour.laenge_km, 0)} km
                  {active.tour.minutes ? `, etwa ${Math.round(active.tour.minutes)} min` : ''}
                </AppText>
              </Pressable>
              {far && (
                <AppText style={styles.farNote}>
                  Der Start ist {Math.round(toStartKm!).toLocaleString('de-DE')} km entfernt. Lieber erst zum Start fahren oder unterwegs
                  einsteigen?
                </AppText>
              )}
              <View style={styles.entry} accessibilityRole="radiogroup">
                {(
                  [
                    ...(far
                      ? [
                          {
                            id: 'anfahrt',
                            label: 'Zum Start navigieren',
                            hint: 'Schnellste Route mit Autobahn, die Tour startest du dort',
                          },
                        ]
                      : []),
                    {
                      id: 'einsteigen',
                      label: 'Einsteigen',
                      hint: 'An der nächsten Stelle in die Tour',
                    },
                    {
                      id: 'start',
                      label: 'Über den Startpunkt fahren',
                      hint: far ? 'Anreise schnell, dann die ganze Tour' : 'Die ganze Tour von Anfang an',
                    },
                  ] as { id: NavEntry; label: string; hint: string }[]
                ).map((o) => (
                  <Pressable
                    key={o.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: effEntry === o.id }}
                    onPress={() => {
                      setEntry(o.id);
                      setEntryTouched(true);
                    }}
                    style={styles.entryRow}
                  >
                    <View style={styles.flex}>
                      <AppText style={styles.entryLabel}>{o.label}</AppText>
                      <AppText variant="caption" muted>
                        {o.hint}
                      </AppText>
                    </View>
                    <View style={[styles.radio, effEntry === o.id && styles.radioOn]}>
                      {effEntry === o.id && <View style={styles.radioDot} />}
                    </View>
                  </Pressable>
                ))}
              </View>
              <BigButton label="Start" onPress={() => void controls.start()} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <BigButton label="Schließen" kind="ghost" onPress={close} />
                </View>
                {showSim && (
                  <View style={styles.flex}>
                    <BigButton
                      label="Simulieren"
                      kind="ghost"
                      onPress={() => {
                        simulated.current = true;
                        controls.simulate(true);
                      }}
                    />
                  </View>
                )}
              </View>
            </InfoCard>
          </View>
        )}

        {summary && (
          <View style={styles.pad}>
            <InfoCard>
              <AppText variant="label">Fahrt beendet</AppText>
              <AppText style={styles.tourName} numberOfLines={2}>
                {active.tour.name}
              </AppText>
              <StatsGrid st={summary} />
              <SavedNote saved={saved} />
              <BigButton label="Fertig" onPress={exit} />
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
              {arrivedStats && <StatsGrid st={arrivedStats} />}
              <SavedNote saved={saved} />
              <BigButton label="Fertig" onPress={exit} />
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

function SavedNote({ saved }: { saved: string | null }) {
  const text: Record<string, string> = {
    ok: 'Im Konto gespeichert, du findest die Fahrt in der Garage.',
    fehler: 'Speichern hat nicht geklappt. Prüfe die Verbindung.',
    simulation: 'Simulation, wird nicht gespeichert.',
    ohne_konto: 'Melde dich in der Garage an, dann werden deine Fahrten gespeichert.',
  };
  if (!saved || !text[saved]) return null;
  return (
    <AppText variant="caption" muted>
      {text[saved]}
    </AppText>
  );
}

function StatsGrid({ st }: { st: RideStats }) {
  const h = Math.floor(st.movingMin / 60);
  const m = Math.round(st.movingMin % 60);
  const items: [string, string][] = [
    [formatKm(st.km, st.km < 10 ? 1 : 0), 'km'],
    [h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`, 'Fahrzeit in Bewegung'],
    [`${Math.round(st.avgKmh)} km/h`, 'Schnitt'],
    [st.maxKmh ? `${Math.round(st.maxKmh.value)} km/h` : '–', 'Höchstgeschwindigkeit'],
    [st.maxLatG ? fmtG(st.maxLatG.value) : '–', st.maxLatG ? `Querbeschleunigung, Kurve ${st.maxLatG.side}` : 'Querbeschleunigung'],
    [st.maxBrakeG ? fmtG(st.maxBrakeG.value) : '–', 'Stärkste Bremsung'],
    [st.maxAccelG ? fmtG(st.maxAccelG.value) : '–', 'Stärkste Beschleunigung'],
    [String(st.curves), 'Kurven'],
  ];
  return (
    <View style={styles.statsGrid}>
      {items.map(([v, l]) => (
        <View key={l} style={styles.statCell}>
          <AppText style={styles.statValue}>{v}</AppText>
          <AppText variant="caption" muted>
            {l}
          </AppText>
        </View>
      ))}
      <AppText variant="caption" muted style={styles.statNote}>
        Aus den GPS Daten berechnet, die Spitzenwerte sind auf der Karte markiert.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.m },
  statCell: { width: '50%', gap: 2, paddingRight: Spacing.s },
  statValue: { fontFamily: Fonts.displayBold, fontSize: 22, fontVariant: ['tabular-nums'] },
  statNote: { width: '100%' },
  root: { flex: 1, backgroundColor: Colors.ground },
  pad: { paddingHorizontal: Spacing.l },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.s },
  entry: { gap: 2 },
  msgSheet: {
    marginHorizontal: Spacing.l,
    marginBottom: Spacing.s,
    padding: Spacing.l,
    gap: Spacing.m,
    borderRadius: 16,
    backgroundColor: 'rgba(22,22,24,0.97)',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  msgChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  msgChip: {
    minHeight: 52,
    paddingHorizontal: Spacing.l,
    borderRadius: 26,
    backgroundColor: Colors.surface2,
    justifyContent: 'center',
  },
  msgChipText: { fontFamily: Fonts.bold, fontSize: 17 },
  farNote: {
    fontFamily: Fonts.semibold,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.warn,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    paddingVertical: Spacing.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.line,
  },
  entryLabel: { fontFamily: Fonts.semibold, fontSize: 16 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.text },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.text,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.m,
    gap: Spacing.s,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tourName: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  congrats: {
    fontFamily: Fonts.display,
    fontSize: 34,
    lineHeight: 38,
    textTransform: 'uppercase',
  },
});
