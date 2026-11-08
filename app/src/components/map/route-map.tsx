/**
 * Karte mit einer Tour. Heute react-native-maps (auf dem iPhone Apple Maps, läuft in Expo Go).
 * Später mit eigenem App Build MapLibre: dann wird nur diese Datei ersetzt, die Props bleiben.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import MapView, { AnimatedRegion, Marker, Polyline, type LatLng } from 'react-native-maps';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { arrowsAlong, offsetRight, splitDoubled } from '@/lib/doubled';
import { listDriveTracks } from '@/lib/drives';
import { useLibrary } from '@/lib/library';
import { useMapSettings, type MapStyle } from '@/lib/map-settings';
import { passPoint, PASSES } from '@/lib/passes';
import { RADAR_FAST_MS, RADAR_MS, RADAR_REPEAT_MS, REVEAL_MS, type RadarRoad } from '@/lib/radar';
import type { CheckClass, LatLon } from '@/lib/tour';
import { CarTopView, carSymbolFor } from '@/components/map/car-marker';
import { useVehicles } from '@/lib/vehicle';
import { useRouteWeather, WeatherMarkers, WeatherSheet } from '@/components/map/weather-layer';

import { CLASS_LINE, ROLE_COLOR, sampleLine, tourWarnings, type RouteMapProps } from './route-map-shared';

export type { RouteMapProps } from './route-map-shared';

const EDGE = { top: 60, right: 40, bottom: 60, left: 40 };
/** Nach dem Verschieben bleibt die Kamera so lange stehen, bevor sie wieder folgt. */
const FOLLOW_PAUSE_MS = 10000;

const ll = ([latitude, longitude]: LatLon): LatLng => ({ latitude, longitude });

const MAP_TYPE: Record<MapStyle, 'mutedStandard' | 'hybrid' | 'hybridFlyover'> = { standard: 'mutedStandard', satellit: 'hybrid', '3d': 'hybridFlyover' };
const TIER_DOT = { ikone: Colors.signal, bekannt: Colors.warn, mittel: Colors.text } as const;

/** Spuren der eigenen Fahrten, einmal geladen und dann behalten */
let driveCache: { id: string; p: LatLng[] }[] | null = null;

export function RouteMap({
  tour,
  style,
  interactive = true,
  showUser = false,
  onPressWarning,
  followUser = false,
  heading,
  highlightIndex,
  position,
  edgePadding,
  mapPadding,
  others,
  pins,
  onLongPress,
  focus,
  autoFit = true,
  dashed,
  layers = false,
  onPressPass,
  onPressMap,
  pickedPassIds,
  flyTo,
  radar,
}: RouteMapProps) {
  const settings = useMapSettings();
  // Eigenes Auto statt Pfeil, wenn in der Garage eingeschaltet
  const carSymbol = carSymbolFor(useVehicles().current);
  const library = useLibrary();
  // Wetter an den Pässen der Route (Ebene Wetter, nur im Planer)
  const weatherItems = useRouteWeather(tour, layers && settings.weather && tour.linie.length > 0);
  const [weatherOpen, setWeatherOpen] = useState<(typeof weatherItems)[number] | null>(null);
  const showTours = layers && settings.myTours;
  const tourLines = useMemo(
    () => (showTours ? library.map((t) => ({ id: t.id, p: sampleLine(t, 250).map(ll) })).filter((t) => t.p.length > 1) : []),
    [showTours, library],
  );
  const showDrives = layers && settings.drives;
  const [drives, setDrives] = useState(driveCache);
  useEffect(() => {
    if (!showDrives || driveCache) return;
    let alive = true;
    listDriveTracks()
      .then((d) => {
        driveCache = d.map((x) => ({ id: x.id, p: x.p.map(ll) }));
        if (alive) setDrives(driveCache);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [showDrives]);

  const map = useRef<MapView>(null);
  const markers = useRef<(MapMarker | null)[]>([]);
  // Apple Maps meldet einen Tipp auf einen schon ausgewählten Marker nicht noch einmal: Pass Marker nach dem Tipp
  // wieder abwählen, sonst lässt sich derselbe Pass nur einmal antippen (Koray 8.11.)
  const passRefs = useRef(new Map<string, MapMarker | null>());
  const [ready, setReady] = useState(false);
  // nach eigenem Verschieben folgt die Kamera eine Weile nicht
  const [paused, setPaused] = useState(0);
  const following = followUser && !!position && paused === 0;

  // Doppelt gefahrene Stücke (Hin und Rückweg auf derselben Straße) zeigt die Karte als zwei versetzte
  // Linien mit Richtungspfeilen, damit man sieht, dass die Straße zweimal gefahren wird. Nicht beim Mitfahren.
  const parts = useMemo(
    () => (followUser ? tour.linie.map((r) => [{ p: r.p, doubled: false }]) : splitDoubled(tour.linie.map((r) => r.p))),
    [tour, followUser],
  );
  /** Meter je Bildpunkt, aus dem sichtbaren Ausschnitt; daraus Versatz und Pfeilabstand */
  const [mpp, setMpp] = useState(0);
  const [boxH, setBoxH] = useState(0);
  const offM = mpp ? Math.max(3, mpp * 4) : 0;
  const offKey = offM ? Math.round(Math.log2(offM) * 4) : 0;

  const runs = useMemo(() => {
    // ok zuerst, damit Warnstellen oben liegen
    const order: CheckClass[] = ['ok', 'pruefen', 'raus'];
    // Schlüssel aus dem Inhalt: Apple Maps verliert beim Ändern der Punkte einer bestehenden Linie
    // manchmal die Farbe (Linie wird schwarz). Mit neuem Schlüssel wird sie neu angelegt.
    const k = (c: CheckClass, p: LatLon[], extra: string) => `${c}-${extra}-${p.length}-${p[0][0].toFixed(5)}-${p[p.length - 1][1].toFixed(5)}`;
    return order.flatMap((c) =>
      tour.linie.flatMap((r, ri) =>
        r.c !== c
          ? []
          : parts[ri].map((part) => {
              const p = part.doubled && offM ? offsetRight(part.p, offM) : part.p;
              return { c, coords: p.map(ll), key: k(c, part.p, part.doubled ? `d${offKey}` : 'e'), doubled: part.doubled };
            }),
      ),
    );
    // offKey fasst offM in Stufen zusammen, damit nicht jede kleine Zoomänderung neu zeichnet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, parts, offKey]);
  const arrows = useMemo(
    () => (offM ? runs.filter((r) => r.doubled).flatMap((r) => arrowsAlong(r.coords.map((x) => [x.latitude, x.longitude] as LatLon), mpp * 90, 12)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs, offKey],
  );

  const fitCoords = useMemo(() => sampleLine(tour, 300).map(ll), [tour]);
  const allWarnings = useMemo(() => tourWarnings(tour), [tour]);
  const warnings = settings.warnings ? allWarnings : [];
  const all = tour.linie.flatMap((r) => r.p);
  const start = tour.wegpunkte[0] ?? all[0];
  const ziel = tour.wegpunkte[tour.wegpunkte.length - 1] ?? all[all.length - 1];
  const roundTrip = !!start && !!ziel && Math.abs(start[0] - ziel[0]) + Math.abs(start[1] - ziel[1]) < 0.0005;
  const pad = edgePadding ?? EDGE;

  // Ausschnitt an die Tour anpassen, solange keine Warnung gewählt ist und die Kamera nicht folgt
  useEffect(() => {
    if (!ready || !autoFit || followUser || highlightIndex != null || fitCoords.length < 2) return;
    map.current?.fitToCoordinates(fitCoords, { edgePadding: pad, animated: true });
    // pad ist ein Objekt, die Werte reichen als Abhängigkeit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, autoFit, followUser, highlightIndex, fitCoords, pad.top, pad.right, pad.bottom, pad.left]);

  // Radar: Ausschnitt einmal auf den Umkreis um den Start
  /** Ort und Umkreis des Radars: gleich, solange sich Start und Radius nicht ändern; die Phase startet nur den Ring neu */
  const radarKey = radar ? `${radar.center[0].toFixed(4)}-${radar.center[1].toFixed(4)}-${Math.round(radar.radiusM)}` : '';
  const ringKey = radar ? `${radarKey}-${radar.phase}` : '';
  const [radarPt, setRadarPt] = useState<{ x: number; y: number; r: number; k: string } | null>(null);
  /** gilt nur für das aktuelle Radar */
  const ringAt = radarPt && radarPt.k === radarKey ? radarPt : null;
  /** Startpunkt und Radius in Bildpunkten messen; latDelta: sichtbare Höhe des Ausschnitts in Grad */
  const measureRadar = (latDelta: number) => {
    if (!radar || boxH <= 0) return;
    const k = radarKey;
    const rPx = radar.radiusM / ((latDelta * 111320) / boxH);
    void map.current
      ?.pointForCoordinate(ll(radar.center))
      .then((pt) => setRadarPt((cur) => (cur && cur.k === k && Math.abs(cur.x - pt.x) < 2 && Math.abs(cur.y - pt.y) < 2 && Math.abs(cur.r - rPx) < 2 ? cur : { x: pt.x, y: pt.y, r: rPx, k })))
      .catch(() => undefined);
  };
  useEffect(() => {
    if (!ready || !radar || boxH <= 0) return;
    // Ausschnitt so weit heraus, dass der ganze Umkreis über dem Blatt Platz hat (Koray 8.11.: Karte runterskalieren)
    const latDelta = ((radar.radiusM * 2.6) / 111320) * (boxH / Math.max(1, boxH - (mapPadding?.bottom ?? 0)));
    const lonDelta = latDelta / Math.max(0.2, Math.cos((radar.center[0] * Math.PI) / 180));
    const go = () => map.current?.animateToRegion({ latitude: radar.center[0], longitude: radar.center[1], latitudeDelta: latDelta, longitudeDelta: lonDelta }, 650);
    // Erst wenn das Blatt unten angekommen ist: ein neuer Kartenrand während der Fahrt bricht sie sonst ab
    const t1 = setTimeout(go, 450);
    // Falls die Karte kein Ende meldet, den Ring trotzdem starten
    const t2 = setTimeout(() => measureRadar(latDelta), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // radarKey fasst Mitte und Radius zusammen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, radarKey, boxH > 0]);

  // Ohne Linie: auf den Fokus Punkt springen (zum Beispiel erster Wegpunkt im Planer)
  const focusLat = focus?.[0];
  const focusLon = focus?.[1];
  useEffect(() => {
    // Während das Radar läuft, gehört die Kamera ihm; sonst holte dieser Sprung die Karte wieder heran (Koray 8.11.)
    if (!ready || !autoFit || followUser || radarKey || fitCoords.length >= 2 || focusLat == null || focusLon == null) return;
    map.current?.animateCamera(
      { center: { latitude: focusLat, longitude: focusLon }, zoom: 10, altitude: 60000, pitch: 0, heading: 0 },
      { duration: 600 },
    );
  }, [ready, autoFit, followUser, radarKey, fitCoords.length, focusLat, focusLon]);

  // Auf der Karte zeigen (Punkt Aktionen im Planer): zum Punkt fliegen, n wechselt je Aufruf
  const flyN = flyTo?.n;
  useEffect(() => {
    if (!ready || !flyTo) return;
    map.current?.animateCamera({ center: { latitude: flyTo.p[0], longitude: flyTo.p[1] }, zoom: 13, altitude: 9000, pitch: 0 }, { duration: 700 });
    // nur bei einem neuen Aufruf
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, flyN]);

  // Ohne Tour: auf die Gruppe einpassen (sobald Positionen da sind, einmal pro neuer Teilnehmerzahl)
  const groupPts = (others ?? []).map((o) => o.p);
  const groupKey = groupPts.length;
  useEffect(() => {
    if (!ready || followUser || fitCoords.length >= 2 || groupKey === 0) return;
    const pts = [...groupPts, ...(position ? [position] : [])].map(ll);
    if (pts.length === 1) map.current?.animateCamera({ center: pts[0], zoom: 13, altitude: 8000, pitch: 0, heading: 0 }, { duration: 600 });
    else map.current?.fitToCoordinates(pts, { edgePadding: pad, animated: true });
    // nur bei neuer Teilnehmerzahl neu einpassen, nicht bei jeder Bewegung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, followUser, fitCoords.length, groupKey]);

  // Zur gewählten Warnung springen und ihren Grund zeigen
  useEffect(() => {
    if (!ready || highlightIndex == null) return;
    const w = tour.warnungen[highlightIndex];
    if (!w) return;
    map.current?.animateCamera({ center: ll(w.mitte), zoom: 14, altitude: 4000, pitch: 0, heading: 0 }, { duration: 600 });
    const t = setTimeout(() => markers.current[highlightIndex]?.showCallout(), 650);
    return () => clearTimeout(t);
  }, [ready, highlightIndex, tour]);

  // Flüssige Bewegung: GPS kommt etwa einmal pro Sekunde. Dazwischen rechnen wir Punkt und Kamera
  // in jedem Frame weiter (linear zwischen den letzten beiden Positionen, kurz darüber hinaus
  // fortgeschrieben), statt jede Sekunde eine neue Kamera Animation mit Abbremsen zu starten.
  const [me] = useState(() => new AnimatedRegion({ latitude: position?.[0] ?? 0, longitude: position?.[1] ?? 0, latitudeDelta: 0, longitudeDelta: 0 }));
  const motion = useRef<{ from: LatLon; to: LatLon; hFrom: number; hTo: number; t0: number; dur: number } | null>(null);
  const shown = useRef<{ p: LatLon; h: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    const now = Date.now();
    const h = heading ?? shown.current?.h ?? 0;
    const prev = motion.current;
    const gap = prev ? now - prev.t0 : Infinity;
    // Start oder lange Pause: springen statt gleiten
    if (!prev || !shown.current || gap > 4000) {
      motion.current = { from: position, to: position, hFrom: h, hTo: h, t0: now, dur: 1000 };
      shown.current = { p: position, h };
      me.setValue({ latitude: position[0], longitude: position[1], latitudeDelta: 0, longitudeDelta: 0 });
      return;
    }
    motion.current = { from: shown.current.p, to: position, hFrom: shown.current.h, hTo: h, t0: now, dur: Math.min(1500, Math.max(400, gap)) };
  }, [position, heading, me]);

  // Im Hintergrund keine Kamera Befehle: requestAnimationFrame läuft in React Native dort weiter, und
  // 30 setCamera pro Sekunde blockierten den Hauptthread, bis iOS die App beim Zurückkehren beendete
  // (Absturz 8.11., Watchdog 0x8BADF00D an der Tankstelle)
  const active = useRef(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      active.current = st === 'active';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !position) return;
    let raf = 0;
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!active.current) return;
      // 30 Bilder pro Sekunde reichen und sparen Akku
      if (++frame % 2) return;
      const m = motion.current;
      if (!m) return;
      // bis 15 % über die letzte Position hinaus fortschreiben, damit es bis zur nächsten nicht stehen bleibt
      const k = Math.min(1.15, (Date.now() - m.t0) / m.dur);
      const p: LatLon = [m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k];
      const dh = ((m.hTo - m.hFrom + 540) % 360) - 180;
      const h = (m.hFrom + dh * Math.min(1, k) + 360) % 360;
      shown.current = { p, h };
      me.setValue({ latitude: p[0], longitude: p[1], latitudeDelta: 0, longitudeDelta: 0 });
      if (following) map.current?.setCamera({ center: ll(p), heading: h, pitch: 50, zoom: 17, altitude: 500 });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // position nur als Schalter (an oder aus), die Werte kommen über motion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, following, !!position, me]);

  // nach der Pause wieder folgen
  useEffect(() => {
    if (!paused) return;
    const t = setTimeout(() => setPaused(0), FOLLOW_PAUSE_MS);
    return () => clearTimeout(t);
  }, [paused]);

  return (
    <View style={[styles.box, style, !interactive && styles.noTouch]} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
      <MapView
        ref={map}
        mapPadding={mapPadding}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle="dark"
        mapType={MAP_TYPE[settings.style]}
        showsUserLocation={(showUser || followUser) && !position}
        followsUserLocation={followUser && !position}
        showsMyLocationButton={false}
        showsCompass={interactive && !followUser}
        showsPointsOfInterests={false}
        showsBuildings={followUser || settings.style === '3d'}
        showsTraffic={false}
        toolbarEnabled={false}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        onMapReady={() => setReady(true)}
        onPanDrag={followUser && position ? () => setPaused((n) => n + 1) : undefined}
        onRegionChangeComplete={(r) => {
          if (boxH > 0) setMpp((r.latitudeDelta * 111320) / boxH);
          // Radar: Startpunkt und Radius in Bildpunkten für den Ring über der Karte
          if (radar) measureRadar(r.latitudeDelta);
        }}
        onPress={onPressMap ? (e) => e.nativeEvent.action !== 'marker-press' && onPressMap() : undefined}
        onLongPress={
          onLongPress
            ? (e) => onLongPress([e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude])
            : undefined
        }>
        {tourLines.map((t) => (
          <Polyline key={`meine-${t.id}`} coordinates={t.p} strokeColor="rgba(244,244,242,0.45)" strokeWidth={2.5} lineCap="round" lineJoin="round" zIndex={0} />
        ))}
        {showDrives &&
          (drives ?? []).map((d) => (
            <Polyline key={`fahrt-${d.id}`} coordinates={d.p} strokeColor="rgba(76,195,138,0.7)" strokeWidth={2.5} lineCap="round" lineJoin="round" zIndex={0} />
          ))}
        {layers &&
          settings.passes &&
          PASSES.map((ps) => (
            <Marker
              // Zustand im Schlüssel: ohne tracksViewChanges zeichnet Apple Maps einen Marker sonst nicht neu
              key={`pass-${ps.id}-${pickedPassIds?.has(ps.id) ? 'drin' : 'frei'}`}
              coordinate={ll(passPoint(ps))}
              anchor={{ x: 0.5, y: 0.5 }}
              title={ps.name}
              description={`${ps.ele.toLocaleString('de-DE')} m`}
              zIndex={pickedPassIds?.has(ps.id) ? 12 : 10}
              ref={(m) => {
                passRefs.current.set(ps.id, m);
              }}
              onPress={
                onPressPass
                  ? () => {
                      onPressPass(ps);
                      setTimeout(() => passRefs.current.get(ps.id)?.hideCallout(), 0);
                    }
                  : undefined
              }
              tracksViewChanges={false}>
              <View
                style={[styles.passDot, { backgroundColor: TIER_DOT[ps.tier] }, pickedPassIds?.has(ps.id) && styles.passPicked]}
              />
            </Marker>
          ))}
        {weatherItems.length > 0 && <WeatherMarkers items={weatherItems} onPress={setWeatherOpen} />}
        {runs.map((r, i) => (
          <Polyline
            key={`rand-${r.key}-${i}`}
            coordinates={r.coords}
            strokeColor={Colors.ground}
            strokeWidth={CLASS_LINE[r.c].width + 3}
            lineCap="round"
            lineJoin="round"
            zIndex={CLASS_LINE[r.c].z}
          />
        ))}
        {runs.map((r, i) => (
          <Polyline
            key={`linie-${r.key}-${i}`}
            coordinates={r.coords}
            strokeColor={CLASS_LINE[r.c].color}
            strokeWidth={CLASS_LINE[r.c].width}
            lineCap="round"
            lineJoin="round"
            zIndex={CLASS_LINE[r.c].z + 1}
          />
        ))}

        {arrows.map((a, i) => (
          <Marker key={`pfeil-${offKey}-${i}-${a.p[0].toFixed(5)}`} coordinate={ll(a.p)} anchor={{ x: 0.5, y: 0.5 }} flat rotation={a.deg} zIndex={8} tracksViewChanges={false}>
            <View style={styles.arrow} />
          </Marker>
        ))}

        {/* Weg zurück zur Tour: durchgezogen in Gelb, gleich breit wie die Route (gestrichelt sah auf
            Apple Karten zerrissen aus, Entscheidung 6.11.), mit demselben dunklen Rand */}
        {dashed && dashed.length > 1 && (
          <Polyline
            key={`zurueck-rand-${dashed.length}-${dashed[0][0].toFixed(5)}`}
            coordinates={dashed.map(ll)}
            strokeColor={Colors.ground}
            strokeWidth={CLASS_LINE.ok.width + 3}
            lineCap="round"
            lineJoin="round"
            zIndex={29}
          />
        )}
        {dashed && dashed.length > 1 && (
          <Polyline
            key={`zurueck-${dashed.length}-${dashed[0][0].toFixed(5)}`}
            coordinates={dashed.map(ll)}
            strokeColor={Colors.warn}
            strokeWidth={CLASS_LINE.ok.width}
            lineCap="round"
            lineJoin="round"
            zIndex={30}
          />
        )}

        {ziel && !roundTrip && (
          <Marker coordinate={ll(ziel)} anchor={{ x: 0.5, y: 0.5 }} title="Ziel" zIndex={20}>
            <View style={styles.ziel}>
              <View style={styles.zielInner} />
            </View>
          </Marker>
        )}
        {start && (
          <Marker coordinate={ll(start)} anchor={{ x: 0.5, y: 0.5 }} title={roundTrip ? 'Start und Ziel' : 'Start'} zIndex={21}>
            <View style={styles.startHalo}>
              <View style={styles.start} />
            </View>
          </Marker>
        )}

        {warnings.map(({ w, index }) => (
          <Marker
            key={`w${index}`}
            ref={(m) => {
              markers.current[index] = m;
            }}
            coordinate={ll(w.mitte)}
            anchor={{ x: 0.5, y: 0.5 }}
            title={w.name || (w.klasse === 'raus' ? 'Gesperrt' : 'Prüfen')}
            description={w.gruende.length ? w.gruende.join(', ') : undefined}
            onPress={() => onPressWarning?.(index)}
            zIndex={30}>
            <View
              style={[
                styles.warn,
                { backgroundColor: CLASS_LINE[w.klasse].color },
                highlightIndex === index && styles.warnOn,
              ]}>
              <AppText style={styles.warnText}>!</AppText>
            </View>
          </Marker>
        ))}

        {(pins ?? []).map((pin) => (
          <Marker key={pin.id} coordinate={ll(pin.p)} anchor={{ x: 0.5, y: 1 }} title={pin.title} zIndex={35} tracksViewChanges={false}>
            <View style={styles.pin}>
              <AppText style={styles.pinText}>{pin.label}</AppText>
            </View>
          </Marker>
        ))}

        {(others ?? []).map((o) => (
          <Marker key={`${o.id}${o.off ? '-ab' : ''}`} coordinate={ll(o.p)} anchor={{ x: 0.5, y: 0.5 }} title={o.name} description={`${{ lead: 'Lead', schluss: 'Schlusslicht', mitfahrer: 'Mitfahrer' }[o.role]}${o.off ? ', abseits der Tour' : ''}`} zIndex={30} tracksViewChanges={false}>
            <View style={[styles.other, { borderColor: o.off ? Colors.warn : ROLE_COLOR[o.role] }, o.off && styles.otherOff, o.stale && styles.otherStale]}>
              <AppText style={styles.otherText}>{o.name.slice(0, 1).toUpperCase()}</AppText>
            </View>
          </Marker>
        ))}

        {position && !following && (
          <MeMarker coordinate={me as unknown as LatLng} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading ?? 0} zIndex={40} tracksViewChanges={false}>
            {carSymbol ? (
              <CarTopView symbol={carSymbol} width={CAR_W} />
            ) : (
              <View style={styles.me}>
                <View style={styles.meArrow} />
              </View>
            )}
          </MeMarker>
        )}
        {radar && ringAt && fitCoords.length < 2 && <RadarRoads key={ringKey} radiusM={radar.radiusM} roads={radar.roads} line={radar.line} fast={radar.phase === 'aufloesen'} />}
      </MapView>
      {radar && ringAt && fitCoords.length < 2 && <RadarRing key={ringKey} x={ringAt.x} y={ringAt.y} r={ringAt.r} fast={radar.phase === 'aufloesen'} />}

      {/* Beim Mitfahren steht der eigene Punkt fest in der Kartenmitte; die Kamera bewegt sich bildweise darunter.
          So ruckelt er nicht wie ein Marker, dessen Position jede Sekunde neu gesetzt wird. */}
      {position && following && (
        <View
          pointerEvents="none"
          style={[
            styles.meOverlay,
            {
              top: mapPadding?.top ?? 0,
              bottom: mapPadding?.bottom ?? 0,
              left: mapPadding?.left ?? 0,
              right: mapPadding?.right ?? 0,
            },
          ]}>
          {carSymbol ? (
            <CarTopView symbol={carSymbol} width={CAR_W} />
          ) : (
            <View style={styles.me}>
              <View style={styles.meArrow} />
            </View>
          )}
        </View>
      )}

      <WeatherSheet item={weatherOpen} onClose={() => setWeatherOpen(null)} />

      {followUser && position && !following && (
        <Pressable accessibilityRole="button" onPress={() => setPaused(0)} style={styles.recenter}>
          <AppText style={styles.recenterText}>Zentrieren</AppText>
        </Pressable>
      )}
    </View>
  );
}

type MapMarker = InstanceType<typeof Marker>;
/** Marker mit animierter Position (Typen von react-native-maps kennen die Kinder nicht). */
const MeMarker = Marker.Animated as unknown as ComponentType<ComponentProps<typeof Marker>>;

/** Breite der Draufsicht in pt, etwa so groß wie der bisherige Punkt (34) */
const CAR_W = 24;

const styles = StyleSheet.create({
  radarRing: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(226,70,28,0.9)', backgroundColor: 'rgba(226,70,28,0.1)' },
  box: { backgroundColor: Colors.surface, overflow: 'hidden' },
  noTouch: { pointerEvents: 'none' },
  start: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.signal, borderWidth: 2, borderColor: Colors.ground },
  startHalo: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(226,70,28,0.3)', alignItems: 'center', justifyContent: 'center' },
  ziel: { width: 18, height: 18, borderRadius: 4, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.ground },
  zielInner: { width: 6, height: 6, backgroundColor: Colors.ground },
  warn: { width: 24, height: 24, borderRadius: Radius.s, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.ground },
  warnOn: { transform: [{ scale: 1.3 }], borderColor: Colors.text },
  warnText: { fontFamily: Fonts.display, fontSize: Type.small, lineHeight: 16, color: Colors.ground },
  meOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  me: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.signal },
  meArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.signal,
    marginTop: -3,
  },
  // kleiner Pfeil (Dreieck nach oben, die Drehung gibt die Fahrtrichtung)
  arrow: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: Colors.ground },
  passDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.ground },
  passPicked: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: Colors.signal },
  pin: { paddingHorizontal: Spacing.s, height: 26, borderRadius: 13, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.signal, justifyContent: 'center' },
  pinText: { fontFamily: Fonts.bold, fontSize: 12, color: Colors.text },
  other: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surface, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  otherStale: { opacity: 0.45 },
  otherOff: { borderStyle: 'dashed' },
  otherText: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.text },
  recenter: {
    position: 'absolute',
    right: 16,
    top: '45%',
    height: 40,
    paddingHorizontal: Spacing.l,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
  },
  recenterText: { fontFamily: Fonts.semibold, fontSize: Type.small },
});

/**
 * Strecken im Umkreis leuchten auf, sobald der erste Ring sie erreicht (Ladescreen Konzept C).
 * Zehn Schritte je Sekunde, nur solange der erste Ring läuft.
 */
function RadarRoads({ radiusM, roads, line, fast }: { radiusM: number; roads: RadarRoad[]; line?: LatLon[]; fast: boolean }) {
  const [t, setT] = useState(0);
  const ringMs = fast ? RADAR_FAST_MS : RADAR_MS;
  // Linie der fertigen Route: zeichnet sich vom Start aus, sobald der Ring die meisten Stücke gefunden hat
  const lineFrom = ringMs * 0.55;
  const lineMs = REVEAL_MS - lineFrom - 200;
  const endMs = line ? lineFrom + lineMs : ringMs;
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const d = Date.now() - t0;
      setT(d);
      if (d > endMs) clearInterval(id);
    }, line ? 40 : 100);
    return () => clearInterval(id);
  }, [endMs, line]);
  const reach = (1 - Math.pow(1 - Math.min(1, t / ringMs), 3)) * radiusM;
  // beim Auflösen alle Stücke innerhalb des Rings finden, auch wenn die Route etwas über den Umkreis hinausgeht
  const far = fast ? Math.max(radiusM, ...roads.map((r) => r.distM)) : radiusM;
  const scale = radiusM / far;
  const drawn = line ? Math.max(0, Math.min(1, (t - lineFrom) / lineMs)) : 0;
  const shown = useMemo(() => (line ? line.filter((_, i) => i % Math.max(1, Math.round(line.length / 600)) === 0).map(ll) : []), [line]);
  const part = drawn > 0 ? shown.slice(0, Math.max(2, Math.round(shown.length * (1 - Math.pow(1 - drawn, 2))))) : [];
  return (
    <>
      {part.length > 1 && <Polyline key="radar-route" coordinates={part} strokeColor={Colors.text} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={3} />}
      {roads.map((r) => {
        const lit = Math.max(0, Math.min(1, (reach - r.distM * scale) / (radiusM * 0.08)));
        if (lit <= 0) return null;
        return (
          <Polyline
            key={`radar-${r.id}`}
            coordinates={r.line.map(ll)}
            strokeColor={`rgba(226,70,28,${(0.9 * lit).toFixed(2)})`}
            strokeWidth={drawn > 0 ? 7 : 4}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        );
      })}
    </>
  );
}

/** Ring über der Karte, auf dem UI Thread: der erste läuft kräftig bis an den Rand, danach leiser in Schleife */
function RadarRing({ x, y, r, fast }: { x: number; y: number; r: number; fast: boolean }) {
  const p = useSharedValue(0);
  const loud = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      p.set(1);
      loud.set(0.5);
      return;
    }
    const ease = Easing.out(Easing.cubic);
    p.set(withSequence(
      withTiming(1, { duration: fast ? RADAR_FAST_MS : RADAR_MS, easing: ease }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: RADAR_REPEAT_MS, easing: ease })), -1, false),
    ));
    loud.set(withDelay(fast ? RADAR_FAST_MS : RADAR_MS, withTiming(0.55, { duration: 0 })));
    return () => {
      cancelAnimation(p);
      cancelAnimation(loud);
    };
  }, [p, loud, reduced, fast]);
  const style = useAnimatedStyle(() => {
    const v = p.get();
    return { opacity: loud.get() * (1 - v * 0.75), transform: [{ scale: Math.max(0.001, v) }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.radarRing, { left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: r }, style]}
    />
  );
}
