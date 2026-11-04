# CUMO DRIVE Projektkontext

Stand: 4. November 2026

## Idee

Navigations App für Sportwagenfahrer, ein "calimoto für Autos". calimoto ist für Motorräder gebaut und schickt Autos teils über Straßen, die zu schmal sind oder schlechten Asphalt haben. CUMO DRIVE plant kurvige Strecken, die zu Sportwagen passen, und bringt Gruppenfahrt mit Funk direkt mit.

Ursprung: Im CUMO DRIVERS CLUB (CDC) laufen heute calimoto (Navigation), Zello (Funk) und WhatsApp parallel. Der CDC ist Testfeld und erster Vertriebskanal.

## Von Koray festgelegt

* Plattformen: iOS und Android, dazu CarPlay und Android Auto
* Weboberfläche ist essentiell, für die größere Tourenplanung am Rechner
* Zwei Fahrmodi: **Allein** (schnelle Feierabendrunde, ohne Gruppenfahrt und ohne Funk) und **Gruppe** (andere live sehen, Walkie Talkie)
* Gruppenfahrt mit Walkie Talkie Funktion zu den Team Mates
* Rundtour (zum Beispiel 50 km Richtung Osten ab Standort) inklusive KI Formular
* UI minimalistisch im Stil von Rally Cumo und Trade Republic
* Eigenes Design System für die App, getrennt vom CDC Design System
* Ziel: mit der App Geld verdienen
* Entwicklung nur durch Koray und Claude, kein weiterer Entwickler. Claude programmiert, Koray steuert, gestaltet, testet auf echten Touren und kümmert sich um Freigaben
* Schmale Straßen sind ausdrücklich erwünscht, aber nur bis zu einer klaren Untergrenze
* Blitzerwarnungen nur in Ländern, in denen sie legal sind
* KI unterstützte Routenplanung, zum Beispiel Super Plus Tankstellen und schöne Aussichtsparkplätze entlang der Route
* Daten und Projekte bleiben auf Korays MacBook (Ordner ~/CUMO_DRIVE), Code zusätzlich im privaten Repo github.com/korayoenal-de/cumo-drive

## Vorschläge von Claude (noch nicht bestätigt)

* Technik: React Native mit Expo für App und Web aus einem Code, MapLibre für die Karte, Routing im Prototyp über Valhalla (öffentlicher FOSSGIS Server), später eigener Server mit Sportwagen Profil (GraphHopper Custom Model oder Valhalla), Supabase für Konten, Touren und Live Positionen. CarPlay und Push to Talk brauchen nativen Code
* Breitenregler mit drei Stufen: breit, schmal okay, Abenteuer
* Vorschlag für die Untergrenze: schmal okay, solange zwei Autos aneinander vorbeikommen, ohne dass einer in die Wiese muss. Einspurige Wege mit Ausweichbuchten und Feldwege sind raus
* Blitzerdaten als eigenes, komplett abschaltbares Modul
* Preise als Arbeitsannahme: Basis kostenlos, Premium 49 € pro Jahr oder 7,99 € pro Monat, Club ab 299 € pro Jahr, Tour Pass ab 9 € je Teilnehmer und Tour; Saisonpass prüfen

## Ergebnisse

### Design Canvas "Sportwagen App Screens"

https://claude.ai/artifact/AxTLv2GyqXAcxuKrWmDBsa

Sechs Artboards: Entdecken, Tour planen, Navigation, Gruppe und Funk, CarPlay, Tour beschreiben (KI). Alle Zahlen und Namen sind Beispielwerte, der App Name ist ein Platzhalter.

| Token | Wert |
| --- | --- |
| Grund | #0B0B0C |
| Fläche | #161618 |
| Fläche 2 | #1F1F22 |
| Linie | #2A2A2E |
| Text | #F4F4F2 |
| Gedämpft | #9A9A9F |
| Signal | #E2461C |
| Gut | #4CC38A |
| Warnung | #E8B03A |

Schrift: Archivo (Gewicht 900) für Titel und große Zahlen, Inter für Text.

### Business Konzept

https://claude.ai/artifact/Pp9MfaDL4Qnj3AFkazfy3c

* Wettbewerb: calimoto (Motorrad, testet KI Tourplanung als Beta), DriveGo (Auto, kurvige Routen, CarPlay, Konvoi mit Sprache, Abo), ROADS by Porsche (kostenlos, KI Routen, CarPlay), Zello (nur Funk)
* Vorsprung: Datenqualität bei Breite und Belag, kuratierte Strecken, Zugang über Clubs und Veranstalter
* Beispielrechnung: rund 230 zahlende Premium Nutzer decken den Betrieb, bei etwa 1.500 Nutzern und 20 Clubs bleiben rund 50.000 € im Jahr
* Roadmap in vier Phasen mit Gates: 1 Validieren, 2 MVP bauen, 3 Beta mit Clubs, 4 Launch

### Etappen Check, RCO EAST 26 Etappe 3

* Koray: rund 18 km vor der slowenischen Grenze waren eine Katastrophe, eher Wald oder Radweg
* Befund: Val Resia über Carnizza bis Uccea, km 156 bis 172. OSM führt die Straße als asphaltierte Nebenstraße, die Signale stecken im Detail (Höchstbreite 2,20 m, Pfad, Furt am Carnizzasattel, Schotterweg der schlechtesten Klasse)
* Regel: Nebenstraßen ohne Nummer mit mindestens zwei Sperrsignalen werden als ganzer Abschnitt gesperrt. Damit erkennt der Check genau diese 15,6 km, sowohl auf OSM Daten als auch auf Valhalla Daten im Browser
* calimoto kennt die Sperrung ("Gesperrte Straße: Resia, 909"), plant aber trotzdem durch, weil "Gesperrte Straßen vermeiden" standardmäßig aus ist. Bei uns: standardmäßig meiden
* Bericht: https://claude.ai/artifact/TCYgU23bx94vjsSimA4GLk

### Routing im Prototyp

* Valhalla mit Sportwagen Optionen: keine Autobahn bei Kurvig, keine unbefestigten Wege, keine Wirtschaftswege
* Planen mit Prüfung: Route berechnen, Etappen Check, gesperrte Stellen ausschließen, neu planen
* Via Punkte der Rundtour rasten nur an Straßen ab Klasse tertiary ein; vorher landeten sie auf Forstwegen
* Test Rundtour 50 km Richtung Osten ab Heppenheim: drei Varianten mit 46 bis 57 km, rund eine Stunde, ohne gesperrte Abschnitte
* Erster Prototyp Nordschwarzwald (OSM, eigenes Profil): Sportwagen Profil 3,3 km statt 21,5 km auf vermutlich schmalen Straßen, bei 7 % mehr Strecke

### calimoto im Detail (docs/calimoto-details.md im Repo)

* Stärkstes Werkzeug: Kurvigkeit als Kartenebene. Wir zusätzlich nach Breite und Belag
* Rechtsklick Menü auf der Karte, POI Popups mit "Hinzufügen", Profil pro Abschnitt
* Schwächen: Adresssuche findet keine Pässe, kein Höhenprofil im Planer, Tourbibliothek ohne Suche und Ordner, nur eine POI Kategorie gleichzeitig, Sperrungen ohne Grund und Zeitraum, Gruppenfahrt im Web nur als QR Hinweis
* Preise calimoto: Planen gratis, Premium 59,99 € im Jahr, Saisonpass 39,99 € für 3 Monate

### Blitzerwarnungen nach Land

Grundlage ADAC Übersicht (Stand Mai 2025, ohne Gewähr). Vor dem Start anwaltlich prüfen.

| Modus | Länder |
| --- | --- |
| An | Niederlande, Österreich |
| An, nur aus Kartendaten | Belgien, Luxemburg, Spanien, Tschechien |
| Nur Gefahrenzone | Frankreich |
| Aus | Deutschland, Schweiz, Italien, Polen, Dänemark |

### Korays calimoto Bestand

104 gefahrene Touren (17.174 km) und 87 geplante. Als GPX sind das echte Testdaten und der Grundstock für kuratierte Strecken.

## Offene Fragen

* Wo genau liegt die Untergrenze für schmale Straßen?
* Technikstack bestätigen
* App Name festlegen und Marke prüfen
* Zahlungsbereitschaft bei Fahrern und Clubs
