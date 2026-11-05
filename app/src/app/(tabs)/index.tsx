/**
 * Tab Planen: zeigt den Planer (components/planner/planner.tsx).
 */
import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import Planner from '@/components/planner/planner';

export default function Planen() {
  // Im Browser gibt es den großen Planer mit Karte und Seitenleiste unter /planer
  if (Platform.OS === 'web') return <Redirect href="/planer" />;
  return <Planner />;
}
