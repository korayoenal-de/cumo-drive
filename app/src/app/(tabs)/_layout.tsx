/**
 * Tab Bereich: verwendet die eigene Tableiste (components/app-tabs.tsx).
 */
import { Slot } from 'expo-router';
import { Platform } from 'react-native';

import AppTabs from '@/components/app-tabs';

/**
 * Die vier Tabs der App. Der Web Planer unter /planer liegt außerhalb und nutzt die ganze Fläche.
 */
export default function TabsLayout() {
  // Im Browser ohne Tableiste: dort steht unter / die Landingpage
  if (Platform.OS === 'web') return <Slot />;
  // Einladungen zu Gruppenfahrten erscheinen wie Nachrichten an der Community Plakette (Koray 11.11.)
  return <AppTabs />;
}
