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
  /**
   * Fehler und Gefährliches (Konsistenzprüfung 15.11., C1): eigenes Rot, klar getrennt vom Signal Orange.
   * stopText bleibt als alter Name für denselben Wert.
   */
  danger: '#FF5A52',
  stopText: '#FF5A52',
  dangerTint: 'rgba(255,90,82,0.14)',
  /** Heller Nebentext auf dunklen Plaketten (Plakette „Von …“, C2) */
  textSoft: '#C9C9CD',
  goodTint: 'rgba(76,195,138,0.14)',
  warnTint: 'rgba(232,176,58,0.14)',
  /** Abdunkelung hinter Sheets und Menüs (vorher 0.35 bis 0.6) */
  scrim: 'rgba(0,0,0,0.5)',
  /** Leere Stufe im Fahrspaß Pegel und andere inaktive Flächen auf surface */
  empty: '#3A3A3F',
  /** Schwebende Karten über der Karte (Ansagen, Pass Aktionen): ground fast deckend */
  overlay: 'rgba(11,11,12,0.94)',
  /** Weitere Touren an derselben Stelle, grau unter der gewählten (überlagernde Touren, 17.11.) */
  overlapLine: 'rgba(244,244,242,0.45)',
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
  /** Kleinstschrift: Zähler in Plaketten, Uhrzeit im Chat, Initialen (Audit 18.11., vorher feste 10 bis 12) */
  micro: 11,
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
  /** Inhalt unter einem Label, eine Stufe unter den Reitern: Tourname im Planer (Koray 21.11.2026, Variante 1) */
  lead: 20,
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
export const Leading = { micro: 13, caption: 16, body: 20, title: 22, lead: 26, tab: 30, metric: 26, h2: 30, display: 36 } as const;

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
  /** s (früher 12, dann gleich m) entfällt seit dem Audit 20.11.2026 */
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
  /** Ausblenden und Verschwinden (ms), kürzer als das Erscheinen (Audit 18.11., vorher 120 bis 180 gemischt) */
  exit: 160,
  /** Kleinste Wechsel wie ein Symbol, das erscheint (ms) */
  quick: 120,
  pressScale: 0.985,
  /**
   * Größenänderung von Bedienelementen (Puls beim Speichern, aktiver Tab, Anheben beim Ziehen):
   * höchstens 2 Prozent. Am 6.11. auf 20 % der früheren Ausschläge gesenkt (vorher 3 bis 15 %).
   * Gedrückt immer pressScale. Navigationssymbole und der Fahrspaß Pegel haben eigene Werte.
   */
  pop: 0.02,
} as const;

/**
 * Abstände mit Rolle (Audit 18.11.2026): dieselbe Rolle hat überall denselben Wert. Die Werte kommen aus Spacing.
 */
export const Layout = {
  /** Seitenrand, auf jeder Seite und in jeder Ebene */
  page: Spacing.xl,
  /** zwischen Abschnitten einer Seite; im Kartenblatt des Planers Spacing.section */
  sections: Spacing.xxl,
  /** Titel einer Seite oder Ebene zum ersten Inhalt */
  titleGap: Spacing.xl,
  /** Abschnittstitel zu seinem Inhalt */
  labelGap: Spacing.m,
  /** zwischen Karten einer Liste */
  list: Spacing.s,
  /** Karte innen und Lücke in der Karte */
  card: Spacing.l,
  cardGap: Spacing.m,
} as const;

/** Gedrückt: jede Taste gibt gleich nach (Regel Druck). Kommt über den Baustein Pressable aus components/ui/tap. */
export const Pressed = { transform: [{ scale: Motion.pressScale }], opacity: 0.85 } as const;
