# CUMO DRIVE ToDos

Stand: 18. November 2026, 14:30 (gegen Code und Git Verlauf geprüft; Prüfung vor dem Start im Doc „Startprüfung CUMO DRIVE“)

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
* [x] 18.11. 16:33: /stats angesehen. r1: 333 mit Token, 35.618 ohne. r2: 881 mit, 8.074 ohne, 120 mal über der Grenze (route stand auf 60 je Minute, genau der Grenze). Nicht scharf geschaltet: Herkunft der Anfragen ohne Token unklar, und der Testlauf (feste Routen, Bedienfolgen, GitHub Actions) fragt selbst ohne Token
* [x] **Routing Server scharf seit 19.11. 10:50** (r1 und r2): ohne gültiges Konto Status 401, Grenze Route 300 je Minute und 2000 je Stunde (echte Spitze war 132 und 177), Testschlüssel in /etc/cumo-auth.env, als GitHub Secret ROUTING_QA_KEY und in der Sitzung. Zählung davor: kein Eintrag von App oder Web ohne Konto, über 95 % eigener Testlauf, Rest Roboter (scrapy). Geprüft: Testlauf grün gegen die scharfen Server, Planung in der App mit echtem Konto (Koray). Zurück: `bash /root/cumo-auth.sh count` auf beiden Servern
* [ ] ROUTING_QA_KEY als Umgebungsvariable für künftige Claude Sitzungen eintragen (Koray); ohne ihn sind die festen Routen im Testlauf dort rot. OTA über den Zweig ota/* braucht ihn nicht in der Sitzung
* [x] „Passwort vergessen“ in App und Web (19.11.): Link auf der Anmeldung, Mail in drei Sprachen, Seite cumodrive.de/passwort. Web Paket x, OTA be84b32d
* [x] Testlauf weist sich mit einem Testschlüssel aus (Koray 18.11.): Kopfzeile X-Cumo-QA, Wert aus ROUTING_QA_KEY, auf den Servern in /etc/cumo-auth.env. Gebaut und lokal getestet, noch nicht eingespielt
* [ ] 19.11. mit Koray, App Store Connect: Abos mit Screenshot für die Prüfung, Adresse für die Server Mitteilungen von Apple, Store Build wählen, zur Prüfung hinzufügen
* [x] **Bestätigungsmail (Koray 18.11.), erledigt 19.11.** Versand über Brevo (smtp-relay.brevo.com, Domain cumodrive.com mit DKIM und DMARC bestätigt), Vorlage in drei Sprachen, Link auf cumodrive.de/bestaetigt mit Code statt Adresse bei supabase.co, Seite löst den Code selbst ein. Test von Koray: Mail im Posteingang bei iCloud, Bestätigung, Anmeldung und leere Garage passen. Dazu: Konto löschen im Web Planer, neue Anmeldung übernimmt keine Reste eines früheren Kontos, Brevo in der Datenschutzerklärung. Web Paket w und OTA 4e942e93 (Stand 2a4ccee). Details in supabase/templates/README.md
* [ ] Brevo: Vertrag zur Auftragsverarbeitung im Konto prüfen und als PDF ablegen; Abmeldezeile (List Unsubscribe) für diese Mails abschalten, falls möglich; DMARC nach einigen Tagen von none auf quarantine; Mail Limit in Supabase (30 je Stunde) vor dem Start anheben
* [ ] Nach der Einreichung prüfen: Bekommt der Angefragte bei einer Kontaktanfrage eine Push Mitteilung? Sonst Vorschlag mit Schalter in den Einstellungen (braucht eine Migration, Koray 18.11.: morgen ansehen)
* [ ] Navigation, aus der Busfahrt vom 18.11.: Ansage, wenn die App nah am Ziel direkt hinführt statt zurück auf die Tour (Vorschlag „Du fährst jetzt direkt zum Ziel“, wartet auf Korays Ja); Auto stand neben der Linie, erst mit Fahrtprotokoll aus dem Auto verfolgen
* [x] 18.11. abends per OTA: Fahrerkarte Variante A (Kontakt Knopf wie in der Liste, Melden und Blockieren mit Symbol und Wort), „dabei seit“ ausgeblendet, Ring immer weiß, Kontakte ohne endlosen Wartekreis, alle Supabase Anfragen mit Frist von 20 s
* [ ] **Store Build 36** (19.11., Profil production, eigener Kanal production, Stand cd938f4): in der Version wählen und nach Korays OK einreichen. Veröffentlichung steht auf manuell. Abos mit Prüf Screenshot, Server Mitteilungen auf RevenueCat (Produktion und Sandbox) erledigt
* [ ] Vor dem Start: Händlerstatus nach dem Gesetz über digitale Dienste steht bei Apple seit 17.11. auf „In Prüfung“; ohne Bestätigung erscheint die App nicht in der EU (Koray: Postfach auf Rückfragen prüfen)
* [ ] Am Tag der Veröffentlichung: `update public.app_launch set release_at = ...` (bis dahin ist für alle alles frei, auch für das Prüfkonto)
* [ ] Mit 1.0.1 (braucht einen Build): Berechtigungstexte (Standort, Mikrofon, Kamera, Fotos) auch auf Englisch und Italienisch; Store Beschreibung nennt 14 Tage, die App gibt bis Jahresende 30
* [ ] Screenshots EN und IT erst mit Version 1.0.1 (Koray 18.11.: Einreichung ohne, bis dahin zeigt Apple die deutschen Bilder; die deutschen dienen als Vorlage)
* [x] Webseite mit Kopfzeilen und Strecken kachelweise live, Kopfzeilen geprüft (17.11.)
* [x] Migrationen live: highlight_feedback nur mit Anmeldung, Link Grenzen, Konten Grenze, road-data kachelweise mit Kontingent, Einwilligungen (17.11.)
* [x] Hook Before User Created aktiv, E Mail Bestätigung an (17.11.)
* [ ] profile-next.sh auf r1 und r2 (nach dem Neuaufbau von r2), Profil schnell kommt mit dem nächsten Neuaufbau; danach FAST_SPEED und WIDTH_MODEL aus cumo-routing.ts löschen
* [x] OTA: Kurvig Gewichtungen nur im Server, Untertitel längste Runde (17.11.)
* [x] App Daten verschleiert und mit Fingerabdruck app-paket (17.11., OTA; nach Änderungen an den JSON Dateien `npm run pack-data`)
* [x] Opt in bei der Registrierung live (Migration, Webseite m, OTA 17.11.)
* [ ] Nach dem Start: Rundtour Bewertung als Server Dienst, Alarm bei auffälligen Konten, Marke anmelden, AGB zum Anwalt

## Performance aus der Startprüfung (17.11. abends, Zweig perf, wartet auf Korays OK)

* [x] Punkt 1: Strecken, Pässe und Empfehlungen werden erst beim ersten Gebrauch entpackt und aufbereitet (lib/lazy-list.ts), spätestens im Vorladen nach der Startanimation. Am Rechner rund 85 ms weniger vor dem ersten Bild, auf dem iPhone geschätzt das Drei bis Vierfache
* [x] Punkt 2: Linien vom eigenen Routing Server kodiert (Faktor 1e6, gleiche Genauigkeit). Gemessen an einer Runde Heppenheim Hirschhorn (86 km): Antwort 20 statt 68 KB, gepackt übertragen 12 statt 19 KB
* [x] Punkt 3: Bilder verlustfrei verkleinert, Fahrzeugbogen 4,5 auf 3,5 MB, übrige PNG 1,4 auf 0,9 MB. Die Schätzung „4 MB weniger“ war zu hoch; mehr ginge nur mit sichtbarem Verlust (weniger Farben)
* [ ] Punkt 4: Messung mit Xcode Instruments auf dem iPhone (Koray am Mac, etwa 30 Minuten)

## Nutzerstimmen umgesetzt (17.11. abends)

* [x] Erinnerung vor der Verlängerung: Jahr 7 Tage vorher, Saison Pass und Gratismonat 3 Tage vor dem Ende (lokal, nur mit erlaubten Mitteilungen)
* [x] Touren bleiben nach dem Ende von Test oder Plan im Konto; die abgelaufene Mitgliedschaft bietet „Deine Touren als GPX sichern“
* [x] Absturzberichte ohne Fremdanbieter: JavaScript Fehler und Abstürze gehen gesammelt nach Supabase (Tabelle app_errors, je Version zusammengezählt), Fehlerseite mit Neu laden statt weißem Bildschirm. Native Abstürze weiter in App Store Connect
* [x] Verpasster Zwischenpunkt: „Neue Route ab hier“ nimmt den Fortschritt mit; auf Runden mit gleicher Hin und Rückfahrt kommen schon gefahrene Zwischenziele nicht mehr zurück (Test in lib.test.ts)
* [x] Start: 30 Tage frei für alle Konten bis 31.12.2026, danach 14 (Migration 20261117170000_start_30_tage.sql)
* [x] Apple Gratismonat (Einführungsangebot „1 Monat kostenlos“) für Jahr, Monat und Woche in App Store Connect, alle 175 Regionen, ab 17.11.; Paywall zeigt „Noch X Tage kostenlos“ und „Erster Monat kostenlos“
* [ ] Fehler der App in der Prüfung (Einstellungen, Admin) anzeigen, statt nur in Supabase (Claude)

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

* [x] Eigenes Impressum für CUMO DRIVE (cumodrive.de/impressum und in der App, drei Sprachen, 18.11.); alle Verweise umgestellt
* [x] Datenschutz und AGB nach bestem Wissen fertiggestellt, ohne Anwalt (Koray 18.11.: Anwalt erst mit Einnahmen). Widerruf über Apple, Änderungen nur mit Zustimmung, Mindestalter 16, Fehlerberichte ergänzt, Hinweis Entwurf entfernt
* [ ] Später mit Anwalt: Restrisiken in docs/rechtstexte-entwurf.md (Haftung, berechtigtes Interesse, Expo, Club Lizenzen)
* [ ] Auftragsverarbeitungsverträge: Contabo im Kundenbereich abschließen, Contabo abgeschlossen und Expo angefragt (18.11.), bei Supabase, LiveKit und RevenueCat die Fassung ablegen (Koray; Fundstellen in docs/auftragsverarbeitung.md, 18.11.)
* [x] Händlerstatus bei Apple für die EU angegeben, Kontakt kontakt@cumodrive.com (Koray 17.11.)

### Zwingend: App

* [x] Melden und Blockieren (12.11.)
* [x] App Icon final (Build 34)
* [ ] Stabiler Build aus dem Testbetrieb: Build 29 in TestFlight; Rückmeldungen der Testrunde vom 14.11. eingearbeitet (Koray testet, Claude behebt)

### Zwingend: App Store Eintrag

* [x] Texte DE, EN und IT in App Store Connect (Name, Untertitel, Beschreibung, Werbetext, Schlagworte, Support und Marketing URL, 17.11.)
* [ ] Screenshots EN und IT (Koray 18.11.), Altersfreigabe, Inhaltsrechte (unter App Informationen noch offen)
* [ ] Angaben zum Datenschutz im Store eintragen: Vorlage im Doc „App Store Angaben“ auf Stand 18.11. (mit Käufen und Fehlerberichten), Koray trägt ein
* [ ] Testkonto mit aktiver Mitgliedschaft anlegen (Koray); Hinweise für die Apple Prüfung stehen im Doc „App Store Angaben“ (18.11., mit Abos, Konto löschen, englischen Beschriftungen)

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

* [ ] **Reiter Touren neu gliedern: Gespeichert, Geplant, Gefahren** (Koray 19.11.: gefällt, erstmal Backlog). Heute stehen Ausfahrten unter „Anstehend“ über den Touren, ohne Rolle und ohne das Wort. Idee: drei Reiter als Weg einer Tour. Gespeichert ohne Termin, Geplant alles mit Termin (organisiert, dabei, angefragt, auch privat, mit Rolle in jeder Karte), Gefahren. Entwurf im Artefakt „Touren und Ausfahrten: klarer Aufbau“ (https://claude.ai/artifact/MuuYbw18jECD48PQDGScXz), zweite Reihe. Offen: „Geplant“ ist neben „Tour planen“ doppelt belegt, Reiter 22 statt 26 pt, mit welchem Reiter die Seite öffnet

* [ ] **„Fläche mit Grund“ (flache Listen, Flächen nur für Zustand, Eingabe, Hervorhebung): geparkt auf dem Zweig `flaeche-mit-grund`** (Commit c3bb6dd). Am 19.11. kurz per OTA draußen und wieder zurückgenommen. Korays Urteil: Abstände fehlten, es wirkte trostlos und unfertig. Ohne Flächen muss alles andere genauer ausgearbeitet sein, vor allem das Spiel mit den Abständen. Später ansehen, vor einem neuen Anlauf erst als Entwurf im Artefakt

* [ ] **Lasttest Routing Server** (Koray 18.11.: Backlog): 10 Planungen gleichzeitig über 2 Minuten, abends, nur der Routing Server; Supabase bleibt außen vor. Trifft die echten Server, daher nur nach Korays OK
* [x] Gleiche Punkte, verschiedene Touren: Kurvig gegen den direkten Weg wird je Etappe entschieden (Koray 18.11., `planGroup` und `directLegs` in plan.ts). Miltenberg, Amorbach, Hirschhorn, Michelstadt: die drei gemeinsamen Etappen sind mit Ziel Beerfelden und Ziel Lindenfels gleich (18,8, 43,1 und 48,5 km). Noch nicht per OTA veröffentlicht
* [x] GitHub Secret EXPO_TOKEN eingetragen (Koray 19.11., eigener Token beim Expo Roboter „Github“). Probelauf über einen Zweig ota/* steht noch aus
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
