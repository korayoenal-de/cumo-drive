/**
 * Navigationsscreen: Karte vollflächig, oben das nächste Manöver, unten Ankunft und Steuerung.
 * Läuft außerhalb der Tabs im Vollbild. Die Logik kommt aus useNavigation (src/lib/navigation).
 */
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/map/route-map';
import { formatClock, formatDistance } from '@/components/navigation/format';
import { soonThresholdM } from '@/components/navigation/maneuver-geometry';
import { DriveRatingCard } from '@/components/navigation/drive-rating';
import { HighlightCard, LeadStopButton, StopAlert } from '@/components/navigation/nav-alerts';
import { BigButton, BottomBar, InfoCard, ManeuverCard, Recalculating } from '@/components/navigation/nav-panels';
import { Chip } from '@/components/ui/chip';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { useActiveTour } from '@/lib/active-tour';
import { endNavActivity, showNavActivity, symbolForKind } from '@/live/nav-live';
import { useSession } from '@/lib/auth';
import { saveDrive } from '@/lib/drives';
import { useNavigation } from '@/lib/navigation';
import { curveAhead, curveLabel, sharpCurves } from '@/lib/navigation/curves';
import { findHighlights, highlightSpeech, type Highlight } from '@/lib/navigation/highlights';
import type { NavEntry, NavRequest, NavRoute } from '@/lib/navigation/types';
import { elevationProfile } from '@/lib/stats';
import { announceStop, clearStop, QUICK_MESSAGES, sendMessage, sendPosition, STOP_REASONS, useRide } from '@/lib/group/ride';
import { currentVehicle, selectVehicle, useVehicles } from '@/lib/vehicle';
import { fmtG, rideStats, type RideStats, type Sample } from '@/lib/ride-stats';
import { flatten, formatKm, haversine, type LatLon, type Tour } from '@/lib/tour';

export default function NavigationScreen() {
  useKeepAwake();
  const active = useActiveTour();
  const insets = useSafeAreaInsets();
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
  const vehicles = useVehicles();
  const inRide = ride.status === 'aktiv';
  const [msgOpen, setMsgOpen] = useState(false);
  // Position der Navigation (auch simuliert) an die Gruppe geben
  useEffect(() => {
    if (!inRide || !state.position) return;
    const r = state.route;
    const backKm = r?.rejoinIndex != null && state.remainingKm != null ? r.cumKm[r.rejoinIndex] - (r.km - state.remainingKm) : 0;
    sendPosition(state.position, state.heading, state.speedKmh, (state.offRouteM ?? 0) > 60 || backKm > 0.02);
  }, [inRide, state.position, state.heading, state.speedKmh, state.offRouteM, state.route, state.remainingKm]);
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
          off: m.off,
        })),
    [ride.members, ride.me?.id],
  );
  // Highlights (Pässe) entlang der Route: mit Höhenprofil für Anfang und Ende des Abschnitts
  const [hl, setHl] = useState<{ route: NavRoute; list: Highlight[] } | null>(null);
  useEffect(() => {
    const r = state.route;
    if (!r) return;
    const ctrl = new AbortController();
    elevationProfile(r.shape, ctrl.signal)
      .then((e) => setHl({ route: r, list: findHighlights(r.shape, r.cumKm, e) }))
      .catch(() => {
        if (!ctrl.signal.aborted) setHl({ route: r, list: findHighlights(r.shape, r.cumKm, null) });
      });
    return () => ctrl.abort();
  }, [state.route]);
  const atKm = state.route && state.remainingKm != null ? state.route.km - state.remainingKm : null;
  const nextHl =
    hl && hl.route === state.route && atKm != null ? (hl.list.find((h) => atKm >= h.startKm - 1 && atKm <= h.startKm + 0.3) ?? null) : null;
  const hlDistM = nextHl && atKm != null ? (nextHl.startKm - atKm) * 1000 : 0;
  const saidHl = useRef(new Set<string>());
  useEffect(() => {
    if (!nextHl || state.status !== 'laeuft' || hlDistM > 650 || saidHl.current.has(nextHl.id)) return;
    saidHl.current.add(nextHl.id);
    controls.say(highlightSpeech(nextHl, hlDistM));
  }, [nextHl, hlDistM, state.status, controls]);

  // Halt Ansage der Lead: großes Overlay und Ansage für alle anderen
  const stop = inRide ? ride.stop : null;
  const myStop = !!stop && stop.from === ride.me?.id;
  const stopDistM = stop?.p && state.position ? haversine(state.position, stop.p) : null;
  const saidStop = useRef<string | null>(null);
  useEffect(() => {
    if (!stop || myStop || saidStop.current === stop.id) return;
    saidStop.current = stop.id;
    const r = STOP_REASONS.find((x) => x.id === stop.reason) ?? STOP_REASONS[0];
    controls.say(`Achtung. ${r.title}. Bitte gleich anhalten.`);
  }, [stop, myStop, controls]);
  // angekommen: Overlay nach einer Minute am Haltepunkt von selbst weg
  useEffect(() => {
    if (!stop || myStop || stopDistM == null || stopDistM > 60) return;
    const id = setTimeout(() => clearStop(false), 60000);
    return () => clearTimeout(id);
  }, [stop, myStop, stopDistM]);


  // Restkilometer beim Start, daraus ergeben sich am Ende die gefahrenen km
  const [startKm, setStartKm] = useState<number | null>(null);
  if (state.status === 'laeuft' && startKm == null && state.remainingKm != null) setStartKm(state.remainingKm);
  // Beginn der Fahrt für den Schnitt (erste Position im Fahrbetrieb)
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (state.status !== 'laeuft' || startedAt != null) return;
    const id = setTimeout(() => setStartedAt(Date.now()), 0);
    return () => clearTimeout(id);
  }, [state.status, startedAt]);

  // Kurven, die man stark anbremsen muss (ohne Abbiegungen, die sind Manöver), für das Label 150 m vorher
  const curves = useMemo(() => (state.route ? sharpCurves(state.route.shape, state.route.maneuvers.map((m) => m.km)) : []), [state.route]);

  // Zwischenziele der Tour als km auf der Route, für "bis zum nächsten Punkt"
  const viaKms = useMemo(() => {
    const r = state.route;
    const wp = active?.tour.wegpunkte ?? [];
    if (!r || wp.length < 3) return [];
    const out: number[] = [];
    let from = 0;
    for (const w of wp.slice(1, -1)) {
      let best = from;
      let bd = Infinity;
      for (let i = from; i < r.shape.length; i++) {
        const d = haversine(w, r.shape[i]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd < 500) {
        out.push(r.cumKm[best]);
        from = best;
      }
    }
    return out;
  }, [state.route, active]);

  // Tour für die Karte: geplante Linie mit Warnungen, darunter die gefahrene Route der Navigation
  const mapTour = useMemo<Tour | null>(() => {
    if (!active) return null;
    if (!state.route) return active.tour;
    // Nach einer Abweichung: der Weg zurück wird gestrichelt gezeichnet, durchgezogen nur die Tour
    const from = state.route.rejoinIndex ?? 0;
    return {
      ...active.tour,
      linie: [{ c: 'ok', p: state.route.shape.slice(from) }, ...active.tour.linie],
    };
  }, [active, state.route]);
  // nur den noch zu fahrenden Teil des Rückwegs zeigen (in 50 m Schritten, damit die Linie nicht bei jeder Position neu entsteht)
  const doneStep = state.route && state.remainingKm != null ? Math.floor((state.route.km - state.remainingKm) * 20) : 0;
  const dashed = useMemo(() => {
    const r = state.route;
    if (!r?.rejoinIndex) return null;
    const at = doneStep / 20;
    let i = 0;
    while (i < r.rejoinIndex && r.cumKm[i + 1] <= at) i++;
    return r.shape.slice(i, r.rejoinIndex + 1);
  }, [state.route, doneStep]);

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
  const [driveId, setDriveId] = useState<string | null>(null);
  useEffect(() => {
    if (!shownStats || savedFor.current === shownStats || !active) return;
    savedFor.current = shownStats;
    const why = simulated.current ? 'simulation' : !session ? 'ohne_konto' : shownStats.km < 1 ? 'nein' : null;
    if (why) {
      const t = setTimeout(() => setSaved(why), 0);
      return () => clearTimeout(t);
    }
    saveDrive(active.tour.name, shownStats, samples.current, currentVehicle())
      .then((id) => {
        setDriveId(id);
        setSaved('ok');
      })
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
    else router.replace('/');
  };
  // Beenden mitten in der Fahrt: erst die Statistik zeigen, wenn es genug Punkte gibt
  const close = () => {
    if (!summary && (state.status === 'laeuft' || state.status === 'pausiert')) {
      const st = rideStats(samples.current);
      if (st && st.km > 1) {
        controls.stop();
        setSummary(st);
        return;
      }
    }
    exit();
  };

  // Live Activity: nächstes Manöver auf Sperrbildschirm, Dynamic Island und CarPlay Dashboard
  useEffect(() => {
    const st = state.status;
    const running = st === 'laeuft' || st === 'pausiert' || st === 'neuberechnung';
    const m = state.route?.maneuvers[state.next];
    if (!running || !m || !active) {
      if (st === 'angekommen' || st === 'fehler') endNavActivity();
      return;
    }
    const d = formatDistance(state.distToNextM);
    // gröber runden, damit nicht jede Sekunde aktualisiert wird
    showNavActivity({
      symbol: symbolForKind(m.kind, m.exit),
      dist: d.value,
      unit: d.unit,
      text: m.text,
      street: m.street ?? '',
      eta: formatClock(state.eta),
      rest: state.remainingKm != null ? `${formatKm(state.remainingKm, 0)} km` : '',
      soon: state.distToNextM != null && state.distToNextM <= soonThresholdM(state.speedKmh),
      tour: active.tour.name,
    });
  }, [state.status, state.route, state.next, state.distToNextM, state.eta, state.remainingKm, state.speedKmh, active]);
  useEffect(() => () => endNavActivity(), []);

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
  // Abseits der Tour: Meter bis zurück auf die Route (gestrichelter Weg), oder nur abseits ohne neue Route
  const rejoinM =
    route?.rejoinIndex != null && state.remainingKm != null ? (route.cumKm[route.rejoinIndex] - (route.km - state.remainingKm)) * 1000 : null;
  const offTour = running && ((rejoinM != null && rejoinM > 20) || (state.offRouteM != null && state.offRouteM > 60));
  const maneuver = route?.maneuvers[state.next];
  // Scharfe Kurve voraus: nur in Fahrt (ab 30 km/h) und nicht, solange das Label "Abseits der Tour" steht
  const curve =
    status === 'laeuft' && !offTour && atKm != null && (state.speedKmh == null || state.speedKmh >= 30) ? curveAhead(curves, atKm) : null;
  const curveM = curve && atKm != null ? Math.max(0, Math.round(((curve.startKm - atKm) * 1000) / 10) * 10) : 0;
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
        dashed={rejoinM != null && rejoinM > 0 ? dashed : null}
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
        {offTour && (
          <View style={styles.offTour} accessibilityRole="alert">
            <View style={styles.offDash} />
            <AppText style={styles.offText} numberOfLines={1}>
              {rejoinM != null && rejoinM > 20 && status !== 'neuberechnung'
                ? `Abseits der Tour, zurück in ${formatDistance(rejoinM).value} ${formatDistance(rejoinM).unit}`
                : 'Abseits der Tour'}
            </AppText>
          </View>
        )}
        {curve && (
          <View style={styles.curve} accessibilityRole="alert" accessibilityLabel={`${curveLabel(curve)}${curveM > 0 ? ` in ${curveM} Metern` : ''}`}>
            <SymbolView
              name={curve.kind === 'kehre' ? (curve.dir === 'links' ? 'arrow.uturn.left' : 'arrow.uturn.right') : curve.dir === 'links' ? 'arrow.turn.up.left' : 'arrow.turn.up.right'}
              size={16}
              weight="bold"
              tintColor={Colors.warn}
            />
            <AppText style={styles.offText} numberOfLines={1}>
              {curveM > 0 ? `${curveLabel(curve)} · ${curveM} m` : curveLabel(curve)}
            </AppText>
          </View>
        )}
        {running && stop && (
          <StopAlert stop={stop} distM={stopDistM} mine={myStop} onDismiss={() => clearStop(false)} onCancel={() => clearStop(true)} />
        )}
        {running && !stop && nextHl && <HighlightCard h={nextHl} distM={hlDistM} />}
      </View>

      <View style={[styles.bottom, !running && { paddingBottom: insets.bottom + Spacing.m }]} pointerEvents="box-none">
        {running && (
          <>
            {inRide && ride.myRole === 'lead' && !msgOpen && (
              <View style={styles.leadWrap}>
                <LeadStopButton onAnnounce={announceStop} />
              </View>
            )}
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
              extra={(() => {
                if (!route || state.remainingKm == null || route.km <= 0) return undefined;
                const at = route.km - state.remainingKm;
                return {
                  donePct: Math.round((at / route.km) * 100),
                  viaPct: viaKms.map((k) => Math.round((k / route.km) * 1000) / 10).filter((v) => v > 0 && v < 100),
                };
              })()}
              paused={state.status === 'pausiert'}
              onPause={controls.pause}
              voice={state.voice}
              group={inRide}
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
              {vehicles.list.length > 0 && (
                <View style={styles.vehicleRow} accessibilityRole="radiogroup" accessibilityLabel="Fahrzeug für diese Fahrt">
                  {vehicles.list.map((v) => (
                    <Chip key={v.id} label={v.model.trim() || 'Fahrzeug'} active={vehicles.current?.id === v.id} onPress={() => void selectVehicle(v.id)} />
                  ))}
                </View>
              )}
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
              {(saved === null || saved === 'ok') && <DriveRatingCard driveId={driveId} />}
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
              {(saved === null || saved === 'ok') && <DriveRatingCard driveId={driveId} />}
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
    ok: 'Im Konto gespeichert, du findest die Fahrt unter Meine Touren, Gefahren.',
    fehler: 'Speichern hat nicht geklappt. Prüfe die Verbindung.',
    simulation: 'Simulation, wird nicht gespeichert.',
    ohne_konto: 'Melde dich unter Einstellungen an, dann werden deine Fahrten gespeichert.',
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
  entry: { gap: Spacing.s },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  msgSheet: {
    marginHorizontal: Spacing.l,
    marginBottom: Spacing.s,
    padding: Spacing.l,
    gap: Spacing.m,
    borderRadius: Radius.l,
    backgroundColor: Colors.overlaySurface,
  },
  msgChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  msgChip: {
    minHeight: 52,
    paddingHorizontal: Spacing.l,
    borderRadius: 26,
    backgroundColor: Colors.surface2,
    justifyContent: 'center',
  },
  msgChipText: { fontFamily: Fonts.bold, fontSize: Type.title },
  farNote: {
    fontFamily: Fonts.semibold,
    fontSize: Type.body,
    lineHeight: 21,
    color: Colors.warn,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.m,
    paddingVertical: Spacing.s,
  },
  entryLabel: { fontFamily: Fonts.semibold, fontSize: Type.input },
  radio: {
    width: 24,
    height: 24,
    borderRadius: Radius.s,
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
  leadWrap: { paddingHorizontal: Spacing.m, paddingBottom: Spacing.s },
  offTour: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, alignSelf: 'flex-start', backgroundColor: 'rgba(11,11,12,0.92)', borderRadius: Radius.pill, paddingVertical: Spacing.s, paddingHorizontal: Spacing.l },
  curve: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, alignSelf: 'flex-start', backgroundColor: 'rgba(11,11,12,0.92)', borderRadius: Radius.pill, paddingVertical: Spacing.s, paddingHorizontal: Spacing.l },
  offDash: { width: 22, height: 4, borderRadius: 2, backgroundColor: Colors.warn },
  offText: { fontFamily: Fonts.semibold, fontSize: Type.body, color: Colors.warn },
  tourName: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    textTransform: 'uppercase',
    marginTop: Spacing.xs,
  },
  congrats: {
    fontFamily: Fonts.display,
    fontSize: Type.display,
    lineHeight: 38,
    textTransform: 'uppercase',
  },
});
