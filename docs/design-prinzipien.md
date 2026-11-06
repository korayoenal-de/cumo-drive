# Cumo Drive: Design Prinzipien

Ziel: die schönste, modernste und einfachste App für Genussfahrer. Jede Ansicht wird an diesen Regeln gemessen.

## 1. Eine Hauptaktion pro Ansicht
* Die wichtigste Aktion ist die Fläche selbst (Tourkarte antippen öffnet die Tour) oder ein einziger Signalknopf.
* Keine Knopfreihen. Nebenaktionen als Symbol, das bei Bedarf aufklappt.
* Was auf der Karte erledigt werden kann (ändern, starten), braucht keinen eigenen Knopf in Listen.

## 2. Ebenen und Rückmeldungen (entschieden am 6.11.2026)
Jede Rückfrage, jedes Menü und jede Meldung nutzt genau eines dieser Muster. Bauteile in Klammern.

| Muster | Wofür | Beispiele | Schließen |
|---|---|---|---|
| **Aufklappen an Ort und Stelle** | eine Wahl, die zum Inhalt gehört und klein bleibt | Profil einer Etappe, Vermeiden, Länge in km oder Dauer | Tippen auf dieselbe Stelle |
| **Bottom Sheet mit Optionen** (`ActionSheet`) | Optionen zu einem Objekt, 2 bis 6 Zeilen, je Symbol, Name, Hinweis | Optionen einer Tour in Meine Touren, Weiteres im Planer (Anpassen, Neu würfeln, Verwerfen), Optionen eines Fahrzeugs | Tipp daneben, Zeile wählen |
| **Rückfrage** (`ConfirmSheet`) | vor allem, was sich nicht rückgängig machen lässt | Tour löschen, Runde verwerfen, Fahrzeug löschen | Abbrechen oder Bestätigen |
| **Bottom Sheet mit Inhalt** (`OptionsSheet`) | kurze Eingabe zu einem Objekt, höchstens zwei Felder | In der Community veröffentlichen | Tipp daneben, Fertig |
| **Ebene** (Modal als Page Sheet) | eigene Aufgabe mit viel Inhalt oder Tastatur, Wischen nach unten schließt | Ortssuche, Highlight Details, Karteneinstellungen | Wischen, X oben |
| **Schwebende Karte über der Karte** | Aktionen zu etwas auf der Karte, die Karte bleibt sichtbar | angetippter Pass, neuer Punkt durch langen Druck | Tipp auf die Karte |
| **Toast** | Bestätigung einer erledigten Aktion, nichts mehr zu tun | Gespeichert unter Meine Touren, Tour gelöscht, In der Community veröffentlicht | verschwindet nach 2,6 s, mit Folgeaktion nach 5 s |
| **Hinweis im Inhalt** | Zustand oder Fehler, der zu einer Stelle gehört | Feld leer, Route geändert und nicht gespeichert, Standort nicht freigegeben | verschwindet, wenn der Grund weg ist |
| **Vollbild** | Modus, der alles andere ersetzt | Navigation, QR Scan, Mitgliedschaft | eigener Knopf |

Regeln:
* Keine Systemdialoge (Alert). Ausnahme: Berechtigungen, die nur iOS fragen kann.
* Höchstens eine Ebene über der anderen (wie Spotify: Liste, darüber eine Ebene). Öffnet eine Zeile im Sheet etwas Neues, schließt das Sheet zuerst (`SHEET_GONE_MS`).
* Gefährliches steht im Sheet unten, rot, und fragt immer nach. Die Frage ist ein ganzer Satz: "Möchtest du diese Tour wirklich löschen?". Die rote Taste nennt das Verb: "Löschen".
* Toasts nur für Erfolg und für Fehler ohne festen Ort (Export, Netz). Fehler mit Ort stehen am Ort.
* Ein Objekt hat genau einen Einstieg für Optionen: das Symbol ⋯ rechts. Die Fläche selbst öffnet das Objekt.
* Optionen gleiten nicht mehr inline herein; die Federn aus 3 gelten für Sheets und Ebenen.

## 3. Bewegung mit Federn (Bounce geregelt am 6.11.2026)
* Alle Animationen nutzen `Motion` aus `theme.ts`. Keine linearen Übergänge.
* Federn `press` (Drücken) und `snap` (Hereingleiten, Blatt, Tab Leiste, Sheets, Toast) schwingen nicht über. Kein Federn ohne diese Werte, keine Standard Feder von Reanimated.
* Bounce gibt es nur als Puls `Motion.pop` (2 Prozent, einmal hin und zurück), und nur für zwei Anlässe: eine Aktion ist erledigt (Lesezeichen beim Speichern) und Aufmerksamkeit kurz vor einem Manöver (Navigationssymbol). Sonst nirgends.
* Drücken verkleinert auf `Motion.pressScale` (98,5 Prozent).
* Ausnahme: der Stern der Legende im Fahrspaß Pegel (125 Prozent), eine eigene Gestaltung.
* Pfeil kurz vor dem Manöver: die Linie baut sich bis zur Basis der Spitze auf, dann füllt sich die ganze Spitze auf einmal, danach der Puls. Umgebung und schwacher Pfeil liegen in einer Ebene, so ist im Kreisverkehr nur ein Weg zu sehen.
* Bei „Bewegung reduzieren“ nur Deckkraft, kein Aufbau, kein Puls.

## 4. Inhalt zeigt sich selbst
* Touren mit Mini Streckenbild, Zahlen in Tabellenziffern, Status als getönte Plakette statt Text im Fließtext.
* Zahlen gleich groß und auf einer Zeile, Einheiten klein daneben.

## 5. Typografie: Mittelweg (entschieden am 5.11.2026)
* Versalien in Archivo Black nur für Tournamen und Überschriften der Ansicht sowie Kennzahlen (109 KM, 2:15 H, 47).
* Buttons, Highlight Ansagen, Wegbeschreibung, Listen und Abschnittstitel normal geschrieben in Inter Bold.
* Labels und Nebenzeilen in Inter Semibold grau, über dem Wert, nicht kleiner als 15 pt.
* Vorbild für die Ruhe: Trade Republic. Hierarchie über Gewicht und Grau, kaum über Größe.

## 5b. Fahrspaß Pegel (entschieden am 5.11.2026, Variante E)
* Jede Strecke und jedes Highlight trägt einen Pegel in fünf Stufen: Nett, Lohnend, Stark, Traumstraße, Legende.
* Form: sieben Dreiecke auf einem geschlossenen Kreis, Spitzen zur Mitte, aus dem CDC Keyvisual. Sie stoßen an der Basis aneinander, in der Negativform bleibt ein siebenzackiger Stern frei.
* Eine Zacke des Sterns zeigt nach oben, zwei nach unten. Stufen füllen 1, 3, 4, 6, 7 Dreiecke im Uhrzeigersinn ab unten links, gefüllt in Signal Orange, leer als dunkle Fläche. Unter 20 pt nur die orangen Dreiecke ohne graue Flächen.
* Legende animiert (Ansage in der Navigation), 4 s, subtiler Austausch ohne graue Flächen, Stern und Dreiecke nie zugleich: Dreiecke weiten sich auf 112 % und blenden aus, danach erscheint der Stern, pulsiert auf 125 % und zurück und blendet aus, danach bauen sich die Dreiecke im Uhrzeigersinn wieder auf. Bei reduzierter Bewegung statisch.
* Größen: Liste 28 pt, Karte 30 pt, Ansage 44 pt. Startwert ist die kuratierte Qualität 1 bis 5, Bewertungen nach der Fahrt verschieben ihn.

## 6. Ruhe
* Dunkler Grund, wenige Flächen (`surface`, `surface2`), Signalfarbe nur für die Hauptaktion und Strecken.
* Keine Rahmen für Zustände, sondern getönte Flächen (`signalTint`, `goodTint`, `warnTint`).
* Kein Weichzeichner, der Inhalt verdeckt.

## 7. Bedienbar für alle
* Treffer mindestens 44 pt, Symbole mit Beschriftung für VoiceOver, Zustände über `accessibilityState`.
* Texte in Du Form, kurz, ohne Fachbegriffe, ohne Gedankenstriche.

## 8. Schnell
* Erst zeigen, dann laden: Gespeicherte Touren erscheinen sofort, so wie sie gespeichert sind, ohne Neuplanung.
* Speichern nur anbieten, wenn sich wirklich etwas geändert hat.

## Offene Punkte im Design System
* Haptisches Feedback beim Aufklappen und Bestätigen braucht `expo-haptics` und damit einen neuen App Build.
* Dieselbe Aufklapp Logik für Community Karten, Fahrten und Garage übernehmen.
* Planer Ergebnis: Knöpfe auf eine Hauptaktion plus aufklappbare Nebenaktionen reduzieren.
