/**
 * Lernender Fahrspaß Pegel (Koray 8.11.2026): Fahrer bewerten nach der Fahrt jedes gefahrene Highlight
 * mit Daumen hoch oder runter. Supabase liefert je Highlight nur Summen (highlight_feedback), daraus
 * verschiebt die App den kuratierten Pegel um bis zu zwei Stufen.
 *
 * Wenige Stimmen bewegen kaum etwas, viele deutlich (Gewicht n / (n + 4)), damit keine Strecke wegen
 * einer einzigen schlechten Fahrt kippt. Ohne Daumen zählt schwach die Gesamtnote der Fahrten darüber.
 * Die Summen liegen zwischengespeichert auf dem Gerät, ohne Netz gilt der letzte Stand.
 */

export type HighlightFeedback = {
  hl_key: string;
  votes: number;
  up: number;
  down: number;
  drives: number;
  score_avg: number | null;
  reasons: Record<string, number>;
};

const KEY = 'cumo.drive.highlight-feedback.v1';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

let byKey = new Map<string, HighlightFeedback>();
let loadedAt = 0;
let pending: Promise<void> | null = null;

/** road:<id>:2 (zweiter Durchgang derselben Strecke) zählt wie road:<id> */
export function feedbackKey(id: string): string {
  const m = /^(road:[^:]+)(:\d+)?$/.exec(id);
  return m ? m[1] : id;
}

function apply(rows: HighlightFeedback[]) {
  byKey = new Map(rows.map((r) => [r.hl_key, r]));
}

/** Beim Start aufrufen: erst der gespeicherte Stand, dann frisch vom Server (höchstens alle 6 Stunden) */
export function loadHighlightFeedback(force = false): Promise<void> {
  if (pending) return pending;
  if (!force && loadedAt && Date.now() - loadedAt < MAX_AGE_MS) return Promise.resolve();
  pending = (async () => {
    try {
      // erst hier laden: die Pegel Rechnung selbst läuft auch in Tests und Skripten ohne App Umgebung
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      const { supabase } = await import('./supabase');
      if (!byKey.size) {
        const raw = await AsyncStorage.getItem(KEY).catch(() => null);
        if (raw) apply(JSON.parse(raw) as HighlightFeedback[]);
      }
      const { data, error } = await supabase.rpc('highlight_feedback');
      if (error || !Array.isArray(data)) return;
      const rows = (data as HighlightFeedback[]).map((r) => ({ ...r, score_avg: r.score_avg == null ? null : Number(r.score_avg) }));
      apply(rows);
      loadedAt = Date.now();
      await AsyncStorage.setItem(KEY, JSON.stringify(rows)).catch(() => undefined);
    } catch {
      // ohne Netz bleibt der kuratierte oder gespeicherte Stand
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** Verschiebung in Stufen (−2 bis +2) für ein Highlight */
export function levelShift(id: string): number {
  const f = byKey.get(feedbackKey(id));
  if (!f) return 0;
  let signal = 0;
  let weight = 0;
  if (f.votes > 0) {
    signal = (f.up - f.down) / f.votes;
    weight = f.votes / (f.votes + 4);
  } else if (f.score_avg != null && f.drives > 0) {
    // Gesamtnote 60 gilt als neutral; schwächeres Signal, weil sie die ganze Fahrt meint
    signal = Math.max(-1, Math.min(1, (f.score_avg - 60) / 40));
    weight = (f.drives / (f.drives + 8)) * 0.5;
  }
  return Math.max(-2, Math.min(2, Math.round(signal * weight * 2)));
}

/** Kuratierter Pegel (1 bis 5) plus das, was Fahrer gemeldet haben */
export function learnedLevel(id: string, base: number): number {
  return Math.max(1, Math.min(5, base + levelShift(id)));
}
