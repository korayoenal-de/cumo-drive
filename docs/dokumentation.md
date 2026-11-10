# CUMO DRIVE Dokumentation

Stand: 10. November 2026, 17:30. Dieses Dokument ersetzt bei Widersprüchen alle älteren Stände (kontext.md, Kurzfassung vom 5.11.).

## Überblick

CUMO DRIVE ist eine Navigations App für Sportwagenfahrer: ein "calimoto für Autos", das kurvige, für Sportwagen geeignete Strecken plant, Highlights ankündigt und Gruppenfahrten mit Funk mitbringt. Ziel ist Monetarisierung und die schönste, modernste und einfachste App ihrer Art.

Warum: calimoto ist für Motorräder gebaut und schickt Autos über zu schmale Straßen oder schlechten Belag. Im CUMO DRIVERS CLUB (CDC) laufen heute calimoto, Zello und WhatsApp parallel. Der CDC ist Testfeld und erster Vertriebskanal.

Rollen: Koray steuert, gestaltet, fährt und testet als Heavy User und UX Designer. Claude programmiert, recherchiert und betreibt die Technik.

### Stand 10. November 2026

* iOS App in TestFlight: Build 16 (CarPlay Start im Auto), Build 19 (Push), Build 20 (Funk). Runtime 1.1.0, Updates mehrmals täglich per OTA über den Kanal preview
* Web Planer und Landingpage auf dem Stand vom 10.11.
* Eigener Routing Server (GraphHopper 11) auf Contabo mit Ortsdichte, festen Profilen Kurvig und Sehr kurvig, distance_influence 5
* Strecken Datenbank mit 486 kuratierten Strecken (125 Highlights, 361 bevorzugt) in DE, IT, AT, CH, FR und SI, dazu 370 Pässe und 94 Fahrregionen
* Community mit Routen, Ausfahrten und Drivers, private Nachrichten mit Push
* Gruppenfahrt mit Live Positionen, Kurznachrichten, Halt der Lead und Funk über LiveKit
* Tester Gruppe "Cumo Drive App" in WhatsApp, Feedback fließt täglich ein

### Leitlinien von Koray

* Joy of Use, Micro Animationen, aufgeräumtes UI, hochmodern und einfach; Vorbild für die Ruhe: Trade Republic
* Schmale Straßen erwünscht, aber zwei Autos müssen aneinander vorbeikommen (unter 3 m raus, unter 4,5 m prüfen)
* Pässe in DE, AT, CH, IT und FR werden priorisiert; Wintersperren informieren, verhindern nie die Planung
* Schöne Strecken sind lang, ohne Unterbrechung, kurvig, mit gutem Belag und ohne Ortsdurchfahrten
* Verantwortungsvolles Fahren ist Markenkern: kein Tempo Ranking, keine Blitzerwarnungen in Ländern, wo sie verboten sind
* CarPlay wird bei jeder Änderung an Karte und Navigation mitgedacht
* In App, Web Planer und Landingpage wird calimoto nie genannt

## Architektur

App und Web Planer kommen aus einem Code (Expo SDK 58, React Native 0.88, Expo Router, TypeScript, Reanimated). Konten, Touren, Community und Gruppenfahrten liegen in Supabase, geplant wird über den eigenen Routing Server.

Fällt der eigene Server aus (Neuaufbau, wöchentlicher Import), plant die App über Valhalla (FOSSGIS); die Ergebnisse sind dann weniger kurvig und ohne Ortsdichte. Die kuratierten Strecken, Pässe und Regionen liegen als Daten in der App und brauchen kein Netz.

| Ordner im Repo | Inhalt |
|---|---|
| app/src/app | Bildschirme (Expo Router): Tabs, Navigation, Profil, Garage, Fahren, Nachrichten, Ausfahrt, Gruppe |
| app/src/components | Planer, Karte, Navigation, Touren, Community, Einstellungen, UI Bausteine |
| app/src/lib | Routing, Prüfung, Highlights, Bibliothek, Fahrten, Gruppe (ride, funk, invites), Push, Signale, Regionen |
| app/src/data | curated-roads.json, passes.json, regions.json |
| app/carplay | CarPlay (Swift) |
| app/qa | Simulation der Gruppenfahrt (22 Fälle), Testskripte |
| routing/server | GraphHopper Konfiguration und Server Skripte |
| routing/data/roads, routing/scripts | Quellen und Pipeline der Strecken Datenbank |
| supabase | Migrationen und Edge Functions |
| docs | Dokumentation, Prinzipien, Business Analyse, Rechtstexte, AGB Entwurf |

## Funktionen der App

Vier Tabs: Planen, Meine Touren, Community und Einstellungen. Die Tableiste schrumpft beim Scrollen nach unten auf 80 % und wächst beim Hochscrollen wieder. Eine Plakette am Community Tab zählt ungelesene Nachrichten.

### Planen

Volle Karte mit ziehbarem Blatt (drei Höhen). Zwei Modi als große Reiter: Tour planen und Rundtour.

* **Tour planen:** Start, Zwischenziele und Ziel. Jede Etappe hat ihr Profil, Kurvig oder Schnell (etwa schnell nach München, dann kurvig bis Imst). Der Tourname steht unter den Etappen.
* **Rundtour:** ab Standort mit Länge, Richtung (oder Zufall), Profil Kurvig. Pass Varianten werden automatisch mitgeplant. Neu würfeln liefert eine andere Runde; gibt es keine gute Alternative, bleibt die Runde stehen und die App sagt es ehrlich. Runde anpassen öffnet sie als Tour.
* **Ortssuche** als eigene Ebene: Mein Standort, Zuletzt, Pässe und Orte, Hausnummern; Kategorien Tanken, Café, Essen, Aussicht, Pässe im Korridor der Route, nach Umweg sortiert.
* **Punkte:** Antippen zeigt den Namen im Feld, ⋯ öffnet Aktionen (Als Start, Als Ziel, Auf der Karte zeigen, Entfernen). Daneben ein Symbol für Orte in der Nähe (Übernachten, Pause).
* **Plus** zwischen den Etappen: Highlights (Pässe und Traumstrecken) nur, wenn sie einen sinnvollen Bogen ergeben. Eine Strecke als Zwischenziel wird ganz durchfahren.
* **Unterwegs einplanen und Vermeiden** als aufklappbare Abschnitte. Stopps nach Kilometern mit Ankunft, am Ziel Hotels, Café und Essen.
* **Laden:** Scan entlang der Strecke bei der ersten Planung, Arbeitsschritt oben links, Balken im Losfahren Knopf.
* **Ergebnis:** Kennzahlen (Strecke, Fahrzeit, Fahrspaß 0 bis 100 von Gemütlich bis Legendär), Fahrspaß Blatt mit Rechnung, Höhenprofil und Prüfung der Strecke, Highlights nach Pegel gerankt.
* **Aktionsleiste:** Losfahren als Hauptaktion (Abfrage Allein oder Als Gruppe), ⋯ mit Teilen, GPX, Duplizieren, Umbenennen, Löschen oder Verwerfen. Speichern nur bei echter Änderung.
* **Aktuelle Sperrungen** aus TomTom Verkehrsmeldungen werden umplant, sonst gewarnt.

### Karte und Ebenen

Runder Knopf oben rechts: Darstellung Standard (dunkel), Satellit, 3D Satellit (gilt für alle Karten); Ebenen Gefahrenstellen, Pässe (nur bis 50 km um die Tour, Alle Pässe als Schalter), Meine Touren, Gefahrene Strecken, Wetter an den Pässen (Apple WeatherKit). Doppelt gefahrene Abschnitte erscheinen als zwei versetzte Linien mit Richtungspfeilen.

### Navigation

* Abbiegehinweise mit 42 eigenen Symbolen, der Pfeil baut sich vor dem Manöver auf
* Highlights werden kurz vorher mit Karte, Sprachansage und Pegel angekündigt; Legende mit Stern Animation
* Tempo mit Tempolimit unten links, Bremshinweis vor Kurven (5,5 m/s², nach eigenem Tempo), Kurvenwarnung ab 70er Zonen
* Planung ansehen, Zwischenziel überspringen (langer Druck, mit Rückgängig), Pausieren
* Abseits der Tour: gelbe Linie zurück, verpasstes Stück muss man nicht nachfahren. Weg zur Tour und zurück über den eigenen Server, um Orte herum (seit 10.11.)
* Karte zoomt ab 50 km/h langsam heraus, mit zwei Fingern zoomen und zentriert bleiben (CarPlay zoomt ab Build 21 mit)
* Linie nur vor dem Auto, keine 3D Gebäude über der Linie, Kamera folgt flüssig
* Restzeit passt sich dem Tempo an (0,6 bis 1,8 fach); Live Activity auf dem Sperrbildschirm
* CarPlay (in Entwicklung): Start im Auto mit Meine Touren und Schnelle Runde, Führung mit eigenen Symbolen, Menü Mehr, eigenes Auto aus der Garage als Standort

### Gruppenfahrt

* Gruppenfahrt mit Einladung (Ausfahrt oder direkt), Live Positionen aller Fahrer, Lead teilt die Tour
* Kurznachrichten (Bitte warten, Alles ok, Tankstopp und weitere)
* **Halt der Lead:** helle Pille oben rechts unter der Abbiegekarte, Gründe fächern auf (Sammeln, Parkplatz, Tanken, Pause, Fotostopp); bei allen erscheint ein großes Feld mit Ansage
* **Funk** (ab Build 20, LiveKit): Funk Knopf gedrückt halten spricht, Banner zeigt, wer spricht; immer nur einer, die Lead kommt zuerst dran; Funk stumm; Lead kann "Nur die Lead spricht" setzen. Funk und Halt sind getrennte Funktionen
* Gruppen Bedienung erscheint nur, wenn wirklich jemand mitfährt
* Konzept und offene Punkte: claude/funk-konzept.md

### Meine Touren

Karten im Stil von Trade Republic mit Streckenbild, Fahrspaß und Plakette "Von dir" oder "Von …" für übernommene Touren. Reiter Gespeichert und Gefahren, Import als Symbol. Tippen öffnet die Tour im Planer ohne Neuplanung; oben links führt eine Pille zurück zur Herkunft. Abgleich mit dem Konto ohne Duplikate.

### Community

Umschalter Routen, Ausfahrten und Drivers als Glaspille fest über der Karte.

* **Routen:** veröffentlichte Touren im Aufbau von Meine Touren; Suche nach Name, Fahrer, Ort, Adresse oder PLZ mit 50 km Umkreis um den Start; Sortierung Neueste, Kurvigste, Kurz, Lang. Tippen öffnet eine ungespeicherte Kopie, das Lesezeichen übernimmt sie.
* **Ausfahrten:** anlegen mit Tour, Zeit, Treffpunkt und Plätzen, mitfahren anfragen, annehmen, Chat, Einladung per Name; am Tag wird daraus die Gruppenfahrt.
* **Drivers:** Mitglieder mit Wohnort (nur Ortsmitte), Fuhrpark und Über mich; private Nachrichten, wenn erlaubt. Jeder kann sich ausblenden.
* **Push** bei Nachrichten, Chat der Ausfahrt, Einladungen, Anfragen und Zusagen (ab Build 19).

### Einstellungen

Profilkarte oben (Initialen, Name, Wohnort, Plakette "Sichtbar in Drivers"), darunter Gruppen: Fahrzeuge (Garage), Fahren (Stimme und Ansagen, Kartendarstellung), Community (In Drivers sichtbar, Nachrichten erlauben, Mitteilungen, Garage zeigen), Mitgliedschaft, Konto (Mail, Abmelden, Konto löschen), Rechtliches, Version. Unterseiten: Profil (Name, Wohnort, Über mich, Vorschau in Drivers), Garage, Fahren. Profilfoto folgt per Update (Paket ab Build 19).

### Garage

Mehrere Fahrzeuge mit einem Feld für Marke und Modell, Form (Coupé, Coupé mit Flügel, Cabrio, Fastback, Limousine, Geländewagen; Kombi ausgeblendet) und Farbe samt Sonderfarbe. Das Auto fährt auf der Karte und in CarPlay als Symbol mit, sonst ein Pfeil oder Pin. Kilometer und Touren je Fahrzeug aus den Fahrten. Die Formen sind Platzhalter aus dem Kenney Car Kit (CC0).

### Nach der Fahrt

Statistik für Autos (Kurven, Querbeschleunigung, Schnitt, Spitze) und Bewertung mit fünf Sternen (intern 0 bis 100), Daumen je Highlight. Der Pegel der Strecken lernt aus den Fahrerstimmen.

## Routing Logik

Die App plant über den eigenen GraphHopper Server mit Sportwagen Gewichtung. Ist er nicht erreichbar, fällt sie auf Valhalla zurück.

| Profil | Wo | Wirkung |
|---|---|---|
| Kurvig | Rundtour und Tour planen | bevorzugt Kurven, meidet Orte, distance_influence 5 |
| Schnell | nur je Etappe in Tour planen | schnellster Weg, für Anfahrten |

Sehr kurvig gibt es als Server Profil, in der App wurde es am 8.11. zugunsten eines Profils Kurvig entfernt.

**Gewichtung im eigenen Server:** Kurvigkeit und Ortsdichte (Stadt und Wohngebiet abgewertet), Traumstrecken Bereich (außerhalb Priorität mal 0,7), Straßenbreite (unter 3 m raus, unter 4,5 m prüfen, Engstellen unter 1,9 m raus), Schotter und schlechter Belag gemieden, Vermeiden schaltbar.

**Rundtour Auswahl:** Varianten parallel (freie Runden, Kreisrunden in die Richtung, Runden über Traumstrecken und Pässe), Bewertung nach Fahrspaß, Länge, Stichstraßen (Abzug), Traumstrecken (Bonus) und Fahrregionen. Entartete Runden werden aussortiert, in Tälern ohne Ausgang werden gedrehte Richtungen probiert. Sperrungen werden je Variante umplant.

**Lohnt kurvig nicht:** bringt die kurvige Route kaum mehr Fahrspaß und nur Umwege durch Orte, fährt die App den direkten Weg und sagt es.

**Etappen Check:** jede Route wird gegen Breite, Belag und Sperrungen geprüft, Zweifelsfälle als prüfen markiert.

**Highlights und Ansagen:** Pässe von Talpunkt zu Talpunkt oder über die Kehrenkette; kuratierte Strecken mit tier highlight werden angesagt, prefer zieht nur die Planung an.

**Lernen:** anonyme Signale aus Planen und Fahren (route_signals, 24 Monate) sollen später die Planung verbessern; Stufe 2 (nächtliche Auswertung) steht aus.

**Fahrzeit:** Valhalla schätzt auf Bergetappen zu langsam. In der Navigation korrigiert ein Tempofaktor die Restzeit; Kalibrierung mit echten Netto Fahrzeiten steht aus.

**Qualität:** Stresstest mit 280 Fällen (Rundtour Median 4,7 s), Simulation der Gruppenfahrt mit 22 Fällen, Tests für lib (npm test).

## Daten

| Bestand | Umfang | Ort |
|---|---|---|
| Kuratierte Strecken | 486 (125 Highlight, 361 bevorzugt): DE 142, IT 95, AT 80, CH 73, FR 70, SI 26 | app/src/data/curated-roads.json, Quellen in routing/data/roads |
| Pässe | 370, Stufen Ikone, Bekannt, Geheimtipp | app/src/data/passes.json |
| Fahrregionen | 94 (Odenwald, Schwarzwald, Pfälzer Wald und weitere) | app/src/data/regions.json |
| POIs | Tank, Aussicht, Mittag, Kaffee, Hotels | Server und Photon/Overpass |
| Passstatus | TomTom Sperrmeldungen, einmal am Tag, von November bis April alle zwei Tage | Edge Function pass-status |
| Sperrungen | TomTom Verkehrsmeldungen je 1 Grad Kachel, 2 Stunden zwischengespeichert | Edge Function road-closures, closure_tiles |
| Fotos | 129 Fotos der RCO EAST 26 mit GPS | nur im Web Planer |

**Strecken Pipeline:** Quelle als JSON, Orte über Nominatim, Route mit Valhalla, Prüfung (Länge 0,6 bis 1,5 fach, keine Stichstraße, keine Schleifen), Doppelte zusammenführen, ausdünnen, mit Pegel nach curated-roads.json (routing/scripts/geocode_roads.py, build_roads.py). Was die Prüfung nicht besteht, wird weggelassen.

## Supabase

Region Frankfurt, Projekt onfxnfkhajxvjmmvmzda. Migrationen und Edge Functions kommen per GitHub Integration aus dem Repo (Push auf main).

* Tabellen: profiles (Name, Wohnort, Sichtbarkeit in Drivers, Nachrichten erlauben, Garage zeigen, Über mich, Fahrzeuge), tours (mit Veröffentlichen und Autor), drives (Spur, Statistik, Bewertung), rides, ride_members, ride_messages, direct_messages, push_tokens, handoffs, pass_status, closure_tiles, route_signals, tomtom_budget und tomtom_usage, clubs und club_members
* Edge Functions: pass-status, road-closures (TomTom mit Monatskontingent 20.000), notify (Push über Expo, nur mit Secret), livekit-token (Funk Zugang nach Mitgliedsprüfung)
* Secrets (trägt Koray ein): TOMTOM_KEY, NOTIFY_SECRET (dazu im Vault notify_secret), LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

## Design System und Prinzipien

Jede Ansicht wird an den Regeln in docs/design-prinzipien.md gemessen (gespiegelt als claude/design-prinzipien.md). Kurz:

1. Eine Hauptaktion pro Ansicht
2. Feste Ebenen und Rückmeldungen (ActionSheet, ConfirmSheet, OptionsSheet, Vollfläche, schwebendes Menü, Toast, Hinweis im Inhalt, Vollbild)
3. Bewegung mit Auslaufkurven, Federn nur für Gesten, Größenänderung höchstens 2 %
4. Inhalt zeigt sich selbst (Streckenbild, Tabellenziffern, getönte Plaketten)
5. Typografie Mittelweg: Archivo 900 nur für Gelesenes, Inter für alles Bedienbare
6. Ruhe: dunkler Grund, Signal Orange nur für Hauptaktion und Strecken
7. Bedienbar für alle: Treffer ab 44 pt, VoiceOver, Du Form ohne Gedankenstriche
8. Schnell: erst zeigen, dann laden

| Token | Wert | Einsatz |
|---|---|---|
| ground | #0B0B0C | Grund |
| surface / surface2 | #161618 / #1F1F22 | Karten, Felder, Zeilen |
| signal | #E2461C | Hauptaktion, Strecke, Pegel |
| good | #4CC38A | geprüft, gefahrene Strecken |
| warn | #E8B03A | prüfen, Rückweg zur Tour |
| text / muted | #F4F4F2 / #9A9A9F | Schrift |

**Fahrspaß Pegel (Variante S3, seit 7.11.):** acht Segmente mit rundem Rücken um einen schlanken achtzackigen Stern als Negativform; fünf Stufen Nett, Lohnend, Stark, Traumstraße, Legende füllen 1, 3, 5, 7 und 8 Segmente ab 6 Uhr im Uhrzeigersinn. Legende animiert als subtiler Austausch.

**Artefakte:** CUMO DRIVE Design System, Design Leinwände (Zurück Navigation, Meine Touren Herkunft, Einstellungen neu, Funk in der Gruppenfahrt mit Prototyp), User Flows für den synthetischen Test (96 Flows).

## Betrieb

JavaScript Änderungen gehen per OTA Update in Minuten aufs Handy; neue native Pakete und CarPlay brauchen einen neuen TestFlight Build. Native Pakete werden im Code so geladen, dass ältere Builds dieselben Updates ohne Absturz bekommen.

* Kanal preview, Runtime 1.1.0. OTA nur aus einem sauberen Arbeitsstand ohne .env: `eas update --channel preview --environment preview`
* Builds: `eas build --platform ios --profile preview --auto-submit`, Expo Starter Plan seit 10.11.
* Apple: Einzelperson, Team ID N9DX399W33, Bundle ID de.rallycumo.drive; Push Schlüssel und Profil mit Push seit 10.11.
* Code: privates Repo github.com/korayoenal-de/cumo-drive, Branch main; jede Änderung wird committet und gepusht
* Auf dem Handy: App zweimal schließen und neu öffnen

### Routing Server

| Punkt | Wert |
|---|---|
| Anbieter | Contabo Cloud VPS, 13.140.213.164, Ordner /opt/cumo-routing, Dienst cumo-routing |
| Software | GraphHopper 11, Ortsdichte mit 4 Threads, Landmarken mit 4 Threads |
| Regionen | DACH, Norditalien, Elsass, Lothringen, Franche Comté, Rhône Alpes, PACA, Slowenien |
| Neuaufbau | wöchentlich So 3 Uhr, Sperre gegen doppelten Lauf, Wächter auf /health (harden.sh); App plant solange über Valhalla |
| Adresse | https://13-140-213-164.sslip.io (DNS routing.cumodrive.de steht aus) |

### Externe Dienste und Kosten

| Dienst | Plan | Hinweis |
|---|---|---|
| Expo (EAS) | Starter, 19 $ im Monat plus Nutzung | Builds und OTA |
| Supabase | Free | Pro ab 25 $ bei echten Nutzern |
| TomTom | Pay as you grow, Karte hinterlegt | Obergrenze 20.000 Abfragen im Monat, Tests höchstens 200 € |
| LiveKit Cloud | Build, kostenlos | 5.000 Minuten im Monat, reicht für etwa 3 Gruppenfahrten; Ship 50 $ für etwa 100 |
| Contabo | Cloud VPS | Routing Server |

### Zugänge und Sicherheitsregeln

* Schlüssel (GraphHopper, Expo, TomTom, LiveKit) nie committen oder ausgeben; sie liegen in app/.env und als Secrets
* Passwörter für FTP, root und Apple gibt Koray selbst ein, Claude fragt nie danach
* Bezahlte Bestellungen und Pläne schließt Koray ab
* Den Supabase service_role Schlüssel braucht Claude nicht
* Kein git reset --hard; halbfertige Arbeit nicht vor einem OTA committen
* Keine Konten auf der echten Datenbank anlegen; Simulationen laufen lokal

## Web

Web Planer aus demselben Code (MapLibre mit OpenFreeMap), Landingpage unter / mit Login und Registrieren, Web Planer nur mit Konto, QR Code führt in die App. Gedacht für drive.rallycumo.de auf DomainFactory, Upload per FTP durch Koray.

## Business

Realistisch sind im dritten Jahr rund 385 Tsd. € netto (vorsichtig 72 Tsd. €, ambitioniert 1,45 Mio. €); die größten Hebel sind Testquote und Umwandlung, nicht der Preis. Details in docs/business-analyse.md.

* Markt DACH: 1,4 bis 2,6 Mio. Fahrzeuge für Genuss und Kurvenfahrten, 0,22 bis 0,40 Mio. iPhone Nutzer, die aktiv Touren planen; 97 regionale Porsche Clubs in Deutschland als Multiplikator
* Wettbewerb: calimoto und Kurviger (Motorrad), DriveGo, Strada1, RoadStr (Auto, Konvoi), ROADS by Porsche (kostenlos, schwach). Keiner verbindet Sportwagen taugliches Routing mit Gruppe, Funk, Web Planer und Club Modell.
* Preise (Arbeitsstand): Jahresabo 59,99 €, Saisonpass 3 Monate, Monat und Woche; Club Lizenzen öffentlich auf Anfrage (intern Club S 490 €, Club L 890 €, Event Pass 149 €)
* Gründungstester bekommen 12 Monate frei über das eigene Konto (Entscheidung 10.11.)
* RevenueCat und Apple Bezahlvertrag stehen noch aus

## Recht

* Datenschutzerklärung und Nutzungsbedingungen als Entwurf in der App, im Web und in docs/rechtstexte-entwurf.md (seit 10.11. mit Profil, Drivers, Nachrichten, Push und Funk); Impressum und anwaltliche Prüfung stehen aus
* AGB Entwurf zum Schutz unserer Daten (docs/agb-datenrechte-entwurf.md); die ODbL verlangt Namensnennung
* Blitzerwarnungen nur, wo legal (in DE, CH, IT, FR, SI verboten, daher nicht gebaut)
* Fotos, Musik, Videos und 3D Modelle nur mit geklärten Rechten
* Konto löschen in der App; Privacy Manifest gesetzt

## Entscheidungen (neueste zuerst)

| Datum | Entscheidung |
|---|---|
| 10.11. | CarPlay wird bei jeder Änderung an Karte und Navigation mitgedacht |
| 10.11. | Bewertung nach der Fahrt mit fünf Sternen statt Regler; Zoom bei Tempo und mit zwei Fingern |
| 10.11. | Funk und Halt getrennt; Halt als Pille oben rechts; Lead Blatt nach Art des Inhalts (Status, Kacheln, Schalter, Seltenes); kein "Tour für alle beenden" in der Navigation |
| 10.11. | Funk über LiveKit Cloud (Frankfurt), immer verbunden, keine Aufzeichnung |
| 10.11. | Einstellungen neu: Profilkarte oben, Gruppen, Unterseiten; Sichtbarkeit in Drivers abschaltbar |
| 10.11. | Community Umschalter fest über der Karte; Ortssuche mit 50 km Umkreis |
| 10.11. | Zurück Navigation mit Pille oben links, Tableiste zeigt den aktuellen Tab, kein Wischen vom Rand |
| 10.11. | Plaketten "Von dir" und "Von …" statt Filter in Meine Touren (Variante A) |
| 10.11. | Club Preise öffentlich auf Anfrage; CarPlay "in Entwicklung" |
| 10.11. | Fahrregionen nur in der Bewertung, nicht auf dem Server; Neu würfeln sagt ehrlich, wenn nichts Besseres kommt |
| 10.11. | TomTom Kosten begrenzt: Kontingent 20.000 im Monat, Tests höchstens 200 € |
| 10.11. | Gründungstester 12 Monate frei über das eigene Konto |
| 9.11. | Garage nur Marke und Modell, Form und Farbe; Breite unter 3 m bleibt auf dem Server ausgeschlossen |
| 8.11. | Nur noch ein Profil Kurvig, Pass Varianten automatisch; Reiter Tour planen vor Rundtour |
| 8.11. | Nach Abweichung schnellster Weg zurück, verpasstes Stück nicht nachfahren |
| 8.11. | Keine Nennung von calimoto in App, Web und Landingpage |
| 7.11. | Fahrspaß Pegel Variante S3; Fahrspaß Wert 0 bis 100 |
| 6.11. | Ebenen und Rückmeldungen als feste Muster; Bounce auf 2 % begrenzt |
| 5.11. | Typografie Mittelweg; durchgefallene Strecken werden weggelassen |
| 4.11. | Routing Server bei Contabo; Blitzer werden nicht gebaut |

## Offene Punkte

### Wartet auf Koray

* [ ] Funk mit Build 20 zu zweit testen
* [ ] Gregor: Ort der Ortsdurchfahrt und Tempowarnung nachreichen lassen
* [ ] Restliche Screenshots für die Landingpage, Web Zip per FTP hochladen
* [ ] WeatherKit unter Capabilities und App Services prüfen
* [ ] DNS für routing.cumodrive.de und Domain für den Web Planer
* [ ] Apple Bezahlvertrag und RevenueCat
* [ ] Impressum, AGB und Datenschutz zum Anwalt
* [ ] Echte Netto Fahrzeiten für die Kalibrierung
* [ ] Liste der Gründungstester
* [ ] 3D Designer für die Fahrzeug Formen; Booking.com Partnerprogramm
* [ ] CarPlay: Namen der Knöpfe, Rundtouren aus dem Auto speichern, Community Touren in der Liste
* [ ] Lizenz der Esri Satellitenkarte im Web klären

### Als Nächstes (Claude)

* [ ] Lead Blatt nach dem Prototyp, Ansagen warten auf freien Funk
* [ ] Build 21: CarPlay Zoom bei Tempo, Profilfoto
* [ ] Vermeiden als feste Einstellung, Impressum als Seite
* [ ] Ortssuche in Routen auch über den Streckenverlauf
* [ ] Melden und Blockieren in der Community
* [ ] Lernen Stufe 2: nächtliche Auswertung der Signale
* [ ] Haptik (expo-haptics) mit dem nächsten nativen Build
* [ ] Kombi als Fahrzeug Form, Fürth in die großen Städte der Ortsdichte

### Später

* Android und Android Auto, CarPlay Antrag (claude/carplay-antrag.md), Offline Karten, App Icon, Supabase Pro bei echten Nutzern
* Rundtour mit Auswahl aus zwei bis drei Alternativen
* Hotel Integration in Stufen: OpenStreetMap, Booking.com Link, Partner API, Partnerhotels
* Validierung: zehn Gespräche mit Fahrern und Clubs zur Zahlungsbereitschaft
