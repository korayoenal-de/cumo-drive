/** Gemeinsame Konstanten und Typen des Web Planers: Farben fürs Web, Schriften, Schritte beim Planen. */
import { type PlanStep } from '@/lib/plan';
import { useEffect, useState } from 'react';

import { HIGHLIGHT_ROADS, PREFER_ROADS } from '@/lib/highlight-roads';
import { ensureRoadArea } from '@/lib/road-data';
import { flatten, type LatLon, type Tour } from '@/lib/tour';
import { Colors } from '@/constants/theme';
import { t } from '@/i18n';

export const C = {
  ground: Colors.ground, surface: Colors.surface, surface2: Colors.surface2, line: Colors.line, text: Colors.text,
  muted: Colors.muted, signal: Colors.signal, good: Colors.good, warn: Colors.warn,
};
export const DISPLAY = 'Archivo_900Black, Archivo, "Arial Narrow", Inter, system-ui, sans-serif';
export const BODY = 'Inter_400Regular, Inter, system-ui, sans-serif';

export type PlannedTour = Tour & { minutes?: number; fixes?: number };

export const STEP_TEXT: Record<PlanStep, string> = {
  route: t('Route wird berechnet'),
  traffic: t('Verkehrsmeldungen werden geprüft'),
  compare: t('Beste Variante wird gewählt'),
  check: t('Etappen Check läuft'),
  fix: t('Gesperrte Stellen werden umfahren'),
  longer: t('Runde wird verlängert'),
  shorter: t('Runde wird gekürzt'),
};


/**
 * Strecken entlang der gezeigten Touren nachladen (Web, kachelweise seit 17.11., Sicherheitskonzept Maßnahme 5).
 * Liefert einen Zähler, der steigt, sobald neue Strecken da sind; damit rechnen Highlights und Fahrspaß neu.
 */
export function useRoadArea(...tours: (Tour | null | undefined)[]): number {
  const [rev, setRev] = useState(0);
  const key = tours.map((t) => (t ? `${t.laenge_km}:${t.linie.length}:${t.linie[0]?.p[0]?.join(',') ?? ''}` : '')).join('|');
  useEffect(() => {
    let live = true;
    const pts: LatLon[] = [];
    for (const t of tours) {
      if (!t) continue;
      const line = flatten(t).map((x) => x.p);
      for (let i = 0; i < line.length; i += 25) pts.push(line[i]);
      if (line.length) pts.push(line[line.length - 1]);
    }
    if (!pts.length) return;
    const before = HIGHLIGHT_ROADS.length + PREFER_ROADS.length;
    void ensureRoadArea(pts, 5).then(() => {
      if (live && HIGHLIGHT_ROADS.length + PREFER_ROADS.length !== before) setRev((r) => r + 1);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rev;
}
