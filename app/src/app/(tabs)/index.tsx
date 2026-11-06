/**
 * Tab Planen: zeigt den Planer (components/planner/planner.tsx).
 */
import { Platform } from 'react-native';

import Landing from '@/components/landing/landing';
import Planner from '@/components/planner/planner';

export default function Planen() {
  // Im Browser steht hier die Landingpage; der große Planer liegt hinter Login unter /planer
  if (Platform.OS === 'web') return <Landing />;
  return <Planner />;
}
