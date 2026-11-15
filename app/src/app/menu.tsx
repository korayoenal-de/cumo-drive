/**
 * Einstellungen während einer laufenden Navigation (Koray 15.11.: "während der Routenführung zurück ins Menü,
 * zum Beispiel in die Einstellungen"). Liegt als Blatt über der Navigation: die läuft darunter weiter (Ansagen,
 * GPS, CarPlay, Funk), nach unten wischen oder "Zur Navigation" führt zurück. Unterseiten wie Garage oder Ansagen
 * öffnen sich im selben Blatt.
 */
import Einstellungen from '@/app/(tabs)/einstellungen';

export default function NavMenu() {
  return <Einstellungen inNav />;
}
