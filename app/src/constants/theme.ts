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
  /** Inaktive Haupt Reiter, deutlich zurück (Variante D, etwa 2,7 zu 1, bewusst gewählt) */
  tabOff: '#57575C',
  signal: '#E2461C',
  good: '#4CC38A',
  warn: '#E8B03A',
  onSignal: '#FFFFFF',
  /** Getönte Flächen für Zustände statt farbiger Rahmen, gleiche Werte wie im Web Planer. */
  signalTint: 'rgba(226,70,28,0.14)',
  /** Hauptaktion noch inaktiv, etwa Losfahren während die Route berechnet wird (Koray 9.11.) */
  signalDeep: '#5C2212',
  /** Text für Entfernen und Fehler auf signalTint (Design System stop-text) */
  stopText: '#FF8A66',
  goodTint: 'rgba(76,195,138,0.14)',
  warnTint: 'rgba(232,176,58,0.14)',
  /** Abdunkelung hinter Sheets und Menüs (vorher 0.35 bis 0.6) */
  scrim: 'rgba(0,0,0,0.5)',
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
 * Schriftgrößen in pt (UI Konsistenz Check 9.11.2026): sieben Rollen plus Reiter.
 * Display 34 und H1 26 in Archivo (nur Gelesenes: Titel, Tournamen), Kennzahl 22 in Archivo,
 * alles Bedienbare in Inter. Nichts unter 15 pt außer Caption auf Karte, Plaketten und Tab Leiste.
 */
export const Type = {
  /** nur Kartenpins, Plaketten, Tab Leiste */
  caption: 13,
  /** früher 14; jetzt wie body, damit nichts unter 15 pt fällt */
  small: 15,
  /** Zeilen, Labels, Nebenzeilen, Chips */
  body: 15,
  /** Eingabefelder */
  input: 17,
  /** Namen in Listen, Abschnittstitel, Tasten */
  title: 17,
  button: 17,
  h3: 17,
  /** große Reiter (Gespeichert, Gefahren; Schnelle Runde, Route): Inter Bold, normal geschrieben */
  tab: 26,
  /** Kennzahlen in Archivo (412 KM, 2:15 H) */
  metric: 22,
  /** Titel von Ebenen (Sheets, Vollflächen) in Archivo */
  h2: 26,
  /** Screen Titel in Archivo */
  h1: 34,
  display: 34,
} as const;

/** Zeilenhöhen passend zur Skala */
export const Leading = { caption: 16, body: 20, title: 22, tab: 30, metric: 26, h2: 30, display: 36 } as const;

/** Feste Größen für Bedienelemente (Prinzip 7: Treffer ab 44 pt) */
export const Size = {
  /** Haupt und Zweittaste */
  button: 56,
  /** Eingabefelder */
  input: 52,
  /** Chips, Reiter als Pille, kleine Tasten */
  chip: 44,
  /** runde Symboltasten (Schließen, Zurück, Mehr) */
  icon: 44,
} as const;

/** Schatten für schwebende Flächen (React Native boxShadow) */
export const Shadow = {
  float: '0 8px 24px rgba(0,0,0,0.35)',
  /** Schwebende Knöpfe auf der Karte (Koray 13.11.): nur nach unten, weich, direkt auf der Kreisform */
  button: '0 4px 12px rgba(0,0,0,0.35)',
  sheet: '0 -6px 24px rgba(0,0,0,0.45)',
  lift: '0 10px 28px rgba(0,0,0,0.55)',
} as const;

export const Fonts = {
  display: 'Archivo_900Black',
  /** früher Archivo 800; vereinheitlicht auf ein Archivo Gewicht */
  displayBold: 'Archivo_900Black',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  /** Haupt Reiter (Tour planen, Rundtour; Gespeichert, Gefahren), Koray 9.11. Variante D */
  extrabold: 'Inter_800ExtraBold',
} as const;

export const Spacing = {
  /** Haarlinie, kleinste Lücke */
  hair: 2,
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

/** Drei Radien (9.11.): m für Felder und Zeilen, l für Karten und Sheets, pill für Tasten, Chips, Reiter */
export const Radius = {
  /** früher 12; zusammengelegt mit m */
  s: 14,
  m: 14,
  l: 20,
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
