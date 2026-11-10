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
| **Bottom Sheet mit Optionen** (`ActionSheet`) | Optionen zu einem Objekt, 2 bis 6 Zeilen, je Symbol, Name, Hinweis | Optionen einer Tour in Touren, Weiteres im Planer (Anpassen, Neu würfeln, Verwerfen), Optionen eines Fahrzeugs | Tipp daneben, Zeile wählen |
| **Rückfrage** (`ConfirmSheet`) | vor allem, was sich nicht rückgängig machen lässt | Tour löschen, Runde verwerfen, Fahrzeug löschen | Abbrechen oder Bestätigen |
| **Bottom Sheet mit Inhalt** (`OptionsSheet`) | kurze Eingabe zu einem Objekt, höchstens zwei Felder | In der Community veröffentlichen | Tipp daneben, Fertig |
| **Ebene** (Modal als Page Sheet) | eigene Aufgabe mit viel Inhalt oder Tastatur, Wischen nach unten schließt | Ortssuche, Highlight Details, Karteneinstellungen | Wischen, X oben |
| **Schwebende Karte über der Karte** | Aktionen zu etwas auf der Karte, die Karte bleibt sichtbar | angetippter Pass, neuer Punkt durch langen Druck | Tipp auf die Karte |
| **Toast** | Bestätigung einer erledigten Aktion, nichts mehr zu tun | Gespeichert unter Touren, Tour gelöscht, In der Community veröffentlicht | verschwindet nach 2,6 s, mit Folgeaktion nach 5 s |
| **Hinweis im Inhalt** | Zustand oder Fehler, der zu einer Stelle gehört | Feld leer, Route geändert und nicht gespeichert, Standort nicht freigegeben | verschwindet, wenn der Grund weg ist |
| **Vollbild** | Modus, der alles andere ersetzt | Navigation, QR Scan, Mitgliedschaft | eigener Knopf |

Regeln:
* Keine Systemdialoge (Alert). Ausnahme: Berechtigungen, die nur iOS fragen kann.
* Höchstens eine Ebene über der anderen (wie Spotify: Liste, darüber eine Ebene). Öffnet eine Zeile im Sheet etwas Neues, schließt das Sheet zuerst (`SHEET_GONE_MS`).
* Gefährliches steht im Sheet unten, rot, und fragt immer nach. Die Frage ist ein ganzer Satz: "Möchtest du diese Tour wirklich löschen?". Die rote Taste nennt das Verb: "Löschen".
* Toasts nur für Erfolg und für Fehler ohne festen Ort (Export, Netz). Fehler mit Ort stehen am Ort.
* Ein Objekt hat genau einen Einstieg für Optionen: das Symbol ⋯ rechts. Die Fläche selbst öffnet das Objekt.
* Optionen gleiten nicht mehr inline herein; Sheets und Ebenen erscheinen wie in 3 beschrieben.

## 3. Bewegung mit Federn (Bounce geregelt am 6.11.2026)
* Alle Animationen nutzen `Motion` aus `theme.ts`. Keine linearen Übergänge.
* Ebenen und Optionen (Bottom Sheets, schwebende Aktionen, Toasts, Listen) erscheinen ohne Feder: Auslaufkurve EASE_OUT, Sheets 300 ms, Optionen 260 ms, gestaffelt 45 ms (components/ui/motion.ts). Seit 6.11. nachmittags, weil die Federn dort noch nachwippten.
* Federn `press` (Drücken) und `snap` nur noch für Gesten und Druck (Blatt ziehen, Tab Leiste, Drücken), ohne Überschwingen. Keine Standard Feder von Reanimated.
* Bedienelemente ändern ihre Größe höchstens um `Motion.pop` (2 Prozent): Puls beim Speichern, aktiver Tab in der Tab Leiste, Punkt beim Ziehen (die Hälfte). Gedrückt immer `Motion.pressScale` (98,5 Prozent), überall gleich. Das sind 20 Prozent der früheren Ausschläge (3 bis 15 Prozent).
* Eigene Werte haben nur die Navigationssymbole (Puls 6 Prozent nach dem Aufbau, 10 Prozent bei Symbolen ohne Pfeil) und der Stern der Legende im Fahrspaß Pegel (125 Prozent).
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

## 5b. Fahrspaß Pegel (Variante S3, entschieden am 7.11.2026, löst E ab)
* Jede Strecke und jedes Highlight trägt einen Pegel in fünf Stufen: Nett, Lohnend, Stark, Traumstraße, Legende.
* Form: acht Segmente mit rundem Rücken um einen schlanken achtzackigen Stern, der als Negativform frei bleibt.
* Stufen füllen 1, 3, 5, 7 und 8 Segmente ab 6 Uhr im Uhrzeigersinn, gefüllt in Signal Orange, leer als dunkle Fläche (`empty`). Unter 24 pt nur die orangen Segmente.
* Legende animiert (Ansage in der Navigation): subtiler Austausch zwischen Segmenten und Stern, nie beides zugleich. Bei reduzierter Bewegung statisch.
* Startwert ist die kuratierte Qualität 1 bis 5; Bewertungen nach der Fahrt verschieben ihn.
* Für ganze Touren gibt es zusätzlich den Fahrspaß Wert 0 bis 100 (Gemütlich bis Legendär) mit Logo und Rechnung im Fahrspaß Blatt.

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
* Lead Blatt aus dem Funk Prototyp umsetzen.

## Regeln aus dem UI Konsistenz Check (9.11.2026)

Gilt für alle Screens; Werte stehen als Tokens in `app/src/constants/theme.ts`.

**Schrift**
- Archivo nur für Gelesenes: Screen Titel (Display 34/36), Titel von Ebenen (26/30), Tournamen, Kennzahlen (22/26). Immer Archivo 900, kein zweites Gewicht.
- Alles Bedienbare in Inter. Große Haupt Reiter (Tour planen, Rundtour; Gespeichert, Gefahren): Inter ExtraBold 26/30, normal geschrieben, inaktiv `tabOff` #57575C (Variante D, 9.11.).
- Titel und Tasten Inter Bold 17/22, Zeilen und Labels Inter Semibold 15/20, Caption 13/16 nur auf der Karte, auf Plaketten und in der Tab Leiste. Nichts sonst unter 15 pt.
- Versalien nur in Archivo.

**Ebenen**
- ActionSheet: Optionen zu einem Objekt (2 bis 6 Zeilen).
- ConfirmSheet: Rückfrage vor Endgültigem.
- OptionsSheet: ein bis zwei Felder, auch der Name beim Speichern. Zentrierte Dialoge gibt es nicht.
- Vollfläche (pageSheet): Suche, Orte in der Nähe, Highlight, Karteneinstellungen; Kopf mit Titel 26, Rolle grau, Schließen 44.
- Schwebendes Menü: schnelle Aktionen am Auslöser (⋯).
- Ausnahme: das Menü in der Navigation schließt nach 4 s von selbst.
- Abdunkelung immer `scrim` (0.5), Flächen über der Karte `overlay` oder `overlaySurface`.

**Farben**
- Nur Tokens. Tints einheitlich 0.14. Sondergruppen mit Begründung: Ansagen in der Navigation, Verkehrszeichen, Verlauf des Fahrspaß Pegels.

**Maße**
- Haupttaste und Zweittaste 56, rund (`Size.button`, `Radius.pill`); Eingabefelder 52 mit Radius 14; Chips, Reiter als Pille und Symboltasten 44.
- Radien: 14 für Felder und Zeilen, 20 für Karten und Sheets, rund für alles Antippbare.
- Abstände: 2, 4, 8, 12, 16, 20, 28, 40, 48.

## Muster vom 10.11.2026

**Navigation zwischen Ansichten**
- Zurück wie bei Instagram: Wer aus Touren oder der Community etwas öffnet, bekommt oben links eine Pille mit dem Namen der Herkunft. Die Tableiste zeigt immer den aktuellen Tab. Kein Wischen vom Rand.
- Ungespeicherte Änderungen fragen beim Zurück einmal nach (Speichern, Als Kopie, Verwerfen), sonst geht Zurück sofort.
- Unterseiten (Profil, Garage, Fahren) haben die Pille „‹ Einstellungen“ und einen Display Titel.
- Leise Taste für Nebenaktionen oben in einer Ansicht (Zurück Pille, Schließen auf Datenschutz, Nutzungsbedingungen und Impressum): Pille auf `surface`, 44 hoch, Inter Bold 15. Unterstrichene Textlinks nur im Fließtext.

**Herkunft und Zustand**
- Übernommene Touren tragen eine Plakette: „Von dir“ in Grün, „Von …“ neutral mit Initiale. Kein Filter dafür.
- Ungelesene Nachrichten: orange Plakette mit Zahl am Community Tab (ab 10 „9+“).
- Profil: Plakette „Sichtbar in der Community“, „In der Community, ohne Karte“ oder „Nicht in der Community“ (Schalter „In Community sichtbar“).

**Einstellungen**
- Profilkarte oben als Fläche mit Pfeil, darunter Gruppen mit grauem Label, Zeilen in einer getönten Fläche mit feinen Trennlinien, Wert rechts grau, Pfeil für Unterseiten, Schalter für An und Aus, Hinweis grau unter der Gruppe (`settings-ui.tsx`: Group, Row, SwitchRow, SubScreen).
- Gefährliches (Konto löschen) als rote Zeile ohne Pfeil, fragt immer nach.

**Karten mit Blatt**
- Umschalter über der Karte (Community) stehen immer fest über der Karte; das Blatt lässt ganz offen Platz darunter (`MapSheet topReserve`).
- Ein einzelner Pin zeigt mindestens etwa 25 km Ausschnitt.

**Gruppenfahrt**
- Funk und Halt sind zwei Funktionen mit zwei Formen: Funk rund und orange, gedrückt halten; Halt helle Pille oben rechts unter der Abbiegekarte, einmal tippen, Gründe fächern nach unten auf.
- Banner oben: „Du sprichst“ orange, „Timo spricht“ dunkel mit grüner Welle, „Funk getrennt“ gelb.
- Funk und Navigationsansage nie gleichzeitig; Funk geht vor.
- Blatt der Lead nach Art des Inhalts: Status nur lesen (Kreise mit Abstand), Aktionen für alle als Kacheln, Einstellungen als Schalter, Seltenes als Textzeilen; dort auch „Tour für alle beenden“, rot und immer mit Rückfrage.
- Gruppen Bedienung erscheint nur, wenn wirklich jemand mitfährt.

**Navigation**
- Karte zoomt ab 50 km/h langsam heraus, mit zwei Fingern zoomen und zentriert bleiben; CarPlay macht dasselbe.
- Keine 3D Gebäude über der Routenlinie.
- Bewertung nach der Fahrt mit fünf Sternen, darunter das Wort (Enttäuschend bis Sensationell).

**CarPlay**
- Jede Änderung an Karte und Navigation wird für CarPlay mitgedacht und dort genauso umgesetzt, soweit CarPlay es zulässt.

## Haptik (entschieden am 10.11.2026, ab Build 21)
- Nur wenn der Finger etwas bewegt oder einen Zustand auslöst; keine Haptik für normale Taps, pro Geste ein Impuls außer Rastungen.
- In der Fahrt nur der Funk (das Handy steckt in der Halterung, CarPlay hat keine Haptik).
- Punkte verschieben: leicht beim Abheben, Rastung bei jeder neuen Position, weich beim Ablegen.
- Losfahren: ein kräftiger Impuls. Langer Druck auf die Karte: leicht, wenn der Punkt sitzt. Funk: fest beim Drücken, leicht beim Loslassen.
- Tokens in `lib/haptics.ts` (abheben, rastung, ablegen, losfahren, punkt, sendung, sendungEnde).

## Namen (10.11.2026)
- Der Tab heißt „Touren“ (früher Meine Touren), in allen Texten gleich: „Unter Touren gespeichert“, „Aus Touren entfernt“. „Routen“ ist der Reiter in der Community.
- Tableiste mit eigenen Symbolen (`tab-icons.tsx`): Raster 24, Strich 1,8, aktiv gefüllt und 2,0.
