# Routen Check 17.11.2026: Auswertung

51 Routen, 26 ohne Befund, 20 mit Hinweis, 5 mit Fehler (Vortag 8 Fehler). Beide Routing Server antworten, Planung im Schnitt 4 s.

## Fazit

Die festen Fälle laufen stabil, Pässe und Traumstrecken werden auf allen Passrouten bevorzugt (Sellaronda, Fünf Pässe, Stilfser Joch, Klausen jeweils 87 bis 100 % Traumstrecken und Pässe). Der Fix „Pass als Zwischenziel wendet auf der Passhöhe“ wirkt: die Fünf Pässe Dolomiten fahren nicht mehr 9,6 km doppelt, sondern 0 km. Die Schwachstelle bleibt die Rundtour ab Orten in Tälern: Längen weit neben dem Wunsch (Ponte di Legno 376 statt 240 km, Lienz 222 statt 110 km) und Hin und zurück Stücke, die die Prüfung teils gar nicht sieht (Spittal). Echte Probleme heute: 6, dazu 3 Verdachtsfälle.

## Echte Probleme

1. **Rundtour Ponte di Legno 240 km wird 376 km** (Fehler). Die Runde zieht nach Südosten bis in die Gegend von Rovereto (45,89 N, 11,16 O) und zurück über Croce Domini. Auch das Ersatzangebot hin und zurück passt nicht (319 km über Kaunertaler Gletscherstraße). Vermutung: die Rundtour Auswahl in `app/src/lib/smart-roundtrip.ts` verwirft zu lange Varianten nicht, sondern nimmt die mit der besten Bewertung. Vorschlag: Varianten über 130 % hart aussortieren und mit kleinerem Radius neu würfeln; für hin und zurück ein Ziel nahe der halben Wunschlänge wählen (ab Ponte di Legno böten sich Gavia und Stilfser Joch an, etwa 240 km).
2. **Rundtour Spittal 70 km fährt Liesertal hin und zurück** (Fehler, unterschätzt). Von Spittal nach Norden bis Gmünd (46,91 N, 13,53 O) und auf fast derselben Linie zurück, insgesamt rund 25 km. Die Prüfung zählt nur 3 km, weil A10 und B99 parallel im Tal laufen. Vermutung: die Stichstraßen Erkennung in `app/src/lib/doubled.ts` (Toleranz 45 m) sieht parallele Straßen im selben Tal nicht, deshalb plant `smart-roundtrip.ts` auch nicht ohne den Stich neu. Vorschlag: zusätzlich Gegenrichtung im selben Korridor (unter 400 m Abstand, über 3 km) als Stich werten.
3. **Rundtour Cortina 120 km: Stich bei Agordo** (Fehler, 2,4 km doppelt bei 46,285 N, 12,045 O). Der Wendepunkt der Runde liegt südlich von Agordo in einer Sackgasse. Vermutung: der Via Punkt aus der Rundtour Auswahl wird nicht auf eine Durchgangsstraße gelegt, und die Neuplanung ohne Stich (Schritt 3 der Rundtour Auswahl) greift nicht. Vorschlag: in `smart-roundtrip.ts` prüfen, warum die Neuplanung hier ausbleibt; Via Punkte nur auf Straßen mit zwei Ausgängen setzen.
4. **Rundtouren treffen die Wunschlänge in Tälern schlecht** (Hinweise, App fragt nach): Lienz 110 → 222 km, Sölden 180 → 275 km, Lugano 80 → 126 km (wie am 16.11.), Andraz 170 → 107 km. Bei Andraz ist das besonders schade, das Passnetz der Dolomiten gäbe 170 km locker her (Giau, Fedaia, Pordoi, Sella, Gardena). Vorschlag: in `smart-roundtrip.ts` bei zu kurzen Runden gezielt einen weiteren Pass aus der Nähe als Via Punkt einbauen, bei zu langen den entferntesten Pass weglassen, bevor die Rückfrage kommt.
5. **Rundtour Linthal 160 km kehrt durchs Linthtal zurück** (Fehler, 2,8 km doppelt zwischen Linthal und Schwanden, 46,94 bis 46,96 N, und bei Netstal 47,03 N). Linthal liegt im Sackgassental, der zweite Ausgang wäre der Klausenpass. Die Runde nimmt Pragel, Ibergeregg und Sattelegg, aber nicht den Klausen. Vorschlag: bei Start im Tal mit Passausgang (`smart-roundtrip.ts`) den Pass als Hin oder Rückweg erzwingen; das macht aus dem Stich eine echte Runde.
6. **Rundtour Bensheim 120 km mit 40 % in Orten** (43 km, fester Fall, Korays Hausrevier). Die Bergstraße am Start erklärt einen Teil, der Rest liegt in Odenwald Dörfern. Vermutung: die Ortsdichte auf dem Server wirkt mit distance_influence 15 noch zu schwach. Vorschlag: den geplanten Schritt Kurvig auf distance_influence 5 umsetzen (Server, nach Korays OK) und Bensheim danach erneut vergleichen.

### Verdachtsfälle (bitte auf dem Gerät ansehen)

* **Grimsel Furka Susten**: 0,9 km Wende am Grimselpass. Vermutung: die Passkoordinate in `app/src/data/passes.json` liegt neben der Durchgangsstraße (Hospiz oder Parkplatz). Vorschlag: Passpunkte auf die Straße einrasten.
* **Rundtour Prad 100 km**: Schlenker von Santa Maria nach Westen bis Valchava (46,61 N, 10,38 O) und zurück, etwa 6 km. Vermutung: eine bevorzugte Strecke im Val Müstair zieht die Planung an.
* **Rundtour Chur 150 km**: zwei Schlenker im Prättigau bei Küblis und Saas (46,916 N, 9,768 O und 46,911 N, 9,806 O). Vermutung: alte Ortsdurchfahrt statt Umfahrung.

## Fehlalarme und bessere Prüfung

* **Klausenpass** (46,910 N, 8,983 O): echte Kehrschleife oberhalb Linthal, seit 16.11. als loop_ok erlaubt. Vorschlag: `smallLoops` in `qa/daily/run.ts` überspringt Stellen auf Strecken mit loop_ok.
* **Lienz** (Plöckenpass, 46,598 N, 12,946 O), **München nach Tirol** (Zirler Berg, 47,270 N, 11,259 O), **Bozen** (Cencenighe, 46,354 N, 11,966 O): Kehren oder Abzweig im Pass. Vorschlag: Schleifen innerhalb von 2 km um eine Passhöhe oder auf einer Passstrecke nicht melden.
* **Doppelt nahe Start**: Andraz (1 km Zufahrt zum Dorf), Bozen (0,5 km bei Kardaun), Annecy und Chur (je 0,3 km). Vorschlag: Ausnahme um zu Hause nicht fest 1,5 km, sondern bis zur ersten Kreuzung mit einer Durchgangsstraße, höchstens 4 km.
* **Umweg bei Col du Granier nach Col du Glandon und Colle Fauniera nach Col Agnel**: im Hochgebirge gibt es keinen direkten Weg, die Routen sind sinnvoll. Vorschlag: `maxDetour` für Pass zu Pass Fälle auf 3,5.
* **München nach Innsbruck mit 43 % Autobahn**: der Weg über Kesselberg und Seefeld ist kürzer als über Kufstein und plausibel. Vorschlag: Kraftstraßen (B2, B177) als schnell mitzählen. Ob der Kesselberg statt Garmisch im Profil Schnell gewollt ist, bitte entscheiden.
* **Orte 30 bis 33 %** bei Schwarzwaldhochstraße, Baden-Baden, Garmisch 190, Annecy, Klausen nach Oberalp, Ponte di Legno, Sölden: großteils Start und Ziel im Ort. Vorschlag: die ersten und letzten 5 km nicht mitzählen; Annecy und Lugano als Startstadt in `allowCities` aufnehmen.

## Gegenüber dem Vortag

* Feste Fälle: alle gleich bis auf Fünf Pässe Dolomiten (100,4 → 94,6 km, doppelt 9,6 → 0 km, ohne Befund). Keine Verschlechterung.
* Lugano 80 km bleibt bei 126 km mit 45 % Orten (schon am 16.11. auffällig).
* Gesamt: Fehler 8 → 5, Hinweise 19 → 20, Fahrspaß im Schnitt 68 → 67, Traumstrecken und Pässe 40 → 41 %. Die 20 wechselnden Fälle sind neu gewürfelt und nicht direkt vergleichbar.
