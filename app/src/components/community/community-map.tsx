/**
 * Karte der Community (Koray 9.11.): Pins am Start jeder Route oder Ausfahrt.
 * Routen: dunkle Pins mit Streckensymbol und km. Ausfahrten: orange Pins mit Teilnehmerzahl und Datum.
 * Antippen wählt den Pin, die ganze Strecke erscheint auf der Karte.
 *
 * Seit 16.11. (Koray, Leinwand „Pins nach Zoomstufe“) ohne Kreise mit Zahl: jeder Pin bleibt einzeln, die Zoomstufe
 * bestimmt, wie viel er zeigt. Weit ein Punkt, Region ein Symbol, nah die volle Marke; gewählt immer die volle.
 * Orange nur für Ausfahrten, Touren hell, Fahrer mit Ring in Wagenfarbe.
 */
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Avatar } from '@/components/community/ride-bits';
import { useAvatar } from '@/lib/avatars';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Shadow } from '@/constants/theme';
import { useMapSettings, type MapStyle } from '@/lib/map-settings';
import { clusterPins, type Region } from '@/lib/map-cluster';
import { HIT_RADIUS, hitKm, pickOnScreen, pickPin, routeStroke, simplifyForScreen } from '@/lib/map-hit';
import type { LatLon } from '@/lib/tour';
import { tr } from '@/i18n';

export type CommunityPin = { id: string; kind: 'route' | 'ausfahrt' | 'driver'; p: LatLon; label: string; count?: number; ring?: string };

const MAP_TYPE: Record<MapStyle, 'mutedStandard' | 'hybrid' | 'hybridFlyover'> = { standard: 'mutedStandard', satellit: 'hybrid', '3d': 'hybridFlyover' };
const ll = (p: LatLon) => ({ latitude: p[0], longitude: p[1] });
const START: Region = { latitude: 48.8, longitude: 9.2, latitudeDelta: 6, longitudeDelta: 6 };

/** Ab diesem Abstand in Punkten überdecken sich zwei Pins der Stufe; Abstand beim Nebeneinanderlegen */
const CELL: Record<PinStage, number> = { weit: 14, region: 34, nah: 30 };
const GAP: Record<PinStage, number> = { weit: 18, region: 38, nah: 40 };

/** Zoomstufe der Pins nach Breite des Ausschnitts in Grad */
export type PinStage = 'weit' | 'region' | 'nah';
/**
 * Mit Abstand zwischen hinein und heraus, damit es an der Grenze nicht flackert: hinein bei 3 und 0,6 Grad,
 * heraus erst bei 3,6 und 0,75 Grad.
 */
export function stageFor(span: number, prev: PinStage): PinStage {
  if (prev === 'weit') return span < 3 ? (span < 0.6 ? 'nah' : 'region') : 'weit';
  if (prev === 'nah') return span > 0.75 ? (span > 3.6 ? 'weit' : 'region') : 'nah';
  return span > 3.6 ? 'weit' : span < 0.6 ? 'nah' : 'region';
}

type Props = {
  pins: CommunityPin[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  line: LatLon[] | null;
  /**
   * Tipp mit Ort und Fangradius statt onSelect (überlagernde Touren, Koray 17.11.): der Bildschirm prüft, welche
   * Touren unter dem Finger laufen. at null: Tipp auf eine Marke ohne Kartenort.
   */
  onTap?: (at: LatLon | null, pinId: string | null, radiusKm: number) => void;
  /** Weitere Touren an der Stelle, grau unter der gewählten */
  others?: LatLon[][];
  /** Beim Wischen durch überlagernde Touren steht die Karte still, nur die Hervorhebung wandert */
  keepView?: boolean;
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

/** ab dieser Breite des Ausschnitts in Grad gilt die Karte als Weltansicht */
const WORLD_DELTA = 20;

export function CommunityMap({ pins, selected, onSelect, onTap, others, keepView, line, bottom, top, style }: Props) {
  const settings = useMapSettings();
  const map = useRef<MapView>(null);
  const pad = { top: top + 30, right: 40, bottom: bottom + 30, left: 40 };
  const pinKey = pins.map((p) => p.id).join(',');
  const padRef = useRef(pad);
  useEffect(() => {
    padRef.current = pad;
  });
  const win = useWindowDimensions();
  const [region, setRegion] = useState<Region>(START);
  const [mapWidth, setMapWidth] = useState(0);
  const [stage, setStage] = useState<PinStage>(stageFor(START.longitudeDelta, 'region'));
  const onRegion = (r: Region) => {
    setRegion(r);
    setStage((prev) => stageFor(r.longitudeDelta, prev));
  };
  // Nur was im Ausschnitt liegt (mit Rand). Pins, die sich überdecken würden (gleicher Start, zum Beispiel große und
  // kleine Sellaronda und die 62 km Runde), liegen in jeder Stufe nebeneinander: sonst ist nur der oberste zu sehen und
  // anzutippen (Koray 16.11., 12:00). Nah untereinander (die Marken sind breit), Region und Weit in einer Reihe.
  const shown = useMemo(() => {
    const groups = mergeNear(clusterPins(pins, region, win.width, CELL[stage], selected), region, win.width, CELL[stage] + GAP[stage] / 2, selected);
    // Ganz weit draußen (Kontinent, Globus) bleiben die Punkte an ihrem Ort: nebeneinander gelegt ergaben sie dort
    // merkwürdige Reihen, und der gemeldete Ausschnitt taugt auf dem Globus nicht zum Rechnen (Koray 18.11.)
    if (region.longitudeDelta > WORLD_DELTA) return groups.flatMap((g) => g.items);
    return groups.flatMap((g) => (g.items.length > 1 ? fanOut(g.items, g.p, region, win.width, stage) : g.items));
  }, [pins, region, win.width, selected, stage]);

  // Ein Tipp kann als Kartentipp, als Markentipp oder als beides ankommen, in beliebiger Reihenfolge. Beide werden kurz
  // gesammelt; dann entscheidet der Abstand zum Tipp, ersatzweise die gemeldete Marke.
  const latest = useRef({ shown, region, width: win.width, stage, selected });
  useEffect(() => {
    latest.current = { shown, region, width: mapWidth || win.width, stage, selected };
  }, [shown, region, mapWidth, win.width, stage, selected]);
  const onTapRef = useRef(onTap);
  useEffect(() => {
    onTapRef.current = onTap;
  }, [onTap]);
  const tapRef = useRef<{ at: LatLon | null; pt: { x: number; y: number } | null; marker: string | null; timer: ReturnType<typeof setTimeout> | null; decidedAt: number; decided: string | null }>({
    at: null,
    pt: null,
    marker: null,
    timer: null,
    decidedAt: 0,
    decided: null,
  });
  useEffect(() => () => {
    const t = tapRef.current.timer;
    if (t) clearTimeout(t);
  }, []);
  const decideSoon = () => {
    const s = tapRef.current;
    if (s.timer) return;
    s.timer = setTimeout(() => {
      const L = latest.current;
      const at = s.at;
      const pt = s.pt;
      const marker = s.marker;
      s.at = null;
      s.pt = null;
      s.marker = null;
      // Ganz weit draußen wählt ein Tipp keine einzelne Tour (die Punkte liegen aufeinander): die Karte fährt zu den
      // Touren hin, dort sind sie einzeln zu treffen (Koray 18.11.)
      if (L.region.longitudeDelta > WORLD_DELTA && L.shown.length > 0 && !L.selected) {
        s.timer = null;
        s.decidedAt = Date.now();
        s.decided = null;
        map.current?.fitToCoordinates(withSpan(L.shown.map((p) => p.p)).map(ll), { edgePadding: padRef.current, animated: true });
        return;
      }
      const finish = (near: { id: string } | null) => {
        const id = near?.id ?? marker ?? null;
        s.timer = null;
        s.decidedAt = Date.now();
        s.decided = id;
        if (onTapRef.current) onTapRef.current(at, id, hitKm(L.region, L.width));
        else onSelect(id);
      };
      const byRegion = () => (at ? pickPin(L.shown, at, L.region, L.width, L.stage, L.selected) : null);
      const m = map.current;
      // Erst über echte Bildschirmpunkte (stimmt auch in 3D Satellit und auf dem Globus), sonst wie bisher gerechnet
      if (pt && m) {
        const lookOf = (p: CommunityPin): PinStage => (p.id === L.selected ? 'nah' : L.stage);
        void pickOnScreen(
          L.shown,
          pt,
          (p) => m.pointForCoordinate(ll(p)),
          (p) => HIT_RADIUS[lookOf(p)],
          (p) => {
            const plate = lookOf(p) === 'nah' && p.kind !== 'driver';
            return { lift: plate ? 22 : 0, wide: plate };
          },
        ).then((hit) => finish(hit === undefined ? byRegion() : hit));
      } else finish(byRegion());
    }, 90);
  };
  const tapAt = (at: LatLon, pt: { x: number; y: number } | null) => {
    tapRef.current.at = at;
    tapRef.current.pt = pt;
    decideSoon();
  };
  const tapMarker = (id: string) => {
    const s = tapRef.current;
    // Kommt die Markenmeldung erst nach der Entscheidung, zählt sie nur, wenn kein Pin getroffen schien
    if (!s.timer && Date.now() - s.decidedAt < 350) {
      if (s.decided === null) onSelect(id);
      return;
    }
    s.marker = id;
    decideSoon();
  };

  // Gewählte Strecke passend zum Zoom: ausgedünnt, und klein gezeichnet dünner und ohne Schatten
  const drawn = useMemo(() => {
    if (!line || line.length < 2) return null;
    const w = mapWidth || win.width;
    return { coords: simplifyForScreen(line, region, w).map(ll), stroke: routeStroke(line, region, w) };
  }, [line, region, mapWidth, win.width]);

  // Weitere Touren an der Stelle: grau und dünner unter der gewählten
  const otherDrawn = useMemo(() => {
    if (!others?.length) return [];
    const w = mapWidth || win.width;
    return others.filter((o) => o.length > 1).map((o) => simplifyForScreen(o, region, w).map(ll));
  }, [others, region, mapWidth, win.width]);

  // Alle Pins zeigen, wenn sich die Auswahl der Pins ändert (Routen oder Ausfahrten)
  useEffect(() => {
    if (!pins.length || selected) return;
    const t = setTimeout(() => map.current?.fitToCoordinates(withSpan(pins.map((p) => p.p)).map(ll), { edgePadding: pad, animated: true }), 60);
    return () => clearTimeout(t);
    // nur bei neuen Pins, nicht bei jeder Blatt Höhe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  // Gewählte Strecke ganz zeigen (nicht beim Wischen durch überlagernde Touren)
  const keepRef = useRef(keepView);
  useEffect(() => {
    keepRef.current = keepView;
  }, [keepView]);
  useEffect(() => {
    if (!line || line.length < 2 || keepRef.current) return;
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
      // Treffer rechnet die Karte selbst (lib/map-hit): der nächste Pin im Umkreis gewinnt, auch wenn das iPhone den
      // Tipp keiner Marke zuordnet. Tippen auf die freie Karte hebt die Auswahl auf.
      onPress={(e) => {
        if (e.nativeEvent.action === 'marker-press') return;
        const c = e.nativeEvent.coordinate;
        const pos = e.nativeEvent.position;
        tapAt([c.latitude, c.longitude], pos && Number.isFinite(pos.x) ? { x: pos.x, y: pos.y } : null);
      }}
      onLayout={(e) => setMapWidth(e.nativeEvent.layout.width)}
      onRegionChangeComplete={onRegion}
      initialRegion={START}>
      {otherDrawn.map((c, i) => (
        <Polyline key={`o${i}`} coordinates={c} strokeColor={Colors.overlapLine} strokeWidth={3} lineCap="round" lineJoin="round" zIndex={1} />
      ))}
      {drawn && (
        <>
          {drawn.stroke.shadow > 0 && <Polyline coordinates={drawn.coords} strokeColor="rgba(0,0,0,0.45)" strokeWidth={drawn.stroke.shadow} lineCap="round" lineJoin="round" zIndex={1} />}
          <Polyline coordinates={drawn.coords} strokeColor={Colors.signal} strokeWidth={drawn.stroke.width} lineCap="round" lineJoin="round" zIndex={2} />
        </>
      )}
      {shown.map((p) => (
        <PinMarker key={p.id} pin={p} on={p.id === selected} stage={stage} onTap={tapMarker} />
      ))}
    </MapView>
  );
}

/**
 * Gruppen aus Nachbarzellen zusammenlegen, wenn sie auf dem Bildschirm dichter als minPt liegen (Koray 16.11.: weit
 * herausgezoomt lagen Pins aus benachbarten Zellen als Kreise übereinander). Der gewählte Pin bleibt für sich.
 */
function mergeNear<T extends { id: string; p: LatLon }>(groups: { key: string; p: LatLon; items: T[] }[], region: Region, widthPt: number, minPt: number, keep: string | null) {
  const ptPerLon = widthPt / Math.max(1e-6, region.longitudeDelta);
  const out: { key: string; p: LatLon; items: T[] }[] = [];
  for (const g of groups) {
    const solo = g.items.some((x) => x.id === keep);
    const hit = solo
      ? undefined
      : out.find((o) => {
          if (o.items.some((x) => x.id === keep)) return false;
          const dx = (o.p[1] - g.p[1]) * ptPerLon;
          const dy = (o.p[0] - g.p[0]) * ptPerLon / Math.cos((g.p[0] * Math.PI) / 180);
          return Math.hypot(dx, dy) < minPt;
        });
    if (!hit) {
      out.push({ ...g, items: [...g.items] });
      continue;
    }
    const n = hit.items.length + g.items.length;
    hit.p = [(hit.p[0] * hit.items.length + g.p[0] * g.items.length) / n, (hit.p[1] * hit.items.length + g.p[1] * g.items.length) / n];
    hit.items.push(...g.items);
  }
  return out;
}

/**
 * Pins am selben Ort nebeneinander legen: in der Stufe Nah untereinander (die Marken sind breit), sonst in einer Reihe;
 * Fahrer im Kreis. Abstände in Punkten, umgerechnet für den aktuellen Ausschnitt; die echte Lage zeigt die Strecke
 * beim Antippen.
 */
function fanOut(items: CommunityPin[], c: LatLon, region: Region, widthPt: number, stage: PinStage): CommunityPin[] {
  const perLon = widthPt / region.longitudeDelta;
  const perLat = perLon / Math.cos((c[0] * Math.PI) / 180);
  const n = items.length;
  const gap = GAP[stage];
  return items.map((p, i) => {
    let dx = 0;
    let dy = 0;
    const k = i - (n - 1) / 2;
    if (p.kind === 'driver' && stage !== 'weit') {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      const r = Math.max(gap * 0.8, (n * gap) / (2 * Math.PI));
      dx = Math.cos(a) * r;
      dy = Math.sin(a) * r;
    } else if (stage === 'nah') dy = k * gap;
    else dx = k * gap;
    return { ...p, p: [c[0] - dy / perLat, c[1] + dx / perLon] as LatLon };
  });
}

/**
 * Eine Marke. Die Karte zeichnet Marken einmal als Bild (tracksViewChanges aus, sonst ruckelt sie); kommt das
 * Profilfoto später, baut ein neuer Schlüssel die Marke neu.
 */
function PinMarker({ pin, on, stage, onTap }: { pin: CommunityPin; on: boolean; stage: PinStage; onTap: (id: string) => void }) {
  // gewählt zeigt immer alles
  const look: PinStage = on ? 'nah' : stage;
  const photo = useAvatar(pin.kind === 'driver' ? pin.id : null);
  // kurz mitzeichnen, bis das Foto geladen ist, dann wieder als festes Bild
  const [settled, setSettled] = useState<string | null>(null);
  // Die ersten Augenblicke mitzeichnen: wird die Marke als Bild festgehalten, bevor sie fertig aufgebaut ist, bleibt
  // ihre Trefferfläche auf dem iPhone winzig (Koray 17.11.: Punkte erst nach vielen Versuchen getroffen)
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFresh(false), 600);
    return () => clearTimeout(t);
  }, []);
  const track = fresh || (!!photo && photo !== settled);
  useEffect(() => {
    if (!photo) return;
    const t = setTimeout(() => setSettled(photo), 1500);
    return () => clearTimeout(t);
  }, [photo]);
  return (
    <Marker
      key={`${pin.id}-${look}-${on ? 1 : 0}-${photo ?? ''}`}
      coordinate={ll(pin.p)}
      anchor={pin.kind === 'driver' || look !== 'nah' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 }}
      zIndex={on ? 50 : pin.kind === 'route' ? 10 : 20}
      tracksViewChanges={track}
      onPress={() => onTap(pin.id)}
      accessibilityLabel={pin.kind === 'route' ? tr('Route, {label}', { label: pin.label }) : pin.kind === 'driver' ? tr('Fahrer {label}', { label: pin.label }) : tr('Ausfahrt am {label}', { label: pin.label })}>
      {look === 'weit' ? <PinDot pin={pin} /> : look === 'region' ? <PinIcon pin={pin} /> : <Pin pin={pin} on={on} />}
    </Marker>
  );
}

/** Weit: nur ein Punkt. Rand drumherum, damit der Schatten im Bild der Marke Platz hat. */
function PinDot({ pin }: { pin: CommunityPin }) {
  const bg = pin.kind === 'ausfahrt' ? Colors.signal : pin.kind === 'driver' ? (pin.ring ?? Colors.text) : Colors.text;
  return (
    <View style={styles.roomDot}>
      <View style={[styles.pinDot, { backgroundColor: bg }]} />
    </View>
  );
}

/** Region: ein Symbol, 32 pt. Tour mit Streckensymbol, Ausfahrt mit Teilnehmerzahl, Fahrer mit Foto. */
function PinIcon({ pin }: { pin: CommunityPin }) {
  if (pin.kind === 'driver') {
    return (
      <View style={styles.room}>
        <View style={[styles.driverS, { borderColor: pin.ring ?? Colors.text }]}>
          <Avatar name={pin.label} userId={pin.id} size={26} />
        </View>
      </View>
    );
  }
  const ride = pin.kind === 'ausfahrt';
  return (
    <View style={styles.room}>
      <View style={[styles.icon, ride && styles.iconRide]}>
        {ride ? (
          <AppText style={styles.iconCount}>{pin.count ?? ''}</AppText>
        ) : (
          <SymbolView name="point.topleft.down.to.point.bottomright.curvepath" size={16} weight="semibold" tintColor={Colors.text} />
        )}
      </View>
    </View>
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
          <SymbolView name="point.topleft.down.to.point.bottomright.curvepath" size={16} weight="semibold" tintColor={fg} />
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
  // Rand für den Schatten: die Marke wird als Bild gezeichnet, ohne Rand schneidet sie ihn ab
  room: { padding: 12 },
  // Punkt 12 pt plus Rand: zusammen 44 pt Trefferfläche
  roomDot: { padding: 16 },
  pinDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.ground, boxShadow: Shadow.button },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, boxShadow: Shadow.button, alignItems: 'center', justifyContent: 'center' },
  iconRide: { backgroundColor: Colors.signal },
  iconCount: { color: Colors.onSignal, fontFamily: Fonts.extrabold, fontSize: 14, lineHeight: 17, fontVariant: ['tabular-nums'] },
  driverS: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', boxShadow: Shadow.button },
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
