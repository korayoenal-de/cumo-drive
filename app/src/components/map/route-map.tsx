/**
 * Karte mit einer Tour. Heute react-native-maps (auf dem iPhone Apple Maps, läuft in Expo Go).
 * Später mit eigenem App Build MapLibre: dann wird nur diese Datei ersetzt, die Props bleiben.
 */
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { AnimatedRegion, Marker, Polyline, type LatLng } from 'react-native-maps';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { listDriveTracks } from '@/lib/drives';
import { useLibrary } from '@/lib/library';
import { useMapSettings, type MapStyle } from '@/lib/map-settings';
import { passPoint, PASSES } from '@/lib/passes';
import type { CheckClass, LatLon } from '@/lib/tour';

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
  dashed,
  layers = false,
  onPressPass,
  onPressMap,
  pickedPassIds,
}: RouteMapProps) {
  const settings = useMapSettings();
  const library = useLibrary();
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
  const [ready, setReady] = useState(false);
  // nach eigenem Verschieben folgt die Kamera eine Weile nicht
  const [paused, setPaused] = useState(0);
  const following = followUser && !!position && paused === 0;

  const runs = useMemo(() => {
    // ok zuerst, damit Warnstellen oben liegen
    const order: CheckClass[] = ['ok', 'pruefen', 'raus'];
    return order.flatMap((c) =>
      tour.linie
        .filter((r) => r.c === c && r.p.length > 1)
        // Schlüssel aus dem Inhalt: Apple Maps verliert beim Ändern der Punkte einer bestehenden Linie
        // manchmal die Farbe (Linie wird schwarz). Mit neuem Schlüssel wird sie neu angelegt.
        .map((r) => ({ c, coords: r.p.map(ll), key: `${c}-${r.p.length}-${r.p[0][0].toFixed(5)}-${r.p[r.p.length - 1][1].toFixed(5)}` })),
    );
  }, [tour]);

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
    if (!ready || followUser || highlightIndex != null || fitCoords.length < 2) return;
    map.current?.fitToCoordinates(fitCoords, { edgePadding: pad, animated: true });
    // pad ist ein Objekt, die Werte reichen als Abhängigkeit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, followUser, highlightIndex, fitCoords, pad.top, pad.right, pad.bottom, pad.left]);

  // Ohne Linie: auf den Fokus Punkt springen (zum Beispiel erster Wegpunkt im Planer)
  const focusLat = focus?.[0];
  const focusLon = focus?.[1];
  useEffect(() => {
    if (!ready || followUser || fitCoords.length >= 2 || focusLat == null || focusLon == null) return;
    map.current?.animateCamera(
      { center: { latitude: focusLat, longitude: focusLon }, zoom: 10, altitude: 60000, pitch: 0, heading: 0 },
      { duration: 600 },
    );
  }, [ready, followUser, fitCoords.length, focusLat, focusLon]);

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

  useEffect(() => {
    if (!ready || !position) return;
    let raf = 0;
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
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
    <View style={[styles.box, style, !interactive && styles.noTouch]}>
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
              onPress={onPressPass ? () => onPressPass(ps) : undefined}
              tracksViewChanges={false}>
              <View
                style={[styles.passDot, { backgroundColor: TIER_DOT[ps.tier] }, pickedPassIds?.has(ps.id) && styles.passPicked]}
              />
            </Marker>
          ))}
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

        {dashed && dashed.length > 1 && (
          <Polyline
            key={`zurueck-${dashed.length}-${dashed[0][0].toFixed(5)}`}
            coordinates={dashed.map(ll)}
            strokeColor={Colors.warn}
            strokeWidth={3}
            lineDashPattern={[6, 7]}
            lineCap="butt"
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
            <View style={styles.me}>
              <View style={styles.meArrow} />
            </View>
          </MeMarker>
        )}
      </MapView>

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
          <View style={styles.me}>
            <View style={styles.meArrow} />
          </View>
        </View>
      )}

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

const styles = StyleSheet.create({
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
