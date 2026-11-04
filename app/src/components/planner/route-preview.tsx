/**
 * Vorschau einer geprüften Tour als SVG: Linie auf die Fläche projiziert,
 * nach Klasse eingefärbt (ok hell, prüfen gelb, raus rot), Start markiert.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Colors, Radius } from '@/constants/theme';
import type { CheckClass, LatLon, Tour } from '@/lib/tour';

export const CLASS_COLORS: Record<CheckClass, string> = {
  ok: Colors.text,
  pruefen: '#E8B03A',
  raus: Colors.signal,
};

const PAD = 18;

export type Projection = {
  xy: (p: LatLon) => [number, number];
  /** Umkehrung: Punkt auf der Fläche zurück in Breite und Länge */
  toLatLon: (x: number, y: number) => LatLon;
};

/**
 * Einfache Projektion der Tour Linie auf eine Fläche (Längengrade mit cos(Breite) gestaucht).
 * Ohne Linie oder Fläche gibt es keine Projektion.
 */
export function projectTour(tour: Tour, width: number, height: number): Projection | null {
  const all = tour.linie.flatMap((r) => r.p);
  if (width <= 0 || height <= 0 || all.length < 2) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [la, lo] of all) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const s = Math.min((width - PAD * 2) / spanX, (height - PAD * 2) / spanY);
  const offX = (width - spanX * s) / 2;
  const offY = (height - spanY * s) / 2;
  return {
    xy: ([la, lo]) => [offX + (lo - minLon) * k * s, offY + (maxLat - la) * s],
    toLatLon: (x, y) => [maxLat - (y - offY) / s, minLon + (x - offX) / (k * s)],
  };
}

export function RoutePreview({ tour, height = 260 }: { tour: Tour; height?: number }) {
  const [width, setWidth] = useState(0);
  const all = tour.linie.flatMap((r) => r.p);
  const start = tour.wegpunkte[0] ?? all[0];

  let runs: { c: CheckClass; pts: string }[] = [];
  let startXY: [number, number] | null = null;
  const proj = projectTour(tour, width, height);
  if (proj) {
    const { xy } = proj;
    // ok zuerst zeichnen, damit Warnstellen oben liegen
    const order: CheckClass[] = ['ok', 'pruefen', 'raus'];
    runs = order.flatMap((c) =>
      tour.linie
        .filter((r) => r.c === c && r.p.length > 1)
        .map((r) => ({ c, pts: r.p.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join(' ') })),
    );
    if (start) startXY = xy(start);
  }

  return (
    <View style={[styles.box, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {runs.map((r, i) => (
            <Polyline
              key={i}
              points={r.pts}
              fill="none"
              stroke={CLASS_COLORS[r.c]}
              strokeOpacity={r.c === 'ok' ? 0.85 : 1}
              strokeWidth={r.c === 'ok' ? 3 : 4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {startXY && (
            <>
              <Circle cx={startXY[0]} cy={startXY[1]} r={11} fill={Colors.signal} fillOpacity={0.25} />
              <Circle cx={startXY[0]} cy={startXY[1]} r={6} fill={Colors.signal} stroke={Colors.ground} strokeWidth={2} />
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: Colors.surface, borderRadius: Radius.l, overflow: 'hidden', borderWidth: 1, borderColor: Colors.line },
});
