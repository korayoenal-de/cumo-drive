/**
 * Web Ersatz: im Browser ohne native Karte, dort steht die Community als Liste.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import type { LatLon } from '@/lib/tour';

export type CommunityPin = { id: string; kind: 'route' | 'ausfahrt' | 'driver'; p: LatLon; label: string; count?: number; ring?: string };

export function CommunityMap({ style }: { pins: CommunityPin[]; selected: string | null; onSelect: (id: string | null) => void; line: LatLon[] | null; bottom: number; top: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[style, { backgroundColor: Colors.surface }]} />;
}
