/**
 * Pressable der App (Audit 18.11.2026, Regel Druck): jede Taste gibt gleich nach, ohne dass jede Datei das selbst baut.
 * Gleicher Name und gleiche Eigenschaften wie Pressable aus react-native, deshalb reicht der Import von hier.
 *
 * - Fester style: gedrückt kommt `Pressed` dazu (98,5 Prozent und leicht durchsichtig).
 * - Ohne style (Fläche unbekannter Größe, oft nur Text): nur leicht durchsichtig, keine Skalierung.
 * - style als Funktion oder eigenes onPressIn: der Baustein mischt sich nicht ein, die Stelle regelt es selbst.
 * - flat: große Flächen, die sich nicht bewegen sollen (Abdunkelung hinter Blättern, ganze Bildschirme).
 */
import { forwardRef, type ComponentRef } from 'react';
import { Pressable as RNPressable, type PressableProps } from 'react-native';

import { Pressed } from '@/constants/theme';

export type TapProps = PressableProps & { flat?: boolean };

const DIM = { opacity: Pressed.opacity } as const;

export const Pressable = forwardRef<ComponentRef<typeof RNPressable>, TapProps>(function Pressable({ flat, style, ...rest }, ref) {
  if (flat || typeof style === 'function' || rest.onPressIn) return <RNPressable ref={ref} style={style} {...rest} />;
  const down = style == null ? DIM : Pressed;
  return <RNPressable ref={ref} {...rest} style={({ pressed }) => [style, pressed && down]} />;
});
