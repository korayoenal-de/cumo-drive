/**
 * Ein und Ausblenden von Ebenen und Optionen (Bottom Sheets, schwebende Aktionen, Toasts, Listen).
 * Seit 6.11. ohne Feder: eine weich auslaufende Kurve, die nie über das Ziel hinausschießt.
 * Federn (Motion.press, Motion.snap) bleiben nur für Gesten und Druck, wo die Hand die Bewegung führt.
 */
import { Easing, FadeInDown, LinearTransition, SlideInDown } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

/** Auslaufkurve ohne Überschwingen (alle Stützpunkte höchstens 1) */
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** Bottom Sheet fährt von unten herein */
export const sheetEnter = SlideInDown.duration(Motion.sheet).easing(EASE_OUT);
/** Optionen, Karten und Zeilen erscheinen gestaffelt, leicht von unten */
export const softEnter = (i = 0) => FadeInDown.duration(Motion.enter).easing(EASE_OUT).delay(i * Motion.stagger);
/** Nachrücken, wenn sich eine Liste ändert */
export const SOFT_LAYOUT = LinearTransition.duration(Motion.enter).easing(EASE_OUT);
