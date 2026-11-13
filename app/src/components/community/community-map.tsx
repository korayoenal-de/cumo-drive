/**
 * Karte der Community (Koray 9.11.): Pins am Start jeder Route oder Ausfahrt.
 * Routen: dunkle Pins mit Streckensymbol und km. Ausfahrten: orange Pins mit Teilnehmerzahl und Datum.
 * Antippen wählt den Pin, die ganze Strecke erscheint auf der Karte.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Avatar } from '@/components/community/ride-bits';
import { useAvatar } from '@/lib/avatars';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts } from '@/constants/theme';
import { useMapSettings, type MapStyle } from '@/lib/map-settings';
import { clusterLabel, clusterPins, type Region } from '@/lib/map-cluster';
import type { LatLon } from '@/lib/tour';

export type CommunityPin = { id: string; kind: 'route' | 'ausfahrt' | 'driver'; p: LatLon; label: string; count?: number; ring?: string };

const MAP_TYPE: Record<MapStyle, 'mutedStandard' | 'hybrid' | 'hybridFlyover'> = { standard: 'mutedStandard', satellit: 'hybrid', '3d': 'hybridFlyover' };
const ll = (p: LatLon) => ({ latitude: p[0], longitude: p[1] });
const START: Region = { latitude: 48.8, longitude: 9.2, latitudeDelta: 6, longitudeDelta: 6 };

type Props = {
  pins: CommunityPin[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  line: LatLon[] | null;
  /** Höhe, die das Blatt unten verdeckt */
  bottom: number;
  top: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Ein einzelner Pin (oder eng beieinander) zoomt sonst ganz nah heran und landet unter Blatt oder Umschalter
 * (Koray 10.11.). Darum mindestens etwa 25 km Ausschnitt um die Pins, die Ränder rechnen den Rest.
 */
function withSpan(pts: LatLon[], min = 0.22): LatLon[] {
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const c: LatLon = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
  const h = Math.max(min, Math.max(...lats) - Math.min(...lats)) / 2;
  const w = Math.max(min, Math.max(...lons) - Math.min(...lons)) / 2;
  return [...pts, [c[0] - h, c[1] - w], [c[0] + h, c[1] + w]];
}

export function CommunityMap({ pins, selected, onSelect, line, bottom, top, style }: Props) {
  const settings = useMapSettings();
  const map = useRef<MapView>(null);
  const pad = { top: top + 30, right: 40, bottom: bottom + 30, left: 40 };
  const pinKey = pins.map((p) => p.id).join(',');
  const win = useWindowDimensions();
  // Ausschnitt der Karte: daraus ergibt sich, welche Pins zu einem Kreis mit Zahl werden (Koray 11.11.)
  const [region, setRegion] = useState<Region>(START);
  const groups = useMemo(() => clusterPins(pins, region, win.width, 56, selected), [pins, region, win.width, selected]);

  // Alle Pins zeigen, wenn sich die Auswahl der Pins ändert (Routen oder Ausfahrten)
  useEffect(() => {
    if (!pins.length || selected) return;
    const t = setTimeout(() => map.current?.fitToCoordinates(withSpan(pins.map((p) => p.p)).map(ll), { edgePadding: pad, animated: true }), 60);
    return () => clearTimeout(t);
    // nur bei neuen Pins, nicht bei jeder Blatt Höhe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  // Gewählte Strecke ganz zeigen
  useEffect(() => {
    if (!line || line.length < 2) return;
    const step = Math.max(1, Math.floor(line.length / 200));
    const pts = line.filter((_, i) => i % step === 0).map(ll);
    map.current?.fitToCoordinates(pts, { edgePadding: pad, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  return (
    <MapView
      ref={map}
      style={style}
      userInterfaceStyle="dark"
      mapType={MAP_TYPE[settings.style]}
      showsUserLocation
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      onPress={(e) => {
        // Tippen auf die freie Karte hebt die Auswahl auf, Tippen auf einen Pin nicht
        if (e.nativeEvent.action !== 'marker-press') onSelect(null);
      }}
      onRegionChangeComplete={setRegion}
      initialRegion={START}>
      {line && line.length > 1 && (
        <>
          <Polyline coordinates={line.map(ll)} strokeColor="rgba(0,0,0,0.45)" strokeWidth={8} lineCap="round" lineJoin="round" zIndex={1} />
          <Polyline coordinates={line.map(ll)} strokeColor={Colors.signal} strokeWidth={5} lineCap="round" lineJoin="round" zIndex={2} />
        </>
      )}
      {groups.map((g) => {
        if (g.items.length > 1) {
          const n = g.items.length;
          const kind = g.items[0].kind;
          return (
            <Marker
              key={g.key}
              coordinate={ll(g.p)}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={30}
              tracksViewChanges={false}
              // näher heran, bis sich der Kreis auflöst
              onPress={() => map.current?.fitToCoordinates(withSpan(g.items.map((x) => x.p), 0.03).map(ll), { edgePadding: pad, animated: true })}
              accessibilityLabel={`${n} ${kind === 'driver' ? 'Fahrer' : kind === 'route' ? 'Routen' : 'Ausfahrten'} hier, tippen zum Heranzoomen`}>
              <View style={[styles.cluster, n >= 10 && styles.clusterM, n >= 100 && styles.clusterL, kind === 'ausfahrt' && styles.clusterRide]}>
                <AppText style={[styles.clusterText, kind === 'ausfahrt' && styles.clusterTextRide]}>{clusterLabel(n)}</AppText>
              </View>
            </Marker>
          );
        }
        const p = g.items[0];
        const on = p.id === selected;
        return <PinMarker key={p.id} pin={p} on={on} onSelect={onSelect} />;
      })}
    </MapView>
  );
}

/**
 * Eine Marke. Die Karte zeichnet Marken einmal als Bild (tracksViewChanges aus, sonst ruckelt sie); kommt das
 * Profilfoto später, baut ein neuer Schlüssel die Marke neu.
 */
function PinMarker({ pin, on, onSelect }: { pin: CommunityPin; on: boolean; onSelect: (id: string | null) => void }) {
  const photo = useAvatar(pin.kind === 'driver' ? pin.id : null);
  // kurz mitzeichnen, bis das Foto geladen ist, dann wieder als festes Bild
  const [settled, setSettled] = useState<string | null>(null);
  const track = !!photo && photo !== settled;
  useEffect(() => {
    if (!photo) return;
    const t = setTimeout(() => setSettled(photo), 1500);
    return () => clearTimeout(t);
  }, [photo]);
  return (
    <Marker
      key={`${pin.id}-${on ? 1 : 0}-${photo ?? ''}`}
      coordinate={ll(pin.p)}
      anchor={pin.kind === 'driver' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 }}
      zIndex={on ? 50 : pin.kind === 'route' ? 10 : 20}
      tracksViewChanges={track}
      onPress={() => onSelect(pin.id)}
      accessibilityLabel={pin.kind === 'route' ? `Route, ${pin.label}` : pin.kind === 'driver' ? `Fahrer ${pin.label}` : `Ausfahrt am ${pin.label}`}>
      <Pin pin={pin} on={on} />
    </Marker>
  );
}

function Pin({ pin, on }: { pin: CommunityPin; on: boolean }) {
  if (pin.kind === 'driver') {
    // Profilfoto oder Initialen im Kreis, Ring in der Wagenfarbe aus der Garage
    return (
      <View style={[styles.driver, { borderColor: pin.ring ?? Colors.text }, on && styles.driverOn]}>
        <Avatar name={pin.label} userId={pin.id} size={33} />
      </View>
    );
  }
  const ride = pin.kind === 'ausfahrt';
  const bg = ride ? Colors.signal : on ? Colors.text : Colors.surface;
  const fg = ride ? Colors.onSignal : on ? Colors.ground : Colors.text;
  return (
    <View style={styles.wrap}>
      <View style={[styles.pill, { backgroundColor: bg }, ride && on && styles.rideOn]}>
        {ride ? (
          <View style={styles.people}>
            <View style={[styles.dot, styles.dotA]} />
            <View style={[styles.dot, styles.dotB]}>
              <AppText style={styles.count}>{pin.count ?? ''}</AppText>
            </View>
          </View>
        ) : (
          <SymbolView name="point.topleft.down.to.point.bottomright.curvepath" size={13} weight="bold" tintColor={fg} />
        )}
        <AppText style={[styles.label, { color: fg }]}>{pin.label}</AppText>
      </View>
      <View style={[styles.tip, { borderTopColor: bg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  driver: { width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center' },
  driverOn: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, backgroundColor: Colors.surface },
  // Kreis mit Zahl für mehrere Pins an einer Stelle: hell, damit er sich von den einzelnen dunklen Pins abhebt
  cluster: { minWidth: 40, height: 40, paddingHorizontal: 8, borderRadius: 20, backgroundColor: Colors.text, borderWidth: 3, borderColor: 'rgba(11,11,12,0.55)', alignItems: 'center', justifyContent: 'center' },
  clusterM: { minWidth: 46, height: 46, borderRadius: 23 },
  clusterL: { minWidth: 54, height: 54, borderRadius: 27 },
  clusterRide: { backgroundColor: Colors.signal },
  clusterText: { fontFamily: Fonts.extrabold, fontSize: 15, lineHeight: 18, color: Colors.ground, fontVariant: ['tabular-nums'] },
  clusterTextRide: { color: Colors.onSignal },
  wrap: { alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  rideOn: { borderWidth: 2, borderColor: Colors.text },
  label: { fontFamily: Fonts.bold, fontSize: 13, lineHeight: 16, fontVariant: ['tabular-nums'] },
  tip: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
  people: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.signal, alignItems: 'center', justifyContent: 'center' },
  dotA: { backgroundColor: Colors.signalDeep },
  dotB: { backgroundColor: '#7A3018', marginLeft: -6 },
  count: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: 10, lineHeight: 12 },
});
