/**
 * Web Ersatz für die Karte: zeigt die SVG Vorschau, damit das Web ohne native Karte läuft.
 * Der große Web Planer hat seine eigene MapLibre Karte (planner.web.tsx).
 * Ein langer Druck rechnet die Stelle über die Vorschau Projektion in einen Punkt um.
 */
import { useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';

import { projectTour, RoutePreview } from '@/components/planner/route-preview';

import type { RouteMapProps } from './route-map-shared';

export type { RouteMapProps } from './route-map-shared';

export function RouteMap({ tour, style, onLongPress }: RouteMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: { nativeEvent: { layout: { width: number; height: number } } }) =>
    setSize({ width: Math.round(e.nativeEvent.layout.width), height: Math.round(e.nativeEvent.layout.height) });
  const preview = size.height > 0 && <RoutePreview tour={tour} height={size.height} />;
  if (!onLongPress) {
    return (
      <View style={style} onLayout={onLayout}>
        {preview}
      </View>
    );
  }
  const handleLongPress = (e: GestureResponderEvent) => {
    const proj = projectTour(tour, size.width, size.height);
    if (!proj) return;
    const ne = e.nativeEvent as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
    const x = ne.locationX ?? ne.offsetX;
    const y = ne.locationY ?? ne.offsetY;
    if (x == null || y == null) return;
    onLongPress(proj.toLatLon(x, y));
  };
  return (
    <Pressable style={style} onLayout={onLayout} onLongPress={handleLongPress} accessibilityLabel="Karte, lange drücken setzt einen Punkt">
      {preview}
    </Pressable>
  );
}
