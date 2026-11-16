/**
 * Nachfrage nach dem Verwerfen (Koray 16.11., Leinwand „Nachfrage nach dem Verwerfen“): wer drei Rundtouren sieht und
 * dann verwirft, bekommt einmal ein freundliches Blatt. Subtil und nie nervig:
 * einmal pro Sitzung; zweimal hintereinander weggeschoben, dann sieben Tage Ruhe; nach dem Senden 24 Stunden Ruhe.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TourRequest } from '@/components/planner/create-tour';
import type { PlannedTour } from './plan';
import { sendFeedback } from './feedback';
import { flatten } from './tour';

const KEY = 'cumo.ask-feedback.v1';
const DAY = 24 * 60 * 60 * 1000;
/** ab so vielen gezeigten Runden ohne Speichern oder Losfahren */
export const ASK_AFTER_ROLLS = 3;
/** Pause nach dem Verwerfen, bevor das Blatt kommt */
export const ASK_DELAY_MS = 1500;

export const ASK_REASONS: { id: string; label: string }[] = [
  { id: 'laenge', label: 'Zu kurz oder zu lang' },
  { id: 'kurven', label: 'Zu wenig kurvig' },
  { id: 'orte', label: 'Zu viele Orte' },
  { id: 'richtung', label: 'Falsche Richtung' },
  { id: 'strassen', label: 'Straßen ungeeignet' },
  { id: 'anderes', label: 'Etwas anderes' },
];

type Memo = { dismissed: number; quietUntil: number };
let askedThisSession = false;

async function readMemo(): Promise<Memo> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const m = raw ? (JSON.parse(raw) as Partial<Memo>) : {};
    return { dismissed: m.dismissed ?? 0, quietUntil: m.quietUntil ?? 0 };
  } catch {
    return { dismissed: 0, quietUntil: 0 };
  }
}
async function writeMemo(m: Memo): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // ohne Speicher fragt die App höchstens einmal je Sitzung
  }
}

/** Darf jetzt gefragt werden? Merkt sich die Frage für diese Sitzung, wenn ja. */
export async function mayAsk(): Promise<boolean> {
  if (askedThisSession) return false;
  const m = await readMemo();
  if (Date.now() < m.quietUntil) return false;
  askedThisSession = true;
  return true;
}

/** Weggeschoben oder Ausblenden: zweimal hintereinander, dann sieben Tage Ruhe */
export async function askDismissed(): Promise<void> {
  const m = await readMemo();
  const dismissed = m.dismissed + 1;
  await writeMemo(dismissed >= 2 ? { dismissed: 0, quietUntil: Date.now() + 7 * DAY } : { dismissed, quietUntil: m.quietUntil });
}

export type AskRound = { tour: PlannedTour; req: TourRequest };

/**
 * Grund senden, mit den gezeigten Runden zum Nachrechnen. Start nur gerundet (etwa 1 km, Ortsmitte statt Haustür), von
 * den Wegpunkten gehen nur die Stützpunkte unterwegs mit, nie Start und Ziel.
 */
export async function sendAsk(reasonId: string, text: string, rounds: AskRound[]): Promise<void> {
  const reason = ASK_REASONS.find((r) => r.id === reasonId)?.label ?? 'Etwas anderes';
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const last = rounds.slice(-5);
  const req = last[last.length - 1]?.req;
  const note = text.trim() ? `${reason}: ${text.trim()}` : `Rundtour verworfen: ${reason}`;
  await sendFeedback('planen', note, {
    art: 'rundtour_verworfen',
    grund: reasonId,
    start: req ? { ort: req.start.name, p: [r2(req.start.p[0]), r2(req.start.p[1])] } : null,
    wunsch: req ? { km: req.km, richtung: req.direction, peilung: req.bearing ?? null, profil: req.profile, vermeiden: req.avoid } : null,
    runden: last.map((x) => ({
      km: Math.round(x.tour.laenge_km),
      stuetzpunkte: x.tour.wegpunkte.slice(1, -1).map((p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]),
      punkte: flatten(x.tour).length,
    })),
  });
  await writeMemo({ dismissed: 0, quietUntil: Date.now() + DAY });
}
