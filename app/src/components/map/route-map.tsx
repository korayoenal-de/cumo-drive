/**
 * Karte mit einer Tour. Heute react-native-maps (auf dem iPhone Apple Maps, läuft in Expo Go).
 * Später mit eigenem App Build MapLibre: dann wird nur diese Datei ersetzt, die Props bleiben.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import MapView, { AnimatedRegion, Circle, Marker, Polyline, type LatLng } from 'react-native-maps';

import { useIsFocused } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { arrowsAlong, offsetRight, splitDoubled } from '@/lib/doubled';
import { listDriveTracks } from '@/lib/drives';
import { useLibrary } from '@/lib/library';
import { useMapSettings, type MapStyle } from '@/lib/map-settings';
import { passPoint, PASSES } from '@/lib/passes';
import { RADAR_FAST_MS, RADAR_MS, RADAR_REPEAT_MS, REVEAL_MS, SCAN_MS, type RadarRoad, type RadarSpot, type Scan } from '@/lib/radar';
import { haversine, trimDecimals, type CheckClass, type LatLon } from '@/lib/tour';
import { CarSprite, carLookFor, frameFor, TOP_FRAME } from '@/components/map/car-sprite';
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
  overview = 0,
  onOverviewEnd,
  dashed,
  layers = false,
  onPressPass,
  onPressMap,
  pickedPassIds,
  flyTo,
  radar,
  scan,
}: RouteMapProps) {
  const settings = useMapSettings();
  // Eigenes Auto statt Pfeil, wenn in der Garage eingeschaltet
  const carLook = carLookFor(useVehicles().current);
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
  const focused = useIsFocused();
  // Offener Warnhinweis als eigene Karte über der Karte: bleibt stehen, bis man daneben tippt
  // (Tester 8.11.: die Apple Blase verschwand sofort wieder)
  const [openWarn, setOpenWarn] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  // nach eigenem Verschieben folgt die Kamera eine Weile nicht
  const [paused, setPaused] = useState(0);
  // während der Übersicht (Planung ansehen) nicht folgen; die Navigation setzt overview danach auf 0
  const following = followUser && !!position && paused === 0 && !overview;

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
              return { c, coords: part.doubled && offM ? p.map(ll) : llCached(p), key: k(c, part.p, part.doubled ? `d${offKey}` : 'e'), doubled: part.doubled };
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

  // Pässe auf der Karte: ohne "Alle Pässe zeigen" nur bis 50 km um Route, Start, Zwischenziele und Ziel,
  // ohne Punkte um den eigenen Standort (Koray 9.11.: die ganzen Alpenpässe waren zu viel)
  const posLat = position ? Math.round(position[0] * 20) / 20 : null;
  const posLon = position ? Math.round(position[1] * 20) / 20 : null;
  const shownPasses = useMemo(() => {
    if (!layers || !settings.passes) return [];
    if (settings.passesAll) return PASSES;
    const ref: LatLon[] = [...tour.wegpunkte, ...sampleLine(tour, 400)];
    // Luftlinie zwischen den Punkten, solange noch keine Route steht
    if (tour.linie.length === 0)
      for (let i = 1; i < tour.wegpunkte.length; i++) {
        const a = tour.wegpunkte[i - 1];
        const b = tour.wegpunkte[i];
        const n = Math.ceil(haversine(a, b) / 20000);
        for (let k = 1; k < n; k++) ref.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
      }
    if (!ref.length && posLat != null && posLon != null) ref.push([posLat, posLon]);
    if (!ref.length) return [];
    return PASSES.filter((ps) => {
      const p = passPoint(ps);
      return ref.some((q) => Math.abs(q[0] - p[0]) < 0.5 && haversine(q, p) <= 50000);
    });
  }, [layers, settings.passes, settings.passesAll, tour, posLat, posLon]);

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
    if (!ready || !autoFit || followUser || radarKey || scan || fitCoords.length >= 2 || focusLat == null || focusLon == null) return;
    map.current?.animateCamera(
      { center: { latitude: focusLat, longitude: focusLon }, zoom: 10, altitude: 60000, pitch: 0, heading: 0 },
      { duration: 600 },
    );
  }, [ready, autoFit, followUser, radarKey, scan, fitCoords.length, focusLat, focusLon]);

  // Scan beim ersten Planen: ganze Strecke von Start bis Ziel zeigen, nicht nur das Ziel (Koray 9.11.).
  // Erst wenn das Blatt eingeklappt ist (mapPadding unten ändert sich), dann sitzt der Ausschnitt richtig.
  const scanKey = scan ? scan.pts.map((p) => p.join(',')).join(';') : '';
  useEffect(() => {
    if (!ready || !scan || scan.pts.length < 2) return;
    const t = setTimeout(() => map.current?.fitToCoordinates(scan.pts.map(ll), { edgePadding: { top: pad.top + 30, right: pad.right + 30, bottom: pad.bottom + 30, left: pad.left + 30 }, animated: true }), 280);
    return () => clearTimeout(t);
    // scanKey fasst die Punkte zusammen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scanKey, mapPadding?.bottom]);

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
    const t = setTimeout(() => setOpenWarn(highlightIndex), 650);
    return () => clearTimeout(t);
  }, [ready, highlightIndex, tour]);

  // Flüssige Bewegung: GPS kommt etwa einmal pro Sekunde. Dazwischen rechnen wir Punkt und Kamera
  // in jedem Frame weiter (linear zwischen den letzten beiden Positionen, kurz darüber hinaus
  // fortgeschrieben), statt jede Sekunde eine neue Kamera Animation mit Abbremsen zu starten.
  const [me] = useState(() => new AnimatedRegion({ latitude: position?.[0] ?? 0, longitude: position?.[1] ?? 0, latitudeDelta: 0, longitudeDelta: 0 }));
  // Fortschreiben mit Geschwindigkeit statt von Punkt zu Punkt (Koray 9.11.: das Auto machte alle paar Meter eine
  // Pause, weil eine Bewegung von 1,15 s fertig war, bevor die nächste Position kam). Angezeigt wird die letzte
  // Position plus Geschwindigkeit mal Zeit seither; der Sprung bei einer neuen Position klingt in 0,5 s aus.
  const motion = useRef<{ p: LatLon; t: number; v: [number, number]; err: [number, number]; hFrom: number; hTo: number } | null>(null);
  const shown = useRef<{ p: LatLon; h: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    const now = Date.now();
    const h = heading ?? shown.current?.h ?? 0;
    const prev = motion.current;
    const gap = prev ? now - prev.t : Infinity;
    // Start oder lange Pause: springen statt gleiten
    if (!prev || !shown.current || gap > 4000) {
      motion.current = { p: position, t: now, v: [0, 0], err: [0, 0], hFrom: h, hTo: h };
      shown.current = { p: position, h };
      me.setValue({ latitude: position[0], longitude: position[1], latitudeDelta: 0, longitudeDelta: 0 });
      return;
    }
    // Geschwindigkeit in Grad je ms, leicht geglättet
    const vNew: [number, number] = [(position[0] - prev.p[0]) / gap, (position[1] - prev.p[1]) / gap];
    const v: [number, number] = [prev.v[0] * 0.35 + vNew[0] * 0.65, prev.v[1] * 0.35 + vNew[1] * 0.65];
    const err: [number, number] = [shown.current.p[0] - position[0], shown.current.p[1] - position[1]];
    motion.current = { p: position, t: now, v, err, hFrom: shown.current.h, hTo: h };
  }, [position, heading, me]);

  // Im Hintergrund keine Kamera Befehle: requestAnimationFrame läuft in React Native dort weiter, und
  // 30 setCamera pro Sekunde blockierten den Hauptthread, bis iOS die App beim Zurückkehren beendete
  // (Absturz 8.11., Watchdog 0x8BADF00D an der Tankstelle)
  const active = useRef(AppState.currentState === 'active');
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      active.current = st === 'active';
      setAppActive(st === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Im Hintergrund oder auf einem anderen Tab läuft keine Schleife (Akku, Testfahrt 8.11.)
    if (!ready || !position || !appActive || !focused) return;
    let raf = 0;
    let frame = 0;
    let lastM: typeof motion.current = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!active.current) return;
      // 20 Bilder pro Sekunde reichen für ein Auto und sparen Akku
      if (++frame % 3) return;
      const m = motion.current;
      if (!m) return;
      const dt = Date.now() - m.t;
      // höchstens 2,5 s fortschreiben (Tunnel, GPS weg), danach stehen bleiben
      const run = Math.min(dt, 2500);
      const fade = Math.exp(-dt / 180);
      if (m === lastM && dt > 3200) return;
      lastM = m;
      const p: LatLon = [m.p[0] + m.v[0] * run + m.err[0] * fade, m.p[1] + m.v[1] * run + m.err[1] * fade];
      const dh = ((m.hTo - m.hFrom + 540) % 360) - 180;
      const h = (m.hFrom + dh * Math.min(1, dt / 600) + 360) % 360;
      shown.current = { p, h };
      me.setValue({ latitude: p[0], longitude: p[1], latitudeDelta: 0, longitudeDelta: 0 });
      if (following) map.current?.setCamera({ center: ll(p), heading: h, pitch: 50, zoom: 17, altitude: 500 });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // position nur als Schalter (an oder aus), die Werte kommen über motion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, following, !!position, me, appActive, focused]);

  // Planung ansehen: Folgen kurz aussetzen und die ganze Linie zeigen
  useEffect(() => {
    if (!overview || !ready) return;
    const t = setTimeout(() => map.current?.fitToCoordinates(fitCoords, { edgePadding: pad, animated: true }), 60);
    return () => clearTimeout(t);
    // nur beim Auslösen, nicht bei jeder neuen Linie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, ready]);

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
        // Apple Karten hält für den blauen Punkt das GPS an; auf anderen Tabs nicht nötig (Akku)
        showsUserLocation={(showUser || followUser) && !position && focused && appActive}
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
        onPress={(e) => {
          if (e.nativeEvent.action === 'marker-press') return;
          setOpenWarn(null);
          onPressMap?.();
        }}
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
          shownPasses.map((ps) => (
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
            accessibilityLabel={w.name || (w.klasse === 'raus' ? 'Gesperrt' : 'Prüfen')}
            onPress={() => {
              setOpenWarn(index);
              onPressWarning?.(index);
            }}
            zIndex={30}>
            <View
              style={[
                styles.warn,
                { backgroundColor: CLASS_LINE[w.klasse].color },
                (highlightIndex === index || openWarn === index) && styles.warnOn,
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
            {carLook ? (
              <CarSprite look={carLook} frame={TOP_FRAME} size={CAR_TOP} />
            ) : (
              <View style={styles.me}>
                <View style={styles.meArrow} />
              </View>
            )}
          </MeMarker>
        )}
        {scan && <CorridorScan key={scan.pts.map((p) => p.join(',')).join(';')} scan={scan} />}
        {radar && ringAt && fitCoords.length < 2 && <RadarRoads key={ringKey} radiusM={radar.radiusM} roads={radar.roads} spots={radar.spots} line={radar.line} fast={radar.phase === 'aufloesen'} />}
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
          {carLook ? (
            // Kamera folgt der Fahrtrichtung: das Auto zeigt sich schräg von hinten, wie bei Google (Koray 9.11.)
            <CarSprite look={carLook} frame={frameFor(0)} size={CAR_3D} />
          ) : (
            <View style={styles.me}>
              <View style={styles.meArrow} />
            </View>
          )}
        </View>
      )}

      {openWarn != null && tour.warnungen[openWarn] && (
        <WarnCard
          key={openWarn}
          // nie unter der Dynamic Island: mindestens der sichere Rand oben (Tester 8.11.)
          top={Math.max(mapPadding?.top ?? 0, insets.top) + Spacing.m}
          klasse={tour.warnungen[openWarn].klasse}
          name={tour.warnungen[openWarn].name}
          reasons={tour.warnungen[openWarn].gruende}
          onClose={() => setOpenWarn(null)}
        />
      )}

      <WeatherSheet item={weatherOpen} onClose={() => setWeatherOpen(null)} />

      {followUser && position && !following && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPaused(0);
            onOverviewEnd?.();
          }}
          style={styles.recenter}>
          <AppText style={styles.recenterText}>Zentrieren</AppText>
        </Pressable>
      )}
    </View>
  );
}

/** Warnhinweis als ruhige Karte oben über der Karte, mit Feder eingeblendet */
function WarnCard({ top, klasse, name, reasons, onClose }: { top: number; klasse: CheckClass; name?: string; reasons: string[]; onClose: () => void }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    v.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [v]);
  const anim = useAnimatedStyle(() => ({ opacity: v.get(), transform: [{ translateY: (1 - v.get()) * -8 }] }));
  const title = klasse === 'raus' ? 'Gesperrt' : 'Prüfen';
  return (
    <Animated.View style={[styles.warnCard, { top }, anim]} accessibilityLiveRegion="polite">
      <View style={[styles.warnCardDot, { backgroundColor: CLASS_LINE[klasse].color }]}>
        <AppText style={styles.warnText}>!</AppText>
      </View>
      <View style={styles.warnCardBody}>
        <AppText style={styles.warnCardTitle}>{name ? `${title}: ${name}` : title}</AppText>
        {reasons.length > 0 && <AppText style={styles.warnCardText}>{reasons.map(trimDecimals).join(', ')}</AppText>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Hinweis schließen" hitSlop={12} onPress={onClose} style={styles.warnCardClose}>
        <SymbolView name="xmark" size={14} weight="semibold" tintColor={Colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Gleiche Linie, gleiches Koordinaten Array: dann schickt React Native die Punkte nicht erneut an die Karte
 * (Akku in der Navigation, 8.11.)
 */
const llCache = new WeakMap<LatLon[], { latitude: number; longitude: number }[]>();
function llCached(p: LatLon[]) {
  let c = llCache.get(p);
  if (!c) {
    c = p.map(ll);
    llCache.set(p, c);
  }
  return c;
}

type MapMarker = InstanceType<typeof Marker>;
/** Marker mit animierter Position (Typen von react-native-maps kennen die Kinder nicht). */
const MeMarker = Marker.Animated as unknown as ComponentType<ComponentProps<typeof Marker>>;

/** Breite der Draufsicht in pt, etwa so groß wie der bisherige Punkt (34) */
/** Kartensymbol: Draufsicht auf der flachen Karte, Ansicht von hinten beim Mitfahren (Bildgröße, das Auto füllt etwa drei Viertel) */
const CAR_TOP = 64;
const CAR_3D = 76;

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
  warnCard: {
    position: 'absolute',
    left: Spacing.l,
    right: Spacing.l + 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.m,
    padding: Spacing.m,
    borderRadius: Radius.l,
    backgroundColor: Colors.overlaySurface,
  },
  warnCardDot: { width: 24, height: 24, borderRadius: Radius.s, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  warnCardBody: { flex: 1, gap: 2 },
  warnCardTitle: { fontFamily: Fonts.bold, fontSize: Type.body, color: Colors.text },
  warnCardText: { fontSize: Type.body, color: Colors.muted },
  warnCardClose: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  warnText: { fontFamily: Fonts.bold, fontSize: Type.caption, lineHeight: 16, color: Colors.ground },
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
  pinText: { fontFamily: Fonts.bold, fontSize: Type.caption, color: Colors.text },
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
function RadarRoads({ radiusM, roads, spots, line, fast }: { radiusM: number; roads: RadarRoad[]; spots?: RadarSpot[]; line?: LatLon[]; fast: boolean }) {
  const [t, setT] = useState(0);
  const ringMs = fast ? RADAR_FAST_MS : RADAR_MS;
  // Linie der fertigen Route: zeichnet sich vom Start aus, sobald der Ring die meisten Stücke gefunden hat
  const lineFrom = ringMs * 0.55;
  const lineMs = REVEAL_MS - lineFrom - 200;
  // Punkte der bevorzugten Strecken über zwei Ringe verteilt, damit sie nach und nach auftauchen
  const spotMs = RADAR_MS + RADAR_REPEAT_MS;
  const endMs = line ? lineFrom + lineMs : spots?.length ? spotMs : ringMs;
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
      {/* Bevorzugte Strecken als Punkte: tauchen auf, sobald der Ring sie erreicht; beim Auflösen treten sie zurück */}
      {(spots ?? []).map((s) => {
        const lit = fast ? 0.35 : Math.max(0, Math.min(1, ((t / spotMs) * radiusM - s.distM) / (radiusM * 0.06)));
        if (lit <= 0) return null;
        return (
          <Circle
            key={`spot-${s.id}`}
            center={ll(s.p)}
            radius={radiusM * (0.014 + 0.006 * lit)}
            fillColor={`rgba(226,70,28,${(0.85 * lit).toFixed(2)})`}
            strokeColor={`rgba(11,11,12,${(0.6 * lit).toFixed(2)})`}
            strokeWidth={1}
            zIndex={1}
          />
        );
      })}
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

/**
 * Scan beim ersten Planen einer Tour (Koray 9.11.): eine Linie läuft vom Start über die Zwischenziele zum Ziel,
 * Highlights leuchten als Strecke auf, bevorzugte Strecken als kleine Punkte, sobald die Linie bei ihnen ist.
 */
function CorridorScan({ scan }: { scan: Scan }) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  useEffect(() => {
    const t0 = Date.now() - (reduced ? SCAN_MS : 0);
    const id = setInterval(() => {
      const d = Date.now() - t0;
      setT(d);
      if (d > SCAN_MS + 400) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [reduced]);
  const k = 1 - Math.pow(1 - Math.min(1, t / SCAN_MS), 2);
  // Luftlinie in feinen Schritten, damit der Kopf gleichmäßig läuft
  const steps = useMemo(() => {
    const out: LatLon[] = [];
    for (let i = 1; i < scan.pts.length; i++) {
      const a = scan.pts[i - 1];
      const b = scan.pts[i];
      for (let j = 0; j < 40; j++) out.push([a[0] + ((b[0] - a[0]) * j) / 40, a[1] + ((b[1] - a[1]) * j) / 40]);
    }
    out.push(scan.pts[scan.pts.length - 1]);
    return out;
  }, [scan.pts]);
  const lenM = useMemo(() => steps.reduce((s, p, i) => (i ? s + haversine(steps[i - 1], p) : 0), 0), [steps]);
  const head = steps.slice(0, Math.max(2, Math.round(steps.length * k)));
  const ticks = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ frac: (i + 0.5) / 18, p: steps[Math.min(steps.length - 1, Math.round(((i + 0.5) / 18) * (steps.length - 1)))] })), [steps]);
  return (
    <>
      <Polyline coordinates={head.map(ll)} strokeColor="rgba(226,70,28,0.5)" strokeWidth={2} lineCap="round" zIndex={1} />
      {/* Geprüfte Abschnitte als feine Punkte auf der Linie, damit man sieht, wie weit der Scan ist (Koray 9.11.) */}
      {ticks.map((t, i) =>
        k >= t.frac ? <Circle key={`tick-${i}`} center={ll(t.p)} radius={Math.max(60, lenM * 0.001)} fillColor="rgba(226,70,28,0.55)" strokeWidth={0} zIndex={1} /> : null,
      )}
      {k < 1 && <Circle key="scan-head" center={ll(head[head.length - 1])} radius={Math.max(150, lenM * 0.004)} fillColor="rgba(244,244,242,0.9)" strokeColor="rgba(226,70,28,0.9)" strokeWidth={2} zIndex={3} />}
      {scan.spots.map((s) => {
        const lit = Math.max(0, Math.min(1, (k - s.frac) / 0.06));
        if (lit <= 0) return null;
        // Alles als kleine Punkte auf der Strecke (Koray 9.11.), Highlights etwas größer und hell gerandet
        const hi = s.kind === 'highlight';
        return (
          <Circle
            key={`scan-${s.id}`}
            center={ll(s.p)}
            radius={Math.max(150, lenM * (hi ? 0.0055 : 0.0038) * (0.7 + 0.3 * lit))}
            fillColor={`rgba(226,70,28,${(0.9 * lit).toFixed(2)})`}
            strokeColor={hi ? `rgba(244,244,242,${(0.95 * lit).toFixed(2)})` : `rgba(244,244,242,${(0.45 * lit).toFixed(2)})`}
            strokeWidth={1}
            zIndex={1}
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
