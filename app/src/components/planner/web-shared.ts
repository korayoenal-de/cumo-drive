/** Gemeinsame Konstanten und Typen des Web Planers: Farben fürs Web, Schriften, Modi, Beispieltour. */
import sample from '@/data/sample-e3.json';
import { type PlanStep } from '@/lib/plan';
import { type LatLon, type Tour } from '@/lib/tour';
import { type Pass } from '@/lib/passes';
import { Colors } from '@/constants/theme';

export const C = {
  ground: Colors.ground, surface: Colors.surface, surface2: Colors.surface2, line: Colors.line, text: Colors.text,
  muted: Colors.muted, signal: Colors.signal, good: Colors.good, warn: Colors.warn,
};
export const DISPLAY = 'Archivo_900Black, Archivo, "Arial Narrow", Inter, system-ui, sans-serif';
export const BODY = 'Inter_400Regular, Inter, system-ui, sans-serif';

export type Mode = 'tour' | 'rundtour' | 'beschreiben' | 'touren';
export type MenuState = { x: number; y: number; p: LatLon; pass?: Pass } | null;
export type PlannedTour = Tour & { minutes?: number; fixes?: number };

export const STEP_TEXT: Record<PlanStep, string> = {
  route: 'Route wird berechnet',
  check: 'Etappen Check läuft',
  fix: 'Gesperrte Stellen werden umfahren',
};

export const SAMPLE: PlannedTour = { ...(sample as unknown as Tour), geprueft: true, minutes: 277 };
