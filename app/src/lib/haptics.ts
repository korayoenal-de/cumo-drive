/**
 * Haptik, sehr gezielt (Koray 10.11.2026): nur wenn der Finger etwas bewegt oder einen Zustand auslöst.
 * Seit 17.11. auch für die Prio 1 Aktionen: Landung im Ziel (ziel) und Losfahren oder Start (losfahren).
 * Keine Haptik für normale Taps, in der Fahrt nur der Funk. Die Namen sind Tokens wie Motion in theme.ts.
 *
 * expo-haptics ist ab Build 21 drin. Ältere Builds bekommen dieselben OTA Updates; dort fehlt das native
 * Modul, dann tun die Aufrufe nichts. Wer in iOS die Systemhaptik aus hat, spürt automatisch nichts.
 */
import * as ExpoModules from 'expo-modules-core';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind =
  /** Punkt hebt nach dem Halten ab (Punkte verschieben) */
  | 'abheben'
  /** neue Position beim Ziehen, wie die Rastung im iOS Picker */
  | 'rastung'
  /** Punkt abgelegt */
  | 'ablegen'
  /** Losfahren und Start klappen zusammen, die Fahrt beginnt */
  | 'losfahren'
  /** Aktion mit Ziel: das Symbol landet im Tab oder auf der Seite (Speichern, Merken, Veröffentlichen; Koray 17.11.) */
  | 'ziel'
  /** langer Druck auf die Karte hat einen Punkt gesetzt */
  | 'punkt'
  /** Funk gedrückt: du bist auf Sendung */
  | 'sendung'
  /** Funk losgelassen */
  | 'sendungEnde'
  /** Ergebnis ist da: die Rundtour steht (Zustand wird Ergebnis; Audit 18.11.) */
  | 'ergebnis'
  /** Endgültiges bestätigt: Löschen, Entfernen, Beenden */
  | 'warnung'
  /** Fehler ohne festen Ort (roter Toast) */
  | 'fehler';

const available =
  Platform.OS !== 'web' && typeof ExpoModules.requireOptionalNativeModule === 'function' && !!ExpoModules.requireOptionalNativeModule('ExpoHaptics');

export function haptic(kind: HapticKind): void {
  if (!available) return;
  const run = (): Promise<void> => {
    switch (kind) {
      case 'rastung':
        return Haptics.selectionAsync();
      case 'abheben':
      case 'punkt':
      case 'sendungEnde':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'ablegen':
      case 'ziel':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      case 'losfahren':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'sendung':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      case 'ergebnis':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'warnung':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case 'fehler':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };
  try {
    void run().catch(() => {});
  } catch {
    // ohne Modul oder Taptic Engine einfach nichts
  }
}
