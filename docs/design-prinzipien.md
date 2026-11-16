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
* Bedienelemente ändern ihre Größe höchstens um `Motion.pop` (2 Prozent): Puls beim Speichern, Punkt beim Ziehen (die Hälfte). Gedrückt immer `Motion.pressScale` (98,5 Prozent), überall gleich. Das sind 20 Prozent der früheren Ausschläge (3 bis 15 Prozent).
* Eigene Werte haben nur die Navigationssymbole (Puls 6 Prozent nach dem Aufbau, 10 Prozent bei Symbolen ohne Pfeil) und der Stern der Legende im Fahrspaß Pegel (125 Prozent).
* Pfeil kurz vor dem Manöver: die Linie baut sich bis zur Basis der Spitze auf, dann füllt sich die ganze Spitze auf einmal, danach der Puls. Umgebung und schwacher Pfeil liegen in einer Ebene, so ist im Kreisverkehr nur ein Weg zu sehen.
* Bei „Bewegung reduzieren“ nur Deckkraft, kein Aufbau, kein Puls.

### Wann sich etwas bewegt (Regeln vom 11.11.2026)
Bewegung ist ein Akzent, kein Schmuck. Sie steht nur dort, wo sie etwas erklärt. Es gibt genau sechs Anlässe:

1. **Auswahl gleitet.** In einer festen Leiste gibt es eine einzige Markierung, und sie wandert zur neuen Auswahl: Tab Leiste, Glaspille in der Community. Eine Feder (`snap`) für jede Entfernung, über drei Plätze also dreimal so schnell wie zum Nachbarn. Beim ersten Erscheinen steht sie sofort richtig.
2. **Der Finger führt.** Was man zieht, folgt dem Finger eins zu eins und rastet beim Loslassen mit `snap` ein: Blatt, Richtungsregler, Bewertungsregler, Punkte. Das läuft auf dem UI Thread, damit es auch beim Planen nicht hakt.
3. **Aufklappen am Ort.** Optionen erscheinen dort, wo getippt wurde, gestaffelt mit EASE_OUT (siehe oben). Der Rest rückt mit `SOFT_LAYOUT` nach.
4. **Zustand wird Ergebnis.** Laden und Ergebnis stehen an derselben Stelle und gehen ineinander über: Zurück Pille beim Anpassen, Ladeknopf, Speichern.
5. **Druck.** Jede Taste gibt mit `pressScale` nach, auch Chips.
6. **Bedeutung.** Eigene Animationen haben nur der Manöverpfeil, die Legende im Fahrspaß Pegel und der Ladekreis.

Bewusst ohne Bewegung:
* Chips und Textreiter (Tour planen, Rundtour) wechseln sofort. Sie liegen einzeln, dort gibt es keine Fläche, die wandern könnte.
* Seiten und Listen blenden beim Tabwechsel nicht ein. Inhalt ist sofort da (Prinzip 8).
* Keine Dauerschleifen außer beim Laden. Nie zwei Bewegungen gleichzeitig, die um Aufmerksamkeit bitten.
* Inhalt federt im Blatt nicht über seine Enden hinaus: oben übernimmt das Blatt, unten endet er, wo er endet.

### Gesten im Blatt (11.11.2026)
* Ein Element, das man zieht, entscheidet beim Aufsetzen des Fingers, ob es die Berührung nimmt. Nimmt es sie, scrollt für diese Berührung nichts. Beispiel Richtungsregler: Ring und Beschriftung gehören dem Regler, Mitte und Ecken der Seite.
* Waagerechte Regler nehmen nur waagerechte Bewegung, senkrecht scrollt die Seite weiter (Bewertungsregler).
* Klein und halb zieht jede senkrechte Bewegung das Blatt. Ganz offen scrollt der Inhalt; steht er oben, folgt das Blatt beim Runterziehen dem Finger.
* Passt der Inhalt ganz hinein, scrollt nichts.

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

## Konsistenzprüfung 15.11.2026 (entschieden von Koray, Quiz „Design Entscheidungen“)

Leinwand „Konsistenzprüfung App“ mit allen Screens und Blättern. Gilt ab Commit 36a6e97.

**Kerndaten**
- Reihenfolge überall: Wann, Wo, Strecke, Fahrzeit, Fahrspaß, Plätze. Wann und Wo nur bei Ausfahrten, Plätze nur vor der Fahrt. Kennzahlen stehen direkt unter dem Titel, die Karte danach.
- Eine Komponente `Kennzahlen` (`components/ui/kennzahlen.tsx`): Label 15 grau über dem Wert, Wert Archivo 22 in Versalien. Leitzahl 28 nur im Planer Ergebnis (`Stats` mit Erklärung des Werts).
- Fahrspaß überall, wo eine Tour gezeigt wird, auch bei Ausfahrten (`lib/ride-fun.ts`). Vor der Fahrt keine Kurvenzahl; Kurven nur in der Fahrtstatistik, Kehren nur bei Pässen.
- Formate aus `lib/format.ts`: Fahrzeit „2:57 h“ (Kennzahl „2:57 H“), unter einer Stunde „45 min“, nie Minuten über 60 und nie „2 h 57“. Strecke „148 km“, unter 10 km „8,4 km“. Termin in Zeilen „Heute 10:00“, „Morgen 10:00“, sonst „Fr 20. Nov. 10:00“, ausgeschrieben nur im Detail. „Uhr“ nur im Satz. Gespeichertes und Gefahrenes „12. Nov.“, aus anderen Jahren mit Jahr.
- Werte in einer Zeile mit Mittelpunkt, Komma nur im Satz. Leere Werte fallen weg, kein Strich als Platzhalter.
- Plätze aus Sicht der Teilnehmer als Plakette (`SeatsBadge`): „4 Plätze frei“ grün, „1 Platz frei“ gelb, „Ausgebucht“ grau.
- Treffpunkt ist immer ein Ort, ohne Wahl der Ort am Start der Tour. In Zeilen „ab Gmund“. Rückkehr nur bei A nach B als „Ankunft in Imst“, bei Runden nicht.

**Blätter und Aktionen**
- Orange Zeile (`primary`) nur in Rückfragen mit klarer Empfehlung, etwa „Speichern und zurück“. Optionen zu einem Objekt und Auswahlblätter sind neutral, die Empfehlung steht oben.
- Zweite Zeile (Hinweis) nur bei Auswahl zwischen Wegen, wenn andere etwas merken, und beim Umfang von Gefährlichem. Sonst keine. Gleiche Aktion, gleicher Text.
- Teilen ist eine Zeile, die ein Auswahlblatt Link, GPX, KML öffnet (`components/tours/share-sheet.tsx`).
- Ausnahme 15.11. (Koray): In der Community heißt der Knopf oben „+ Teilen“ und meint In der Community teilen (veröffentlichen). Er öffnet eine Auswahl der eigenen Touren plus „Neue Tour erstellen“; das Blatt zum Veröffentlichen ist dasselbe wie in der Tourkarte (`PublishSheet`). Knöpfe im Kopf der Community: Plus mit Verb (Anlegen, Teilen) oder Ziel (Nachrichten).
- Verben: Löschen (für immer), Entfernen (nur hier weg), Verwerfen (nie gespeichert). Rückfragen immer als Frage.
- Detailseiten tragen die Hauptaktion fest unten, eine je Phase. Ausfahrt: Route zum Treffpunkt, am Tag Jetzt losfahren, während der Fahrt Zur Navigation, danach Nochmal fahren.
- Zurück überall als Pille mit Herkunft (`components/ui/back-link.tsx`), ohne bekannte Herkunft „Zurück“.

**Icons**
- SF Symbols in 16 (Text, Plaketten, Zurück, Schließen) und 20 (Zeilen, Blätter, runde Tasten), immer semibold. Ausnahmen: Sterne der Bewertung und Wetter 40, Manöver eigene Zeichnung.
- Je Bedeutung ein Symbol: Link `link`, Teilen und GPX `square.and.arrow.up`, Kurvig Kurvenpfad, Veröffentlichen `globe`, Lead `person.line.dotted.person`.

**Farben und Schrift**
- `danger` #FF5A52 und `dangerTint` für Fehler und Endgültiges, die Bestätigung beim Löschen ist rot. Signal Orange bleibt der Hauptaktion und den Strecken.
- Datumsblock neutral, nur heute in Orange.
- Namen von Menschen nie in Versalien, auch groß im Profil (Koray 15.11.); Versalien bleiben Tournamen, Überschriften und Kennzahlen.
- Plaketten nur mit Inhalt: keine 0 (Koray 15.11.).
- Nebenzeilen und Hinweise 15 pt (`caption` Variante). 13 pt nur über `Type.caption` auf Karte, Plaketten und in der Tab Leiste.
- Neue Tokens `textSoft`, `danger`, `dangerTint`; keine festen Farbwerte außerhalb von theme.ts außer Verkehrszeichen, Pegel Verlauf und Live Activity.

**Glossar**
- Tour: gespeichertes oder geplantes Objekt, auch in der Community (Reiter „Touren“). Runde: Tour mit gleichem Start und Ziel. Route: nur der Weg (Route zum Treffpunkt). Knopf im Planer „Tour erstellen“.
- Strecke und Fahrzeit überall statt Länge und Dauer.
- Highlight: kuratierte Strecke oder Pass mit Ansage. Traumstraße bleibt nur die Pegelstufe.
- Kurven zählen alle Kurven einer Fahrt, Kehren nur Spitzkehren am Pass.
- Ausfahrt: Termin mit Treffpunkt. Gruppenfahrt: gemeinsame Navigation mit Live Karte und Funk.
- Organisator legt an, Lead führt und startet, Teilnehmer sind alle Leute einer Ausfahrt. Drivers nur als Community Reiter. Nachricht statt Anschreiben.
- Lob am Ende: „Starke Runde!“ nur bei Runden, sonst „Angekommen in Imst“, zum Treffpunkt „Du bist am Treffpunkt“.

## Pflicht für jede Neuerung (Koray 15.11.2026)

Jede neue Funktion, jeder neue Screen und jede Änderung folgt dem Design System und den Regeln oben, vor allem der Konsistenzprüfung vom 15.11. So bleibt die App konsistent und neue Funktionen werden ordentlich eingebunden. Vor dem Commit prüfen:

1. Bausteine wiederverwenden statt nachbauen: `Kennzahlen`, `SeatsBadge`, `BackLink`, `ActionSheet` und `ConfirmSheet`, `ShareSheet`, `Chip` und `ChipRow`, `Screen`, `MapSheet`, Formate aus `lib/format.ts`, Farben und Maße nur aus `constants/theme.ts`.
2. Kerndaten in der festen Reihenfolge, Kennzahlen direkt unter dem Titel, die Karte danach.
3. Eine Hauptaktion je Ansicht, auf Detailseiten fest unten; Optionen zu einem Objekt im Blatt, Gefährliches rot unten mit Rückfrage als Frage.
4. Wörter aus dem Glossar (Tour, Runde, Route, Strecke, Fahrzeit, Highlight, Teilnehmer, Organisator, Lead, Löschen, Entfernen, Verwerfen), Du Form, keine Gedankenstriche.
5. Icons 16 oder 20 semibold, ein Symbol je Bedeutung; Typografie Mittelweg; Hinweise 15 pt.
6. Bewegung mit den Motion Tokens, gezielt statt überall.
7. Mit Kartenbezug immer CarPlay mitdenken.
8. Weicht etwas bewusst ab: hier als Ausnahme mit Datum und Grund eintragen, nicht still abweichen.
