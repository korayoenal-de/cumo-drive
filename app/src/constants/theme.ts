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
  /** Leere Stufe im Fahrspaß Pegel und andere inaktive Flächen auf surface */
  empty: '#3A3A3F',
  /** Schwebende Karten über der Karte (Ansagen, Pass Aktionen): ground fast deckend */
  overlay: 'rgba(11,11,12,0.94)',
  /** Schwebende Leisten (Tableiste, Navigation unten): surface fast deckend */
  overlaySurface: 'rgba(22,22,24,0.97)',
  /** Gedrückt oder ausgewählt auf dunklem Glas */
  pressTint: 'rgba(255,255,255,0.10)',
  shadow: '#000000',
} as const;

/**
 * Schriftgrößen in pt. Neue Texte nehmen eine dieser Stufen; Ausnahmen (Navigation, Kennzahlen in
 * Versalien) stehen direkt im Bauteil und sind dort begründet.
 */
export const Type = {
  /** kleine Zusätze, Plaketten */
  caption: 13,
  small: 14,
  /** Labels und Nebenzeilen, nicht kleiner als 15 pt (Design Prinzipien 5) */
  body: 15,
  /** Eingabefelder */
  input: 16,
  /** Namen in Listen, Zeilentitel */
  title: 17,
  /** Tasten */
  button: 18,
  h3: 20,
  h2: 24,
  h1: 30,
  /** große Kennzahlen und Tournamen */
  display: 34,
} as const;

/** Schatten für schwebende Flächen (React Native boxShadow) */
export const Shadow = {
  float: '0 8px 24px rgba(0,0,0,0.35)',
  sheet: '0 -6px 24px rgba(0,0,0,0.45)',
  lift: '0 10px 28px rgba(0,0,0,0.55)',
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
  /** Abstand zwischen Abschnitten im Blatt (Kennzahlen, Highlights, Höhenprofil, Stopps) */
  section: 40,
} as const;

export const Radius = {
  s: 12,
  m: 14,
  l: 16,
  pill: 999,
} as const;

/**
 * Bewegung: alle Mikroanimationen nutzen diese Federn, damit sich die App überall gleich anfühlt.
 * press: Antippen (Karte gibt leicht nach), snap: Auf und Zuklappen, Symbolwechsel.
 */
export const Motion = {
  press: { damping: 33, stiffness: 340, mass: 0.8 },
  snap: { damping: 36, stiffness: 260, mass: 1 },
  /** Versatz je Element, wenn mehrere nacheinander hereingleiten (ms) */
  stagger: 45,
  /** Dauer, mit der Optionen und Karten erscheinen (ms), ohne Überschwingen (components/ui/motion.ts) */
  enter: 260,
  /** Dauer, mit der ein Bottom Sheet hereinfährt (ms) */
  sheet: 300,
  pressScale: 0.985,
  /**
   * Größenänderung von Bedienelementen (Puls beim Speichern, aktiver Tab, Anheben beim Ziehen):
   * höchstens 2 Prozent. Am 6.11. auf 20 % der früheren Ausschläge gesenkt (vorher 3 bis 15 %).
   * Gedrückt immer pressScale. Navigationssymbole und der Fahrspaß Pegel haben eigene Werte.
   */
  pop: 0.02,
} as const;
