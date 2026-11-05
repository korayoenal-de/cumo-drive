# Cumo Drive: Design Prinzipien

Ziel: die schönste, modernste und einfachste App für Genussfahrer. Jede Ansicht wird an diesen Regeln gemessen.

## 1. Eine Hauptaktion pro Ansicht
* Die wichtigste Aktion ist die Fläche selbst (Tourkarte antippen öffnet die Tour) oder ein einziger Signalknopf.
* Keine Knopfreihen. Nebenaktionen als Symbol, das bei Bedarf aufklappt.
* Was auf der Karte erledigt werden kann (ändern, starten), braucht keinen eigenen Knopf in Listen.

## 2. Aufklappen statt Wechseln
* Optionen erscheinen dort, wo getippt wurde, und gleiten nacheinander herein (Versatz `Motion.stagger`).
* Das auslösende Symbol zeigt den Zustand: dreht sich und wird zum X.
* Keine Systemdialoge. Bestätigen inline: Papierkorb wird zur roten Taste "Löschen", klappt nach 3 s zurück.

## 3. Bewegung mit Federn
* Alle Animationen nutzen `Motion` aus `theme.ts` (press, snap). Keine linearen Übergänge.
* Antippen gibt sichtbar nach (`Motion.pressScale`), Listen schließen Lücken weich (Layout Animation).
* Animationen laufen auf dem UI Thread (Reanimated), nie über React State pro Frame.

## 4. Inhalt zeigt sich selbst
* Touren mit Mini Streckenbild, Zahlen in Tabellenziffern, Status als getönte Plakette statt Text im Fließtext.
* Zahlen gleich groß und auf einer Zeile, Einheiten klein daneben.

## 5. Ruhe
* Dunkler Grund, wenige Flächen (`surface`, `surface2`), Signalfarbe nur für die Hauptaktion und Strecken.
* Keine Rahmen für Zustände, sondern getönte Flächen (`signalTint`, `goodTint`, `warnTint`).
* Kein Weichzeichner, der Inhalt verdeckt.

## 6. Bedienbar für alle
* Treffer mindestens 44 pt, Symbole mit Beschriftung für VoiceOver, Zustände über `accessibilityState`.
* Texte in Du Form, kurz, ohne Fachbegriffe, ohne Gedankenstriche.

## 7. Schnell
* Erst zeigen, dann laden: Gespeicherte Touren erscheinen sofort, so wie sie gespeichert sind, ohne Neuplanung.
* Speichern nur anbieten, wenn sich wirklich etwas geändert hat.

## Offene Punkte im Design System
* Haptisches Feedback beim Aufklappen und Bestätigen braucht `expo-haptics` und damit einen neuen App Build.
* Dieselbe Aufklapp Logik für Community Karten, Fahrten und Garage übernehmen.
* Planer Ergebnis: Knöpfe auf eine Hauptaktion plus aufklappbare Nebenaktionen reduzieren.
