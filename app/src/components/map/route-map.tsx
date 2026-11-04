/**
 * Karte mit einer Tour. Heute react-native-maps (auf dem iPhone Apple Maps, läuft in Expo Go).
 * Später mit eigenem App Build MapLibre: dann wird nur diese Datei ersetzt, die Props bleiben.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';

import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius } from '@/constants/theme';
import type { CheckClass, LatLon } from '@/lib/tour';

import { CLASS_LINE, ROLE_COLOR, sampleLine, tourWarnings, type RouteMapProps } from './route-map-shared';

export type { RouteMapProps } from './route-map-shared';

const EDGE = { top: 60, right: 40, bottom: 60, left: 40 };
/** Nach dem Verschieben bleibt die Kamera so lange stehen, bevor sie wieder folgt. */
const FOLLOW_PAUSE_MS = 10000;

const ll = ([latitude, longitude]: LatLon): LatLng => ({ latitude, longitude });

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
  others,
}: RouteMapProps) {
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
        .map((r) => ({ c, coords: r.p.map(ll) })),
    );
  }, [tour]);

  const fitCoords = useMemo(() => sampleLine(tour, 300).map(ll), [tour]);
  const warnings = useMemo(() => tourWarnings(tour), [tour]);
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

  // Kamera folgt der Position mit Blickrichtung und etwas Neigung
  useEffect(() => {
    if (!ready || !following || !position) return;
    map.current?.animateCamera(
      { center: ll(position), heading: heading ?? 0, pitch: 50, zoom: 17, altitude: 500 },
      { duration: 900 },
    );
  }, [ready, following, position, heading]);

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
        style={StyleSheet.absoluteFill}
        userInterfaceStyle="dark"
        mapType="mutedStandard"
        showsUserLocation={(showUser || followUser) && !position}
        followsUserLocation={followUser && !position}
        showsMyLocationButton={false}
        showsCompass={interactive && !followUser}
        showsPointsOfInterests={false}
        showsBuildings={followUser}
        showsTraffic={false}
        toolbarEnabled={false}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        onMapReady={() => setReady(true)}
        onPanDrag={followUser && position ? () => setPaused((n) => n + 1) : undefined}>
        {runs.map((r, i) => (
          <Polyline
            key={`rand${i}`}
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
            key={`linie${i}`}
            coordinates={r.coords}
            strokeColor={CLASS_LINE[r.c].color}
            strokeWidth={CLASS_LINE[r.c].width}
            lineCap="round"
            lineJoin="round"
            zIndex={CLASS_LINE[r.c].z + 1}
          />
        ))}

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

        {(others ?? []).map((o) => (
          <Marker key={o.id} coordinate={ll(o.p)} anchor={{ x: 0.5, y: 0.5 }} title={o.name} description={{ lead: 'Lead', schluss: 'Schlusslicht', mitfahrer: 'Mitfahrer' }[o.role]} zIndex={30} tracksViewChanges={false}>
            <View style={[styles.other, { borderColor: ROLE_COLOR[o.role] }, o.stale && styles.otherStale]}>
              <AppText style={styles.otherText}>{o.name.slice(0, 1).toUpperCase()}</AppText>
            </View>
          </Marker>
        ))}

        {position && (
          <Marker coordinate={ll(position)} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading ?? 0} zIndex={40}>
            <View style={styles.me}>
              <View style={styles.meArrow} />
            </View>
          </Marker>
        )}
      </MapView>

      {followUser && position && !following && (
        <Pressable accessibilityRole="button" onPress={() => setPaused(0)} style={styles.recenter}>
          <AppText style={styles.recenterText}>Zentrieren</AppText>
        </Pressable>
      )}
    </View>
  );
}

type MapMarker = InstanceType<typeof Marker>;

const styles = StyleSheet.create({
  box: { backgroundColor: Colors.surface, overflow: 'hidden' },
  noTouch: { pointerEvents: 'none' },
  start: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.signal, borderWidth: 2, borderColor: Colors.ground },
  startHalo: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(226,70,28,0.3)', alignItems: 'center', justifyContent: 'center' },
  ziel: { width: 18, height: 18, borderRadius: 4, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.ground },
  zielInner: { width: 6, height: 6, backgroundColor: Colors.ground },
  warn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.ground },
  warnOn: { transform: [{ scale: 1.3 }], borderColor: Colors.text },
  warnText: { fontFamily: Fonts.display, fontSize: 14, lineHeight: 16, color: Colors.ground },
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
  other: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surface, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  otherStale: { opacity: 0.45 },
  otherText: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.text },
  recenter: {
    position: 'absolute',
    right: 16,
    top: '45%',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
    justifyContent: 'center',
  },
  recenterText: { fontFamily: Fonts.semibold, fontSize: 14 },
});
