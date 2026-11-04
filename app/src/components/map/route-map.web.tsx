/**
 * Web Ersatz für die Karte: zeigt die SVG Vorschau, damit das Web ohne native Karte läuft.
 * Der große Web Planer hat seine eigene MapLibre Karte (planner.web.tsx).
 */
import { useState } from 'react';
import { View } from 'react-native';

import { RoutePreview } from '@/components/planner/route-preview';

import type { RouteMapProps } from './route-map-shared';

export type { RouteMapProps } from './route-map-shared';

export function RouteMap({ tour, style }: RouteMapProps) {
  const [height, setHeight] = useState(0);
  return (
    <View style={style} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && <RoutePreview tour={tour} height={height} />}
    </View>
  );
}
