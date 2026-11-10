/** Gemeinsame Konstanten und Typen des Web Planers: Farben fürs Web, Schriften, Schritte beim Planen. */
import { type PlanStep } from '@/lib/plan';
import { type Tour } from '@/lib/tour';
import { Colors } from '@/constants/theme';

export const C = {
  ground: Colors.ground, surface: Colors.surface, surface2: Colors.surface2, line: Colors.line, text: Colors.text,
  muted: Colors.muted, signal: Colors.signal, good: Colors.good, warn: Colors.warn,
};
export const DISPLAY = 'Archivo_900Black, Archivo, "Arial Narrow", Inter, system-ui, sans-serif';
export const BODY = 'Inter_400Regular, Inter, system-ui, sans-serif';

export type PlannedTour = Tour & { minutes?: number; fixes?: number };

export const STEP_TEXT: Record<PlanStep, string> = {
  route: 'Route wird berechnet',
  traffic: 'Verkehrsmeldungen werden geprüft',
  compare: 'Beste Variante wird gewählt',
  check: 'Etappen Check läuft',
  fix: 'Gesperrte Stellen werden umfahren',
};

