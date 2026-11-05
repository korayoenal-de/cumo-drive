# CUMO DRIVE Dokumentation (Kurzfassung für den Projektkontext)

Stand: 5. November 2026, 20:00. Ausführlich: Cumo Drive Dokumentation https://claude.ai/artifact/HZQ5kKYHxZWA8tMbfddJyF und Cumo Drive Code https://claude.ai/artifact/PsxCmzdf1MkH323DESsyjx. Diese Datei ersetzt bei Widersprüchen ältere Stände in kontext.md und todos.md.

## Produkt
* Navigations App für Sportwagenfahrer ("calimoto für Autos"), Ziel Monetarisierung und die schönste, einfachste App ihrer Art. Koray steuert, gestaltet, testet; Claude programmiert und betreibt.
* Tabs: Planen, Meine Touren, Community, Einstellungen. Tableiste schrumpft beim Scrollen auf 80 %.
* Planen: Schnelle Runde (Länge, Richtung, Profil Kurvig oder Sehr kurvig) und Route (Start, Zwischenziele, Ziel, Profil je Etappe, dort zusätzlich Schnell). Punkte antippen: Name steht im Feld, X entfernt; Reihenfolge per Anfasser. Pässe auf der Karte antippen: Aktionen schweben über der Karte. Kartenknopf oben rechts: Standard, Satellit, 3D, Ebenen.
* Ergebnis: Kennzahlen, Highlights nach Fahrspaß Pegel gerankt, Höhenprofil, Stopps; ActionBar mit Losfahren als Hauptaktion. Doppelt gefahrene Abschnitte als zwei versetzte Linien mit Pfeilen.
* Navigation: 42 Symbole, Highlight Ansagen mit Pegel, Legenden Stern Animation, Restzeit passt sich dem Tempo an.
* Nach der Fahrt: Statistik und Bewertung (nicht gut, gut, sensationell mit Gründen).

## Technik
* Expo SDK 58, React Native 0.88, React 19.3, Expo Router, Reanimated 4.7, react-native-maps, Supabase (Frankfurt, Projekt onfxnfkhajxvjmmvmzda). Web Planer aus demselben Code (MapLibre).
* Ordner app/src: app (Seiten), components (Oberfläche), lib (Logik), data (curated-roads.json, passes.json), constants/theme.ts (Tokens), live (Live Activity, Siri).
* Planer (components/planner): planner.tsx (Gerüst), use-tour-plan.ts, tour-mode.tsx, planner-result.tsx, planner-parts.tsx, planner-shared.ts, planner-styles.ts. Web Planer ebenso in sieben Dateien geteilt (planner.web.tsx plus web-*.ts).
* Blatt (MapSheet): Kopf scrollt mit, kein fester Kopf (Entscheidung 5.11.); unter voller Höhe immer ganz oben. Abschnitte mit Spacing.section 40, Kopf 16 pt unter dem Griff.
* Tokens: Colors, Fonts, Type (13 bis 34), Spacing, Radius, Shadow, Motion. Alle Dateien mit Kopfkommentar.
* Zustand: kleine Speicher je Bereich mit useSyncExternalStore (active-tour, library, vehicle, map-settings, auth).
* Tests: npm test (Node Test Runner über tsx) für reine Funktionen in lib.

## Routing
* Eigener GraphHopper 11 auf Contabo (13.140.213.164, /opt/cumo-routing), Sportwagen Gewichtung, Ortsdichte, Traumstrecken Bereich (Priorität mal 0,7 außerhalb), distance_influence 5. Ersatz: Valhalla, GraphHopper Free.
* Rundtour: Varianten parallel, Abzug 100 je km Stichstraße, Bonus 4 je km Traumstrecke, despur.
* Ersatzweg ohne Server: Via Punkt an einer Stichstraße an die Abzweigung schieben oder weglassen, zweiter Versuch bei Stich über 1 km, Abzug für Prüfstellen (20 je km) und kleine Straßen ohne Nummer (12 je km), Zufahrten in Valhalla stark bestraft.
* Highlights: bei Hin und Rückweg nur einmal angezeigt und angesagt.
* Vorfall 5.11.: Import brach ab (graph.urban_density.threads fehlte). Neuaufbau mit 4 Threads, seit etwa 19:50 wieder online. Rundtouren ab Bensheim danach mit 30 bis 40 Kurven statt 6 bis 15 auf dem Ersatzweg.

## Daten
* 436 kuratierte Strecken (DE AT CH IT FR SI) mit Pegel aus quality, 369 Pässe, POIs (Tank, Aussicht, Mittag, Kaffee) auf dem Server.
* Pipeline: routing/scripts/geocode_roads.py, dann routing/scripts/build_roads.py. Durchgefallene Strecken werden weggelassen (Entscheidung 5.11.).

## Design
* Prinzipien in claude/design-prinzipien.md. Typografie Mittelweg. Fahrspaß Pegel Variante E: sieben Dreiecke, Stern in der Negativform, eine Zacke oben, Stufen 1, 3, 4, 6, 7; unter 20 pt ohne graue Flächen; Legende animiert als subtiler Austausch.
* Design System Artefakt (CUMO DRIVE) am 5.11. um Mittelweg, Type Stufen, Pegel und Schatten Tokens ergänzt. Keine Trennlinien, Abstand trennt.

## Betrieb und Regeln
* OTA: im Ordner app, .env beiseite, eas update --channel preview --environment preview, .env zurück. Runtime 1.1.0.
* Keine Schlüssel committen, Passwörter und Bestellungen macht Koray, kein git reset --hard, Halbfertiges nicht vor einem OTA committen, keine Gedankenstriche in Texten für Koray.

## Offen
* Koray: Gerätetests (Blatt, Rundtouren mit Server), Restaurant Quelle, DNS routing.cumodrive.de, Vertrauenszeile, Apple Bezahlvertrag und RevenueCat, AGB zum Anwalt, echte Fahrzeiten.
* Claude: Pegel aus Bewertungen, Aktionsmuster für Fahrten und Garage, Haptik im nächsten Build, Walkie Talkie. Vorschlag offen: teilweise befahrene Highlights als "teilweise" listen.
