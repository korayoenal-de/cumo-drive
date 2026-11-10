# CUMO DRIVE ToDos

Stand: 10. November 2026, 18:00

## Für Koray

* [ ] Funk mit Build 20 zu zweit testen (zwei Konten, Gruppenfahrt mit Einladung, Mikrofon erlauben)
* [ ] Gregor: Ort der Ortsdurchfahrt und Screenshot zur Tempowarnung nachreichen lassen
* [ ] WeatherKit: developer.apple.com, Identifiers, de.rallycumo.drive, WeatherKit unter Capabilities UND App Services anhaken
* [ ] Restliche Screenshots für die Landingpage, Web Zip per FTP hochladen
* [ ] DNS für routing.cumodrive.de und Domain für den Web Planer
* [ ] Apple Bezahlvertrag und RevenueCat
* [ ] Impressum (Anschrift, Rechtsform), Datenschutz und AGB mit dem Anwalt klären; dabei LiveKit und Expo Push als Empfänger prüfen
* [ ] Echte Netto Fahrzeiten für die Kalibrierung
* [ ] Liste der Gründungstester (Konto Mail oder Anzeigename) vor der Veröffentlichung
* [ ] 3D Designer für die Fahrzeug Formen beauftragen (heute Kenney Car Kit, CC0)
* [ ] Booking.com Partnerprogramm
* [ ] CarPlay: Namen der Knöpfe, Rundtouren aus dem Auto automatisch speichern, Community Touren in der Liste im Auto
* [ ] Lizenz der Esri Satellitenkarte im Web klären

## Als Nächstes (Claude)

* [ ] Lead Blatt nach dem Prototyp (Status, Kacheln, Schalter, Seltenes); Navigationsansagen warten auf freien Funk
* [ ] Build 21 läuft (CarPlay Zoom bei Tempo, Haptik); danach Profilfoto (expo-image-picker ist ab Build 19 drin)
* [ ] Vermeiden als feste Einstellung, Impressum als Seite
* [ ] Ortssuche in Routen auch über den Streckenverlauf, nicht nur den Start
* [ ] Melden und Blockieren in der Community
* [ ] Lernen Stufe 2: nächtliche Auswertung der Signale
* [ ] Kombi als Fahrzeug Form, Fürth in die großen Städte der Ortsdichte
* [ ] Fahrzeug Symbol in CarPlay verfeinern, Sperrung voraus automatisch umfahren

## Erledigt am 10.11.

* [x] Push bei Nachrichten, Chat, Einladungen und Anfragen (Build 19), Plakette ungelesen am Community Tab
* [x] Funk über LiveKit (Build 20): gedrückt halten, Banner, einer spricht, Funk stumm, Nur die Lead spricht
* [x] Halt der Lead als Pille oben rechts, Grund Sammeln; Gruppen Bedienung nur mit Mitfahrern
* [x] Einstellungen neu mit Profil, Über mich und Schalter In Community sichtbar
* [x] Community: Umschalter fest, Ortssuche 50 km, Karte bei einem Pin, Plaketten Von dir, alte Touren zurückgezogen
* [x] Zurück Navigation mit Pille, keine Duplikate beim Start
* [x] Navigation: Weg zur Tour um Orte herum, keine 3D Gebäude über der Linie, Zoom bei Tempo und mit zwei Fingern
* [x] Nach der Fahrt: Karte scrollt, Bewertung mit fünf Sternen
* [x] TomTom Kontingent 20.000 im Monat, Fahrregionen, Signale zum Lernen, Datenschutz ergänzt
* [x] Haptik gezielt (Punkte verschieben, Losfahren, langer Druck, Funk), Build 21 gestartet
* [x] Planen: Suche zeigt nur orange Punkte wie die Rundtour
* [x] Expo Starter Plan, Push bei Apple eingerichtet, Dokumentation auf Stand

## Backlog

* [ ] **Gründungstester 12 Monate frei (Entscheidung Koray, 10.11.):** Freischaltung über das eigene Konto statt Apple Offer Codes; Feld „frei bis“ in Supabase oder Promotional Entitlement in RevenueCat; Plakette „Gründungstester“; gleiche Technik später für Club Lizenzen.
* [ ] **Rundtour mit Auswahl (Idee Tester Tom, 9.11.):** zwei bis drei Alternativen am Ende des Ladens, Runden mit sehr niedrigem Fahrspaß gar nicht anbieten.
* [ ] Glossar und Wording mit eigenen Definitionen
* [ ] Schalter Bremshinweis an und aus in den Einstellungen
* [ ] Lernende Bewertung Stufe 3 und 4: neue Strecken aus häufig sensationell gefahrenen Abschnitten, echte Fahrzeiten aus den Spuren
* [ ] Planen im Auto (CarPlay), bewusst nach hinten gestellt
* [ ] Wetter Hinweis freundlicher formulieren, sobald WeatherKit läuft
* [ ] Hotel Kacheln mit Sternen beim nächsten Server Import

## Hotel Integration (Konzept, Koray 8. und 9.11.)

1. **Kostenfrei:** Hotels aus OpenStreetMap; für Sportwagenfahrer zählt vor allem ein großer, bewachter Parkplatz.
2. **Booking.com Affiliate:** Link je Hotel mit Partner ID.
3. **Booking.com Partner API:** Fotos, Bewertungen und Preise in der App, wenn die Nutzerzahlen stimmen.
4. **Partnerhotels:** Sportwagen freundliche Hotels direkt unter Vertrag, bevorzugt angezeigt; Kennzeichnung mit dem Anwalt klären.

Nicht gewählt: Google Places (EU Regeln verbieten Places Inhalte mit fremden Karten).

## Apple und Builds

* Einzelperson, Team ID N9DX399W33, Bundle ID de.rallycumo.drive, Runtime 1.1.0
* In TestFlight: Build 16 (CarPlay Start), 19 (Push), 20 (Funk); Expo Starter Plan
* OTA nur nach Korays OK aus einem sauberen Arbeitsstand ohne .env

## Routing Server

* Contabo Cloud VPS, 13.140.213.164, GraphHopper 11, Dienst cumo-routing
* Neuaufbau wöchentlich So 3 Uhr; App plant solange über Valhalla
* Breite unter 3 m bleibt auf dem Server ausgeschlossen; Ausnahmen nur über kuratierte Strecken in der App
