/**
 * Text der Plakette oben beim Planen (Koray 9.11.: das Warten erklären). Der lange Schritt "Route" wird
 * nach Zeit in Teilschritte gegliedert, die der Server dabei wirklich tut; jede Meldung bleibt mindestens
 * 1,2 s stehen, damit am Ende keine Meldungen vorbeiflackern.
 */
import { useEffect, useState } from 'react';

import type { PlanPhase } from './create-tour';

const DWELL = 1200;

function textFor(phase: PlanPhase, mode: 'tour' | 'runde', ms: number, found: number): string {
  switch (phase) {
    case 'start':
      return 'Standort bestimmen';
    case 'compare':
      return 'Beste Runde wählen';
    case 'traffic':
      return 'Verkehrsmeldungen prüfen';
    case 'check':
      return 'Straßen prüfen';
    case 'fix':
      return 'Sperrung umfahren';
    default:
      if (mode === 'runde') return ms < 3000 ? 'Varianten berechnen' : ms < 7000 ? 'Traumstrecken einbauen' : 'Breite und Belag prüfen';
      if (ms < 3400) return 'Traumstrecken entlang der Route suchen';
      if (ms < 6000 && found > 0) return found === 1 ? '1 Traumstrecke auf dem Weg' : `${found} Traumstrecken auf dem Weg`;
      return ms < 10000 ? 'Kurvige Straßen berechnen' : 'Breite und Belag prüfen';
  }
}

export function usePillText(phase: PlanPhase | null, mode: 'tour' | 'runde', found: number): string | null {
  // Zeit im aktuellen Schritt, im Takt der Uhr gesetzt (nicht beim Rendern)
  const [clock, setClock] = useState<{ phase: PlanPhase | null; ms: number }>({ phase: null, ms: 0 });
  useEffect(() => {
    if (!phase) return;
    const start = Date.now();
    const id = setInterval(() => setClock({ phase, ms: Date.now() - start }), 400);
    return () => clearInterval(id);
  }, [phase]);
  const ms = clock.phase === phase ? clock.ms : 0;
  const want = phase ? textFor(phase, mode, ms, found) : null;

  const [shown, setShown] = useState<{ text: string | null; at: number }>({ text: null, at: 0 });
  useEffect(() => {
    if (want === shown.text) return;
    const wait = shown.text ? Math.max(0, DWELL - (Date.now() - shown.at)) : 0;
    const t = setTimeout(() => setShown({ text: want, at: Date.now() }), wait);
    return () => clearTimeout(t);
  }, [want, shown]);
  return phase ? (shown.text ?? want) : null;
}
