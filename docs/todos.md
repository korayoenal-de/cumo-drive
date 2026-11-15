# CUMO DRIVE ToDos

Stand: 15. November 2026, 8:30 (gegen Code und Git Verlauf geprüft)

## Jetzt: wartet auf Koray

* [ ] **Datenbank Korrektur freigeben:** Einladungen zeigen eine Ausfahrt nach ihrem Ende nicht mehr als „Läuft jetzt“ (Tester Matthias 15.11.). Migration `20261115090000_einladungen_vorbei.sql` liegt lokal und ist lokal getestet; der Push auf main geht direkt in die Produktionsdatenbank und braucht dein OK
* [ ] **Leinwände entscheiden:** „Nach der Fahrt“ (erst die Karte, Blatt in drei Höhen), „Navigation Bedienelemente“ (Kompass in CarPlay?), „Tour anpassen unterwegs“ (dürfen Mitfahrer ablehnen? als neue Tour speichern?)
* [ ] **Build 29 im Auto testen:** Tempo und Tempolimit unten links in CarPlay, verdeckt die Plakette etwas?
* [ ] **Tour anpassen testen:** allein ein Zwischenziel unterwegs hinzufügen; zu zweit als Gruppe, kommt die neue Route beim Mitfahrer an, auch nach kurzem Funkloch?
* [ ] **Paywall und Heimatgebiet:** gebaut, geparkt auf dem Zweig `kostenlos-heimatgebiet`; Zusammenführen erst mit OK
* [ ] **Funk:** Fehlerbild der Tester abwarten (die App zeigt jetzt den Grund)
* [ ] **Reihenfolge Datenthemen:** Vignetten, zeitliche Sperren an Pässen, Hinweis „ZTL möglich“, Umweltzonen

## Release Checkliste

Kritischer Pfad: Anwalt und Apple Bezahlvertrag (Wartezeit, nur Koray kann sie anstoßen).

Rahmen (Entscheidung Koray, 13.11.): maximal schlank starten, ohne neue Gesellschaft und ohne Fremdkapital. Die App läuft über den CUMO DRIVERS CLUB, der Steuernummer und Geschäftskonto hat und umsatzsteuerpflichtig ist.

### Zwingend: Bezahlung

* [ ] Apple Bezahlvertrag samt Steuer und Bankdaten in App Store Connect (Koray; Steuernummer und Geschäftskonto des CDC)
* [ ] Umsatzsteuer Identifikationsnummer für den CDC, falls noch nicht vorhanden (beim Bundeszentralamt für Steuern). Grund: App Store Erlöse sind eine Leistung an Apple Distribution International (Irland, USt-ID IE9700053D) im Reverse Charge, also netto ohne deutsche Umsatzsteuer, dazu eine Zusammenfassende Meldung je Quartal. Apple führt die Umsatzsteuer gegenüber den Käufern selbst ab. Club Lizenzen und Gastgeber Partner rechnet der CDC direkt ab, an deutsche Kunden mit 19 %. Einmal mit der Steuerberatung bestätigen (Koray)
* [ ] RevenueCat einrichten, Abos bei Apple anlegen: Woche, Monat, Jahr, Saison Pass (49 €), 14 Tage Probezeit ab Anmeldung (Koray legt Konten an, Claude richtet ein)
* [ ] Kauf anbinden: Paywall im Flow und Mitgliedschaft sind gebaut (Zweig kostenlos-heimatgebiet), `lib/purchase.ts` ist noch Platzhalter; Webhook auf Supabase für plan und plan_until (Claude, nach RevenueCat)
* [ ] Gründungstester 12 Monate frei schalten; braucht die Liste der Tester (Koray liefert, Claude baut)

### Zwingend: Recht

* [ ] Impressum klären: Rechtsform, ladungsfähige Anschrift, DDG statt TMG (Koray mit Anwalt); danach Impressum als eigene Seite in der App (Claude)
* [ ] Datenschutz und AGB anwaltlich prüfen, vor allem Widerrufsrecht, Haftung, Auswertung der Spuren, Blackbox der Fahrten und Meldungen, Standort für Erinnerungen (Koray mit Anwalt)
* [ ] Lizenzen der Dienste mit dem Anwalt: FOSSGIS Valhalla nur noch Notfall, ODbL Namensnennung (Koray)
* [ ] Auftragsverarbeitungsverträge mit Supabase, Contabo, Expo und LiveKit abschließen und dokumentieren (Koray)
* [ ] Händlerstatus bei Apple für die EU angeben; Anschrift und Telefonnummer werden im App Store öffentlich (Koray)

### Zwingend: App

* [x] Melden und Blockieren (12.11.)
* [ ] App Icon final aus dem Logo; Stand im Build prüfen (Claude, Freigabe Koray)
* [ ] Stabiler Build aus dem Testbetrieb: Build 29 in TestFlight; Rückmeldungen der Testrunde vom 14.11. eingearbeitet (Koray testet, Claude behebt)

### Zwingend: App Store Eintrag

* [ ] Screenshots, Beschreibung, Schlagworte, Support Adresse, Altersfreigabe (Claude bereitet vor, Koray gibt frei)
* [ ] Angaben zum Datenschutz im Store: Standort, Kontakt, Nutzerinhalte, Audio, Fahrtprotokoll (Claude bereitet vor)
* [ ] Testkonto und Hinweise für die Apple Prüfung, auch zu Funk und Standort im Hintergrund (Claude)

### Unabhängigkeit, vor dem Start

* [x] Zweiter Server läuft (Server 2, 13.140.213.114), Wechsel bei Ausfall oder Neuaufbau
* [x] Eigene Ortssuche auf beiden Servern, öffentliches Photon nur noch Notfall (12.11.)
* [x] Eigener Valhalla auf Server 2 (14.11.), mit vollständigen Ländergrenzen und Prüfung vor der Freigabe; FOSSGIS nur Notfall
* [ ] GraphHopper Free (graphhopper.com) entfernen: noch in `lib/graphhopper.ts` für Rundtouren im Ersatzweg (Claude)
* [ ] Höhenprofil aus dem eigenen GraphHopper statt Valhalla /height (Claude)
* [ ] Stopps: Hotels und restliche Arten in die eigenen POI Kacheln, Overpass raus (noch in `lib/stops-along.ts`) (Claude)
* [ ] Web: MapLibre und Schriften selbst ausliefern statt unpkg und Google Fonts (Claude)
* [ ] Web: Satellit (Esri) ausblenden, ist noch wählbar (Claude)
* [ ] Funk: Minuten bei LiveKit beobachten (Claude)
* [ ] Supabase Pro bei echten Nutzern (Koray bestellt)
* [ ] DNS für routing.cumodrive.de und Domain für den Web Planer (Koray)
* [ ] Marke: angemeldet, noch nicht eingetragen; Widerspruchsfrist wegen der KUMO Marken bis drei Monate nach Veröffentlichung der Eintragung

## Als Nächstes (Claude)

* [ ] Server 1 nach dem Neuaufbau vom 15.11. prüfen (Bereinigung, neue Kurvig Datei), Mörlenbach nachrechnen; Server 2 folgt Mo 3 Uhr
* [ ] Funk: LiveKit liegt doppelt im App Paket (eine Fassung für unseren Code, eine für das iPhone Paket); auf eine Fassung zwingen, mit Gerätetest, könnte mit den Abbrüchen zusammenhängen
* [ ] Erinnerung mit Standort „Immer“ (Variante c, Teil b): braucht expo-task-manager im nächsten Build
* [ ] Tour anpassen: schmale Abbiegezeile oben im Planer, „Als neue Tour speichern“ nach der Fahrt
* [ ] Kompass auch in CarPlay (wenn gewünscht, Build)
* [ ] Fahrzeit Kalibrierung, sobald genug Fahrten abgeschlossen sind (Koray 15.11.: noch zu wenige)
* [ ] Spurpfeile auch in CarPlay (Build)
* [ ] „Auslassen“ auch in Rundtour und Web (heute nur Tour planen)
* [ ] Datencheck Rest: etwa 70 Strecken einzeln prüfen
* [ ] Profilfoto (expo-image-picker ist im Build, noch nicht verwendet)
* [ ] Lead Blatt nach dem Prototyp, Vermeiden als feste Einstellung
* [ ] Missbrauch Stufe 2, Lernen Stufe 2

## Für Koray

* [ ] Restliche sechs iPhone Screenshots für die Landingpage
* [ ] Liste der Gründungstester vor der Veröffentlichung
* [ ] 3D Designer für die Fahrzeug Formen beauftragen (heute Kenney Car Kit, CC0)
* [ ] CarPlay: Namen der Knöpfe, Rundtouren aus dem Auto automatisch speichern, Community Touren in der Liste im Auto

## Erledigt am 13. bis 15.11.

* [x] Testrunde 14.11.: 20 Punkte eingearbeitet (Ansagen nicht mehr abgeschnitten, Halt und Nachrichten mit Bestätigung, Da Karte am Treffpunkt, Fahrzeug der Ausfahrt, Funk zeigt den Grund, nur ein Menü offen, Treffpunkt Einstieg, Baustellen nur auf einer Spur ignoriert)
* [x] Ausfahrt vorbei: Rückblick unter Gefahren, Nochmal fahren, Chat bleibt
* [x] Paywall im Flow (Fälle A bis G) und Heimatgebiet gebaut, stumm, geparkt
* [x] Eigener Valhalla 3.9.1 mit Ländergrenzen und Prüfung; GraphHopper 11.1 auf beiden Servern; Überwachung der Aktualität um 7 Uhr
* [x] Neuaufbau gegen doppelte Objekte und Profilwechsel abgesichert (Vorfall 15.11.)
* [x] Kurvig innerorts auf der Hauptstraße (Mörlenbach)
* [x] Ortssuche: Städte vor gleichnamigen Dörfern; Start ohne Netz wiederholt, auch aus CarPlay
* [x] Navigation: Einstieg kurz hinter dem Start, Ladepille bei jeder Neuplanung, Kompass und genordete Karte, Tempopille im Stand, Bremsempfehlung per Stimme, Kurvenansagen freigegeben, Navigationsansagen mit Vorrang
* [x] Tour anpassen unterwegs, auch in der Gruppe (nur Lead)
* [x] Erinnerung vom aktuellen Standort; CarPlay ohne alte Tour nach dem Ziel; weiße Sterne
* [x] Build 29: CarPlay Tempo und Tempolimit
* [x] Aufräumen 15.11.: sechs tote Dateien und die Planungskarte ohne Auslöser entfernt, Lint ohne Warnungen, `npm test` läuft (27 Tests)

## Backlog

* [ ] **Gastgeber Partner für Restaurants und Hotels (Idee Koray, 11.11.):** Konzept im Projekt (claude/todos.md, Stand 13.11.), wartet auf Preise
* [ ] **Booking.com Kooperation:** bewusst zurückgestellt, erst wieder aufgreifen, wenn Koray es anstößt
* [ ] **EU Marke CUMO DRIVE:** im Februar 2027 Gutschein aus dem SME Fund, danach EU Marke mit deutscher Priorität (Frist 11.05.2027)
* [ ] **Finanzierung und Förderung, zurückgestellt 13.11.:** Start maximal schlank über den CDC; Details im Projekt
* [ ] **Rundtour mit Auswahl (Idee Tom, 9.11.):** zwei bis drei Alternativen
* [ ] Offline Karten (Wunsch Tester Matthias 14.11.), Android, 3D Fahrzeugformen
* [ ] Glossar und Wording, lernende Bewertung Stufe 3 und 4, Planen im Auto (CarPlay)
* [ ] Hotel Kacheln mit Sternen beim nächsten Server Import
* [ ] Satellit im Web: Esri nur mit ArcGIS Konto, Alternative MapTiler Flex ab 30 $ im Monat

## Apple und Builds

* Einzelperson, Team ID N9DX399W33, Bundle ID de.rallycumo.drive, Runtime 1.1.0
* In TestFlight bis Build 31 (15.11.: CarPlay Tempo oben, mittig, mit CarPlay Rundung, dreistellige Limits, Dann Symbol größer, Ankunft dunkel); Expo Starter Plan
* OTA nur nach Korays OK aus einem sauberen Arbeitsstand ohne .env
* GitHub Secret EXPO_TOKEN fehlt, der Workflow eas-update.yml scheitert deshalb (Koray trägt es selbst ein)

## Routing Server

* Server 1 (13.140.213.164) Produktion, Server 2 (13.140.213.114) zweiter Server und Testbetrieb; GraphHopper 11.1, Ortssuche Photon auf beiden, Valhalla auf Server 2
* Profile: Sportwagen, Auto, Kurvig (Bundes und Landesstraßen nur außerorts abgewertet seit 15.11.)
* Neuaufbau wöchentlich (So Server 1, Mo Server 2, Di Valhalla); die App wechselt solange auf den anderen Server
* Details in docs/betrieb.md
