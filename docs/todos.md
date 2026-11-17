# CUMO DRIVE ToDos

Stand: 17. November 2026, 16:00 (gegen Code und Git Verlauf geprüft; Prüfung vor dem Start im Doc „Startprüfung CUMO DRIVE“)

## Routen Check 17.11. nachmittags

* [x] Rückfrage bei über 5 km Stich, hin und zurück über den Pass hinaus, Stiche zweistufig, Länge besser getroffen (OTA und Web o, 17.11.); Fokuslauf 10 auf 3 Fehler, Morgenfälle ohne Rückschritt
* [ ] Inntal: Orte im Serverprofil Kurvig stärker abwerten (Innsbruck 220: 46 % Orte), mit dem Neuaufbau am Sonntag
* [ ] Andraz 170 und Innsbruck 220: gut 3 km auf einer Parallelstraße im selben Tal zurück
* [ ] Sankt Johann 200: 1 km Stich bleibt trotz zweistufigem Herausplanen
* Lugano 80: keine Runde dieser Länge (43, 52, 126 km), App fragt nach; MeBo bei Rolle nach Timmelsjoch bleibt bewusst (Alternative durch Orte)

## Sprachen Webseite (17.11.)

* [x] Landingpage auf Englisch und Italienisch unter /en und /it, hreflang, Sitemap, Sprachlinks im Fuß; Titel und Verweise jetzt im vorgerenderten HTML
* [ ] Bildschirmfotos der Landingpage auf Englisch und Italienisch (zeigen heute die deutsche App)

## Sicherheit vor dem Start (Konzept 17.11., Claude Doc „Sicherheitskonzept CUMO DRIVE“)

* [x] 2FA auf allen Konten, Supabase Pro (Koray 17.11.)
* [x] Mengengrenzen im Prüfdienst, Zählmodus auf r1 und r2 (17.11. 9:52)
* [ ] 18.11.: /stats ansehen (spitze_je_konto), Grenzen eichen, dann `bash /root/cumo-auth.sh enforce` auf beiden Servern
* [x] Webseite mit Kopfzeilen und Strecken kachelweise live, Kopfzeilen geprüft (17.11.)
* [x] Migrationen live: highlight_feedback nur mit Anmeldung, Link Grenzen, Konten Grenze, road-data kachelweise mit Kontingent, Einwilligungen (17.11.)
* [x] Hook Before User Created aktiv, E Mail Bestätigung an (17.11.)
* [ ] profile-next.sh auf r1 und r2 (nach dem Neuaufbau von r2), Profil schnell kommt mit dem nächsten Neuaufbau; danach FAST_SPEED und WIDTH_MODEL aus cumo-routing.ts löschen
* [x] OTA: Kurvig Gewichtungen nur im Server, Untertitel längste Runde (17.11.)
* [x] App Daten verschleiert und mit Fingerabdruck app-paket (17.11., OTA; nach Änderungen an den JSON Dateien `npm run pack-data`)
* [x] Opt in bei der Registrierung live (Migration, Webseite m, OTA 17.11.)
* [ ] Nach dem Start: Rundtour Bewertung als Server Dienst, Alarm bei auffälligen Konten, Marke anmelden, AGB zum Anwalt

## Jetzt: wartet auf Koray

* [ ] OSM: Relation 3931638 (nur geradeaus, B 47 in die Ampèrestraße) löschen, Rechtsabbiegen ist erlaubt (Koray 15.11., morgen am Rechner)
* [ ] Entscheidung: Planer soll Abbiegeverbote beachten (GraphHopper turn costs, erst Server 2 testen)

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

* [x] Apple Bezahlvertrag, Steuerformulare und Bankkonto eingereicht (Koray 17.11., Apple prüft bis zu 24 Stunden)
* [ ] Umsatzsteuer Identifikationsnummer für den CDC, falls noch nicht vorhanden (beim Bundeszentralamt für Steuern). Grund: App Store Erlöse sind eine Leistung an Apple Distribution International (Irland, USt-ID IE9700053D) im Reverse Charge, also netto ohne deutsche Umsatzsteuer, dazu eine Zusammenfassende Meldung je Quartal. Apple führt die Umsatzsteuer gegenüber den Käufern selbst ab. Club Lizenzen und Gastgeber Partner rechnet der CDC direkt ab, an deutsche Kunden mit 19 %. Einmal mit der Steuerberatung bestätigen (Koray)
* [x] RevenueCat eingerichtet, Abos bei Apple angelegt: Jahr, Monat, Woche, Saison Pass 49 € (17.11., Projekt Dokument „Bezahlmodell“)
* [ ] Prüf Screenshot je Abo (Paywall aus Build 35), Abos mit der App Version zur Prüfung einreichen
* [x] Kauf angebunden: lib/purchase.ts mit RevenueCat, Edge Function revenuecat-webhook, Secret und Webhook eingetragen (17.11., Build 35)
* [ ] Kauf in TestFlight mit Sandbox Konto testen (Koray, Build 35)
* [ ] Gründungstester 12 Monate frei schalten; braucht die Liste der Tester (Koray liefert, Claude baut)

### Zwingend: Recht

* [ ] Impressum klären: Rechtsform, ladungsfähige Anschrift, DDG statt TMG (Koray mit Anwalt); danach Impressum als eigene Seite in der App (Claude)
* [ ] Datenschutz und AGB anwaltlich prüfen, vor allem Widerrufsrecht, Haftung, Auswertung der Spuren, Blackbox der Fahrten und Meldungen, Standort für Erinnerungen (Koray mit Anwalt)
* [ ] Lizenzen der Dienste mit dem Anwalt: FOSSGIS Valhalla nur noch Notfall, ODbL Namensnennung (Koray)
* [ ] Auftragsverarbeitungsverträge mit Supabase, Contabo, Expo und LiveKit abschließen und dokumentieren (Koray)
* [x] Händlerstatus bei Apple für die EU angegeben, Kontakt kontakt@cumodrive.com (Koray 17.11.)

### Zwingend: App

* [x] Melden und Blockieren (12.11.)
* [x] App Icon final (Build 34)
* [ ] Stabiler Build aus dem Testbetrieb: Build 29 in TestFlight; Rückmeldungen der Testrunde vom 14.11. eingearbeitet (Koray testet, Claude behebt)

### Zwingend: App Store Eintrag

* [x] Texte DE, EN und IT in App Store Connect (Name, Untertitel, Beschreibung, Werbetext, Schlagworte, Support und Marketing URL, 17.11.)
* [ ] Screenshots EN und IT (Koray 18.11.), Altersfreigabe, Inhaltsrechte (unter App Informationen noch offen)
* [ ] Angaben zum Datenschutz im Store: Standort, Kontakt, Nutzerinhalte, Audio, Fahrtprotokoll (Claude bereitet vor)
* [ ] Testkonto und Hinweise für die Apple Prüfung, auch zu Funk und Standort im Hintergrund (Claude)

### Unabhängigkeit, vor dem Start

* [x] Zweiter Server läuft (Server 2, 13.140.213.114), Wechsel bei Ausfall oder Neuaufbau
* [x] Eigene Ortssuche auf beiden Servern, öffentliches Photon nur noch Notfall (12.11.)
* [x] Eigener Valhalla auf Server 2 (14.11.), mit vollständigen Ländergrenzen und Prüfung vor der Freigabe; FOSSGIS nur Notfall
* [x] GraphHopper Free entfernt (Rundtour Bewertung lokal)
* [x] Höhenprofil über den eigenen Valhalla (öffentlicher nur Notfall)
* [x] Stopps nur aus eigenen POI Kacheln, Overpass raus (13.11.)
* [x] Web: MapLibre und Schriften selbst ausgeliefert
* [x] Web: Satellit (Esri) ausgeblendet (13.11.)
* [ ] Funk: Minuten bei LiveKit beobachten (Claude)
* [ ] Routing Server: Token Pflicht und Mengengrenzen scharf schalten (zählen seit 17.11., scharf am 18.11.)
* [ ] Profil Schnell fest im Server (profile-next.sh, wirksam mit dem Neuaufbau am 22.11.); Kurvig seit 17.11. nur im Server
* [x] LiveKit Ship (Koray 17.11.), Supabase Pro seit 17.11.
* [ ] DNS für routing.cumodrive.de und Domain für den Web Planer (Koray)
* [ ] Marke: angemeldet, noch nicht eingetragen; Widerspruchsfrist wegen der KUMO Marken bis drei Monate nach Veröffentlichung der Eintragung

## Als Nächstes (Claude)

* [ ] Server 1 nach dem Neuaufbau vom 15.11. prüfen (Bereinigung, neue Kurvig Datei), Mörlenbach nachrechnen; Server 2 folgt Mo 3 Uhr
* [ ] Tour anpassen: schmale Abbiegezeile oben im Planer, „Als neue Tour speichern“ nach der Fahrt
* [x] Kompass auch in CarPlay (Build 34)
* [ ] Fahrzeit Kalibrierung, sobald genug Fahrten abgeschlossen sind (Koray 15.11.: noch zu wenige)
* [ ] Spurpfeile auch in CarPlay (Build)
* [ ] „Auslassen“ auch in Rundtour und Web (heute nur Tour planen)
* [ ] Datencheck Rest: etwa 70 Strecken einzeln prüfen
* [ ] Profilfoto (expo-image-picker ist im Build, noch nicht verwendet)
* [ ] Lead Blatt nach dem Prototyp, Vermeiden als feste Einstellung
* [ ] Missbrauch Stufe 2, Lernen Stufe 2

* [ ] Passseiten auf cumodrive.de (Entwurf separat im Artefakt). Regeln (Koray 16.11.): Seiten nur für bekannte Pässe und Ikonen, die ohnehin öffentlich sind; keine Seiten für Geheimtipps, bevorzugte Strecken und Korays Insider Strecken; Linie nur als gezeichnete Form ohne Koordinaten, Ansage nur in Worten; nirgends eine maschinenlesbare Liste aller Strecken

## Mit Koray am Rechner

* [x] Routing Server: Prüfung des Konto Tokens im Zählmodus auf r1 und r2 (17.11. 8:38), App schickt Token (geprüft), Web mit Token (cumodrive-web-g.zip)
* [ ] Korays SSH Schlüssel auch auf r2 (bisher nur über r1 erreichbar)
* [x] Web Planer: Rückfrage bei nicht erreichbarer Rundtour Länge (17.11.)
* [ ] Zweiter Routing Server r2 hat ältere Daten (Import 13.11., r1 15.11.) und plant andere Routen; angleichen
* [x] Kurvig auf distance_influence 5 (auf beiden Servern geprüft, 17.11.)
* [x] Routen Check 17.11. morgens: Andraz und Cortina erledigt (siehe Abschnitt oben), Lugano ohne passende Runde

## Sprachen (EN, IT seit 16.11. in der App)

* [x] Rechtstexte (Datenschutz, AGB) auf Englisch und Italienisch in der App, mit Hinweis, dass die deutsche Fassung gilt (16.11.)
* [ ] Anwaltliche Prüfung deckt alle drei Fassungen ab (Koray mit Anwalt)
* [x] App Store Texte EN und IT im Doc „App Store Angaben“ auf Stand 17.11. (Begriffe wie in der App, Längen geprüft); Koray legt Italienisch in App Store Connect an
* [ ] Screenshots App Store und Landingpage auf Englisch und Italienisch
* [ ] Testfahrt mit italienischer und englischer Stimme: Zahlen, Einheiten, Kehren, Passnamen (zweisprachig in Südtirol)
* [x] Restliche Texte der App (rund 1000), Kurznachrichten der Gruppe (jedes Handy zeigt sie in seiner Sprache), Warnungen beim Anzeigen, Datum und Dezimalzeichen, Beifahrer Ansagen, englische Passnamen, Stimmenwahl je Sprache (16.11.)
* [x] Landingpage übersetzt (/en, /it, 17.11.)
* [x] Web: React Fehler 418 auf Englisch und Italienisch behoben (17.11.)
* [ ] Später: Meilen für UK und USA, Italien bleibt metrisch

## Für Koray

* [ ] cumodriversclub.de und rallycumo.de liefern dieselben Seiten doppelt aus (Status 200, canonical auf rallycumo.de): eine Domain per 301 auf die andere weiterleiten (Koray schaut separat)

* [ ] Restliche sechs iPhone Screenshots für die Landingpage
* [ ] Liste der Gründungstester vor der Veröffentlichung
* [ ] 3D Designer für die Fahrzeug Formen beauftragen (heute Kenney Car Kit, CC0)
* [ ] CarPlay: Namen der Knöpfe, Rundtouren aus dem Auto automatisch speichern, Community Touren in der Liste im Auto

## Erledigt am 16.11.

* [x] App Store Connect: Deutsch als Primärsprache, Texte, 9 Bilder, Kategorie, Datenschutz URL; Vorlage für Datenschutz Fragebogen, Altersfreigabe und Prüfhinweise im Doc „App Store Angaben CUMO DRIVE“
* [x] 32 neue Strecken (DE), Sperrungen nur einmal je Stelle, Zahlen auf Webseite und im Store als Schwellen
* [x] Web: Strecken, Pässe und Empfehlungen nur nach Anmeldung (Edge Function road-data, Fingerabdruck je Konto)
* [x] App schickt das Konto Token an die eigenen Server (Prüfung auf dem Server folgt, braucht Zugang über Koray)
* [x] Schweiz: 20 Strecken, 6 Pässe (Pragel, Passwang, Tourne, Champex, Luzisteig, Pétra Félix); Klausen fällt weiter mit Schleife durch, Schleifenprüfung ansehen
* [x] Funk ruht nach 10 Minuten Stille und weckt die Gruppe beim Drücken; Positionen nach Tempo; livekit-client nur einmal im Paket

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

* [ ] GitHub Secret EXPO_TOKEN eintragen, damit OTA über den Zweig ota/* aus jeder Sitzung geht (Koray 17.11.: Backlog; bis dahin veröffentlicht Claude OTA direkt nach dem Testlauf)
* [ ] Captcha bei der Registrierung (Entscheidung 17.11.: Hürde für Nutzer, erst bei Missbrauch; Zahlen in signup_attempts)
* [ ] App Attest, zusammen mit engeren Grenzen für den Web Planer (wenn es echte Nutzer gibt)
* [ ] Erinnerung mit Standort „Immer“ (Variante c, Teil b): braucht expo-task-manager, einen Build und strengere Apple Prüfung (Koray 17.11.: erst bei Bedarf)

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
* Gesammelt für Build 34: CarPlay Tempo oben bündig nachjustiert (6 statt 2 pt); Hinweis auf der Karte („Wähle oben…“) mit Innenabstand und mehr Abstand unten
* In TestFlight bis Build 33 (15.11.: iOS Tableiste, CarPlay Linie genau am Auto, Dann Symbole zugeschnitten, Tempo oben, Rundung, dreistellige Limits); Expo Starter Plan
* OTA nur nach Korays OK aus einem sauberen Arbeitsstand ohne .env
* OTA seit 17.11. über einen Zweig ota/JJJJMMTT-HHMM (GitHub Actions, Testlauf vor dem Update)
* Build 34 (17.11.): App Icon, CarPlay Kompass und Feinschliff. Build 35 (17.11.): Kaufbaustein RevenueCat

## Routing Server

* Server 1 (13.140.213.164) Produktion, Server 2 (13.140.213.114) zweiter Server und Testbetrieb; GraphHopper 11.1, Ortssuche Photon auf beiden, Valhalla auf Server 2
* Profile: Sportwagen, Auto, Kurvig (Bundes und Landesstraßen nur außerorts abgewertet seit 15.11.)
* Neuaufbau wöchentlich (So Server 1, Mo Server 2, Di Valhalla); die App wechselt solange auf den anderen Server
* Details in docs/betrieb.md
