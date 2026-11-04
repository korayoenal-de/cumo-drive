/**
 * CUMO DRIVE Design Tokens.
 * Quelle: Design Canvas "Sportwagen App Screens". Die App ist bewusst nur dunkel.
 * Später wandern diese Werte in ein eigenes Design System.
 */

export const Colors = {
  ground: '#0B0B0C',
  surface: '#161618',
  surface2: '#1F1F22',
  line: '#2A2A2E',
  text: '#F4F4F2',
  muted: '#9A9A9F',
  /** Inaktive Typo Tabs: deutlich zurückgenommen, ab 24 px noch über 3 zu 1 auf ground. */
  faint: '#6E6E73',
  signal: '#E2461C',
  good: '#4CC38A',
  warn: '#E8B03A',
  onSignal: '#FFFFFF',
  /** Getönte Flächen für Zustände statt farbiger Rahmen, gleiche Werte wie im Web Planer. */
  signalTint: 'rgba(226,70,28,0.14)',
  goodTint: 'rgba(76,195,138,0.12)',
  warnTint: 'rgba(232,176,58,0.12)',
} as const;

export const Fonts = {
  display: 'Archivo_900Black',
  displayBold: 'Archivo_800ExtraBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const Spacing = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 28,
  xxxl: 48,
} as const;

export const Radius = {
  s: 12,
  m: 14,
  l: 16,
  pill: 999,
} as const;
