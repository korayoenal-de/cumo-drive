/**
 * Was auf dem Gerät liegt, gehört zu genau einem Konto (Koray 19.11.2026).
 *
 * Bis dahin hatten Garage, Touren und zuletzt gesuchte Orte einen Schlüssel je Gerät. Meldete sich auf demselben
 * Gerät oder im selben Browser ein anderes Konto an, sah es die Daten des vorigen Kontos, und der Abgleich schrieb sie
 * sogar in das neue Konto (gefunden: das Auto aus Korays Konto stand im frisch angelegten Konto brumm).
 *
 * Regeln:
 * - Abmelden und Konto löschen räumen die kontobezogenen Daten vom Gerät. Sie liegen im Konto und kommen beim
 *   nächsten Anmelden zurück.
 * - Vor jedem Abgleich prüft claimDevice, wem das Gerät gehört. Ist es ein anderes Konto (Sitzung abgelaufen, ohne
 *   Abmelden gewechselt), wird ebenfalls geräumt, bevor etwas zusammengeführt wird.
 * - Geräte ohne Vermerk (Stand vor diesem Update) werden dem angemeldeten Konto zugeschrieben und nicht geräumt,
 *   damit niemand beim Update etwas verliert.
 *
 * Einstellungen des Geräts (Stimme, Karte, Vermeiden, Sprache) bleiben, sie sagen nichts über eine Person.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const OWNER_KEY = 'cumo.drive.konto.v1';

/** Schlüssel mit Daten einer Person: Garage, Touren, zuletzt gesuchte Orte, letzter Plan, Name und Auto der Gruppenfahrt */
const ACCOUNT_KEYS = [
  'cumo.drive.garage.v2',
  'cumo.drive.fahrzeug.v1',
  'cumo.drive.touren.v1',
  'cumo.recentPlaces',
  'cumo.planer.zuletzt.v1',
  'cumo.drive.fahrer.v1',
];

const resets = new Set<() => void>();

/** Ein Speicher meldet hier, wie er seinen Stand im Arbeitsspeicher leert */
export function onAccountWipe(reset: () => void) {
  resets.add(reset);
}

async function wipe() {
  try {
    await AsyncStorage.multiRemove(ACCOUNT_KEYS);
  } catch {
    // ohne Speicher gibt es nichts zu räumen
  }
  for (const r of resets) {
    try {
      r();
    } catch {
      // ein Speicher darf die anderen nicht aufhalten
    }
  }
}

let claimed: { userId: string; done: Promise<void> } | null = null;

/** Vor jedem Abgleich: gehört das Gerät einem anderen Konto, erst räumen. Mehrere Aufrufe teilen sich die Prüfung. */
export function claimDevice(userId: string): Promise<void> {
  if (claimed?.userId === userId) return claimed.done;
  const done = (async () => {
    let owner: string | null = null;
    try {
      owner = await AsyncStorage.getItem(OWNER_KEY);
    } catch {
      return;
    }
    if (owner === userId) return;
    if (owner) await wipe();
    try {
      await AsyncStorage.setItem(OWNER_KEY, userId);
    } catch {
      // nur der Vermerk fehlt, beim nächsten Start wird neu geprüft
    }
  })();
  claimed = { userId, done };
  return done;
}

/** Beim Abmelden und beim Löschen des Kontos: alles Kontobezogene vom Gerät nehmen */
export async function releaseDevice() {
  claimed = null;
  await wipe();
  try {
    await AsyncStorage.removeItem(OWNER_KEY);
  } catch {
    // siehe oben
  }
}
