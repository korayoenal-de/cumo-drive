# calimoto Web Planer: Funktionsumfang und was CUMO DRIVE übernimmt

Stand: 4. November 2026, angesehen im Web Tourenplaner mit Korays Tour "RCO EAST 26 E3".

## Was calimoto im Web kann

**Tour planen (Hauptansicht)**
* Große Karte links, Seitenleiste rechts mit Tourname (umbenennbar), Länge, Fahrzeit und Kurvenzahl
* Wegpunkte als Liste: Start, nummerierte Via Punkte, Ziel. Jeder Punkt als Adresse editierbar, Punkte auch auf der Karte setzbar
* Routing Profil **pro Abschnitt** zwischen zwei Punkten: Schnell, Ohne Autobahn, Kurvig, Superkurvig
* Hinweis pro Abschnitt "Gesperrte Straße (n)" mit aufklappbarer Liste der Straßennamen
* Menü Vermeiden: Fähren, Mautstraßen, Gesperrte Straßen (alles standardmäßig aus)
* Rückgängig, Wiederherstellen, Tour umkehren
* Teilen, GPX Export, Datei Export
* Speichern oder Verwerfen

**Karte**
* Kategorien als Chips über der Karte: Tankstellen, Gebirgspässe, Essen und Trinken, Sehenswürdigkeiten, Kurvenkombis, Bikertreffs, Campingplätze, Unterkünfte
* Gesperrte Straßen als rote Symbole auf der Karte
* Fotos der Community als runde Vorschaubilder entlang der Route
* Adresssuche, Standort, Zoom, Kartenebenen

**Rundtour erstellen**
* Start, Länge per Regler (bis 500 km) oder Zufall, Richtung als Kompass mit 8 Richtungen oder Zufall

**Einstellungen**
* Einheit (Kilometer)
* Auf der Karte anzeigen: gesperrte Straßen, eingeschränkte Straßen, Fähren, Mautstraßen
* Intelligente Via Punkte, Mausklick setzt Via Punkt oder Ziel
* Gefahrene Touren, Gefahrenstellen (Daten von Blitzer.de und SCDB.info), Calimeter, Favoriten anzeigen

**Sonstiges**
* Meine Touren, Favoriten, Touren entdecken (Community Touren), App Download
* Gruppenfahrt: Einladen nur in der App, im Web nur ein Hinweis mit QR Code

## Was wir übernehmen, und wo wir besser werden

| Funktion | Übernehmen | Unser Unterschied | Stufe |
| --- | --- | --- | --- |
| Web Planer mit großer Karte und Seitenleiste | ja | gleiche Daten wie die App, Touren sofort auf dem Handy | MVP |
| Wegpunkte als Liste mit Abschnitten | ja | Abschnitt zeigt Breite, Belag, Kurven, nicht nur km und Zeit | MVP |
| Profil pro Abschnitt | ja | Sportwagen Profile: Kurvig, Pässe, Entspannt, dazu Breitenregler | MVP |
| Gesperrte Straßen | ja, **standardmäßig meiden** | calimoto warnt nur und plant trotzdem durch (Resia auf E3) | MVP |
| Etappen Check | neu | jede Route wird vor dem Speichern geprüft, rote Abschnitte mit Grund | MVP |
| Vermeiden: Fähren, Maut | ja | dazu Kopfsteinpflaster, Schwellen, Ortsdurchfahrten | MVP |
| Rückgängig, Umkehren | ja | | MVP |
| GPX Import und Export | ja | Import prüft die Route sofort (Etappen Check) | MVP |
| Teilen per Link | ja | Link öffnet die Tour in App oder Web | MVP |
| Kategorien auf der Karte | ja | Super Plus Tankstellen, Aussicht mit Parkplatz, Pässe mit Sperrzeiten, Hotels mit Stellplatz | MVP Teil, Rest später |
| Rundtour mit Länge und Richtung | ja | Dauer statt nur km, Richtung als Region oder Tipp auf die Karte | später |
| Gruppenfahrt im Web | besser | im Web planen und Teilnehmer per Link einladen, nicht nur in der App | später |
| Gefahrenstellen, Blitzer | ja, nach Land | nur wo legal, als abschaltbares Modul | später |
| Community Fotos, Touren entdecken | später | kuratierte Sportwagen Strecken statt Masse | später |
| Roadbook Export | neu | Roadbook wie für den CDC auf Knopfdruck | später |

## Technische Folgerung für das Web

Die App ist mit Expo gebaut, das auch Web kann. Ein Code für App und Web ist der schnellste Weg für ein Zweierteam:
* Web: Planer mit Karte links und Seitenleiste rechts, Karte über MapLibre GL JS
* App: Fahren, Gruppe, Funk; Planung ebenfalls möglich, aber kompakter
* Die Routen Logik (Profile, Etappen Check) läuft später auf dem Server, damit Web und App dieselben Ergebnisse liefern
