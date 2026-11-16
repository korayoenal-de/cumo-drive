/**
 * Tour anpassen unterwegs (Koray 15.11.): der Planer im Modus „live“ über der laufenden Navigation.
 * Die Navigation bleibt darunter im Stapel und sagt weiter an. Im Browser gibt es keine Navigation.
 */
import { Platform } from 'react-native';

import Planner from '@/components/planner/planner';

export default function TourAnpassen() {
  if (Platform.OS === 'web') return null;
  return <Planner liveEdit />;
}
