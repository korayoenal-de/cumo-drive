# Rechtstexte Cumo Drive (Entwurf)

Stand: 10. November 2026. Entwurf von Claude auf Wunsch von Koray, keine Rechtsberatung, anwaltliche Prüfung ausstehend. Live unter drive.rallycumo.de/datenschutz und /agb, Quelle im Repo: app/src/content/legal.ts.

## Annahmen
* Anbieter und Verantwortlicher: CUMO DRIVERS CLUB, vertreten durch Koray Önal, wie im Impressum von rallycumo.de (Rechtsform dort nicht angegeben, behandelt wie Einzelunternehmen). Die Anschrift steht bewusst nur im verlinkten Impressum.
* Kontakt: kontakt@rallycumo.de (wie in der App).
* Kein Datenschutzbeauftragter nötig (weniger als 20 Personen mit Datenverarbeitung).
* Aufsichtsbehörde Hessen.
* Bewertungen und Spuren werden zusammengefasst ohne Personenbezug ausgewertet (berechtigtes Interesse mit Widerspruchsrecht).
* Seit 10.11.: Nutzung der Planung (geplant, neu gewürfelt, gespeichert, übernommen, veröffentlicht, gelöscht, losgefahren) wird mit der Linie der Tour gespeichert, ohne die ersten und letzten 2 km. Tabelle route_signals, nur Schreiben für den Nutzer, kein Lesen; Auswertung erst ab drei verschiedenen Fahrern je Abschnitt; Einträge höchstens 24 Monate.
* Server Protokolle höchstens 14 Tage (bei Contabo und Supabase so einstellen).
* "Konto löschen" in der App unter Einstellungen, Konto.
* Seit 10.11.: Profil mit Wohnort (Ortsmitte), Über mich und Schalter für Sichtbarkeit unter Drivers, Nachrichten und Fuhrpark; private Nachrichten; Push Mitteilungen (Expo, Apple); Funk über LiveKit Cloud (Frankfurt) ohne Aufzeichnung.

## Offen für den Anwalt
* Rechtsform und ladungsfähige Anschrift: Impressum nennt c/o Privatanschrift; für App Store und Impressum eine Geschäftsanschrift oder Zustelladresse prüfen. Impressum hat noch "§ 5 TMG" statt DDG.
* Auftragsverarbeitungsverträge abschließen und dokumentieren: Supabase, Contabo, Expo. Status von komoot Photon, FOSSGIS Valhalla und Overpass (öffentliche Dienste ohne AVV, Übermittlung von Koordinaten).
* Drittlandübermittlung: Expo (USA, Data Privacy Framework prüfen, auch für Push), Supabase Inc. (USA, Daten in Frankfurt), Apple, LiveKit Inc. (USA, Server Frankfurt; AVV und Übermittlungsgrundlage prüfen, im Text stehen Standardvertragsklauseln).
* Google Fonts auf der Landingpage: besser lokal einbinden, dann den Absatz streichen.
* Auswertung von Spuren, Bewertungen und der Nutzung der Planung (seit 10.11.): genügt berechtigtes Interesse mit Widerspruch, oder Einwilligung nötig? Reicht das Abschneiden von 2 km an Start und Ziel, oder braucht es mehr (etwa Einstellung zum Abschalten in der App)?
* AGB: Widerrufsrecht bei Kauf über Apple, Änderungsklausel (Zustimmungsfiktion, BGH Rechtsprechung), Haftungsklausel, Datenbankschutz und ODbL Formulierung, Club Lizenzen (B2B) gesondert regeln.
* Verbraucherschlichtung: Hinweispflicht nach VSBG erst ab mehr als 10 Beschäftigten, Formulierung prüfen.

## Datenschutz

Cumo Drive ist eine Navigations App für Sportwagen, mit App für das iPhone, CarPlay und Web Planer. Hier steht, welche Daten dabei entstehen, wofür wir sie brauchen und wer sie zu sehen bekommt. Kurz gesagt: Wir zeigen keine Werbung, verkaufen keine Daten und setzen keine Tracking Dienste ein.

### 1. Verantwortlich

Verantwortlich für die Verarbeitung ist der Betreiber von Cumo Drive, CUMO DRIVERS CLUB, vertreten durch Koray Önal. Die vollständige Anschrift steht im Impressum unter https://rallycumo.de/impressum/.

Bei Fragen zum Datenschutz erreichst du uns unter kontakt@rallycumo.de. Einen Datenschutzbeauftragten haben wir nicht bestellt, weil wir dazu nicht verpflichtet sind.

### 2. Welche Daten wir verarbeiten

* Konto: E-Mail-Adresse, Passwort (nur verschlüsselt gespeichert), Anzeigename, unter dem dich andere zur Gruppenfahrt einladen.
* Touren: geplante und gespeicherte Touren mit Wegpunkten, Linie, Namen und Ordnern, außerdem Touren, die du in der Community veröffentlichst.
* Fahrten: wenn du eine Navigation startest, die gefahrene Spur mit Zeit, Tempo und Statistik (Kilometer, Kurven, Querbeschleunigung) sowie deine Bewertung der Fahrt mit Gründen und Notiz.
* Nutzung der Planung: wenn du eine Rundtour planst, neu würfelst, eine Tour speicherst, übernimmst, veröffentlichst, löschst oder losfährst, speichern wir dazu die Linie der Tour, ihre Länge, das Profil und den berechneten Fahrspaß. Die ersten und letzten 2 km der Linie schneiden wir vorher ab, damit Start und Ziel, etwa deine Haustür, nicht enthalten sind.
* Fahrzeuge: Angaben aus deiner Garage wie Marke und Modell, Form und Farbe des Fahrzeugsymbols.
* Profil und Community: Wohnort (für andere nur als Ortsmitte, nie als Adresse), der Text Über mich, ob du unter Drivers sichtbar bist, ob andere dich anschreiben dürfen und ob sie deinen Fuhrpark sehen. Dazu private Nachrichten, Ausfahrten mit Anfragen und Chat.
* Funk in der Gruppenfahrt: deine Stimme nur, solange du den Funk Knopf gedrückt hältst. Sie wird live an die anderen Teilnehmer übertragen und nicht aufgezeichnet oder gespeichert.
* Mitteilungen: wenn du sie erlaubst, ein Gerätekennzeichen für Push Mitteilungen bei Nachrichten, Einladungen und Anfragen.
* Standort: während Planung und Navigation, um dich zu führen und Rundtouren ab deinem Standort zu planen. In einer Gruppenfahrt sehen die anderen Teilnehmer deine Position live, solange die Fahrt läuft.
* Kamera und Mikrofon: die Kamera nur, um einen QR Code aus dem Web Planer zu lesen; Bilder speichern wir nicht. Das Mikrofon nur für den Funk, solange du den Knopf drückst.
* Kauf: ob du ein Abo hast und wann es endet. Bezahldaten sieht nur Apple, wir nicht.
* Technische Daten: beim Abruf von Servern fallen IP-Adresse, Zeitpunkt und Gerätetyp an. Wir werten sie nicht zu Profilen aus.

### 3. Wofür und auf welcher Grundlage

* Bereitstellen der App, deines Kontos, der Planung, Navigation, Gruppenfahrt und des Abgleichs zwischen App und Web Planer: zur Erfüllung des Vertrags mit dir (Art. 6 Abs. 1 lit. b DSGVO).
* Standort: nur mit deiner Erlaubnis im iPhone, die du jederzeit in den Einstellungen widerrufen kannst. Ohne Standort kannst du weiter planen, aber nicht navigieren.
* Verbesserung der Strecken: Bewertungen, gefahrene Spuren und die Nutzung der Planung werten wir zusammengefasst und ohne Bezug zu deiner Person aus, um den Fahrspaß Pegel von Straßen zu verbessern und die Planung zu verbessern (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO). Ein Straßenabschnitt fließt erst ein, wenn mindestens drei verschiedene Fahrer ihn genutzt haben. Niemand außer der Auswertung sieht deine einzelnen Einträge, auch andere Fahrer nicht. Du kannst dem jederzeit unter der oben genannten Adresse widersprechen.
* Sicherheit und Missbrauchsschutz der Server: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).
* Gesetzliche Aufbewahrung, etwa bei Club Lizenzen auf Rechnung: rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO).

### 4. Wer Daten bekommt

Wir geben Daten nur an Dienste weiter, die wir für die jeweilige Funktion brauchen. Mit Auftragsverarbeitern bestehen Verträge nach Art. 28 DSGVO.

* Supabase (Supabase Inc., Server in Frankfurt am Main): Konto, Touren, Fahrten, Fahrzeuge, Passstatus und die Echtzeit Verbindung der Gruppenfahrt. Auftragsverarbeiter.
* Eigener Routing Server bei Contabo (Contabo GmbH, Deutschland): berechnet Routen aus deinen Wegpunkten. Auftragsverarbeiter.
* Apple (Apple Distribution International, Irland, und Apple Inc., USA): App Store, Abos, Kartenanzeige mit Apple Maps, CarPlay und Wetter an den Pässen über WeatherKit. Für das Wetter übermitteln wir die Lage des Passes, nicht deinen Standort.
* Expo (650 Industries Inc., USA): liefert Aktualisierungen der App aus. Dabei fallen IP-Adresse und Gerätedaten an. Grundlage für die Übermittlung in die USA ist das EU US Data Privacy Framework.
* Photon von komoot (komoot GmbH, Deutschland): Ortssuche und die Namen von Wegpunkten. Übermittelt wird der Suchbegriff oder die Koordinate.
* Valhalla Server der FOSSGIS e.V. (Deutschland): Höhenprofil, Tempolimits entlang der Route und Ersatzrouting, wenn unser Server nicht erreichbar ist. Übermittelt wird die Linie der Route.
* Overpass API (FOSSGIS e.V. und kumi systems, Europa): Tankstellen, Aussichtspunkte, Cafés und Restaurants entlang der Route. Übermittelt wird ein Bereich um die Route.
* GraphHopper (GraphHopper GmbH, Deutschland): Vergleichsrouting für kurvige Profile, wenn unser Server nicht erreichbar ist.
* TomTom (TomTom International B.V., Niederlande): liefert unserem Server Meldungen zu gesperrten Pässen und aktuellen Sperrungen. Unser Server fragt dafür grobe Kartenbereiche ab, keine Daten von dir.
* LiveKit (LiveKit Inc., USA, Server in Frankfurt am Main): überträgt den Funk in der Gruppenfahrt live zwischen den Teilnehmern, ohne Aufzeichnung. Übermittelt werden dein Anzeigename, eine Kennung und deine Stimme, solange du sprichst. Auftragsverarbeiter; Grundlage für eine Übermittlung in die USA sind Standardvertragsklauseln.
* Push Mitteilungen über Expo (650 Industries Inc., USA) und den Apple Push Dienst: Titel, kurzer Text und Gerätekennzeichen der Mitteilung.
* Im Web Planer zusätzlich: OpenFreeMap für die Karte und unpkg für die Kartenbibliothek. Die Landingpage lädt Schriften von Google Fonts (Google Ireland Limited); dabei wird deine IP-Adresse an Google übermittelt.
* Andere Fahrer: in einer Gruppenfahrt Anzeigename, Fahrzeug, Live Position und im Funk deine Stimme, nur für die Dauer der Fahrt. In der Community deinen Anzeigenamen und die veröffentlichte Tour, unter Drivers (abschaltbar) Name, Ortsmitte, Über mich und auf Wunsch deinen Fuhrpark. Private Nachrichten sieht nur der Empfänger.

### 5. Wie lange wir speichern

* Konto, Touren, Fahrten und Fahrzeuge, bis du sie löschst oder dein Konto löschst.
* Einträge zur Nutzung der Planung höchstens 24 Monate, danach bleiben nur die zusammengefassten Werte je Straßenabschnitt.
* Live Positionen der Gruppenfahrt werden nicht gespeichert, sondern nur während der Fahrt zwischen den Teilnehmern ausgetauscht.
* Server Protokolle höchstens 14 Tage.
* Rechnungsdaten von Club Lizenzen so lange, wie Handels und Steuerrecht es verlangen (bis zu 10 Jahre).

### 6. Konto löschen

Du kannst dein Konto jederzeit in der App unter Einstellungen, Konto, Konto löschen entfernen. Dabei löschen wir Konto, Touren, Fahrten, Fahrzeuge, deine Bewertungen und die Einträge zur Nutzung der Planung. Veröffentlichte Community Touren verschwinden ebenfalls. Bereits zusammengefasste Auswertungen ohne Personenbezug bleiben bestehen. Ein Abo kündigst du getrennt davon in den Einstellungen deiner Apple ID.

### 7. Auf dem Gerät

Die App speichert Touren, Einstellungen (zum Beispiel Kartenstil, Stimme, Tempo Anzeige) und deine Anmeldung auf dem iPhone. Der Web Planer speichert Touren und Anmeldung im Browser. Wir setzen keine Cookies zu Werbe oder Analysezwecken; was wir lokal speichern, ist für die Funktion nötig (§ 25 Abs. 2 TDDDG).

### 8. Deine Rechte

Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15 bis 21 DSGVO). Eine Einwilligung kannst du jederzeit für die Zukunft widerrufen. Schreib uns dafür an kontakt@rallycumo.de.

Du kannst dich außerdem bei einer Datenschutz Aufsichtsbehörde beschweren, zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.

### 9. Keine automatisierten Entscheidungen

Wir treffen keine Entscheidungen, die allein auf automatisierter Verarbeitung beruhen und dir gegenüber rechtliche Wirkung entfalten.

### 10. Änderungen

Wenn wir neue Funktionen einführen, passen wir diese Erklärung an. Die jeweils aktuelle Fassung steht hier.

## Nutzungsbedingungen (AGB)

Allgemeine Geschäftsbedingungen und Nutzungsbedingungen. Diese Bedingungen gelten für die App Cumo Drive auf dem iPhone und in CarPlay sowie für den Web Planer. Ergänzend gilt für Käufe über den App Store die Standard Lizenzvereinbarung von Apple.

### 1. Anbieter und Geltung

Anbieter ist der CUMO DRIVERS CLUB, vertreten durch Koray Önal (Anschrift im Impressum unter https://rallycumo.de/impressum/, Kontakt kontakt@rallycumo.de). Diese Bedingungen gelten für alle Nutzer. Abweichende Bedingungen von Nutzern gelten nicht.

### 2. Leistung

Cumo Drive plant Touren für Sportwagen, prüft sie gegen Straßendaten (Breite, Belag, Sperrungen), kündigt Pässe und Traumstrecken an, führt per Navigation und verbindet Fahrer in Gruppenfahrten. Grundlage sind Daten von OpenStreetMap, Apple und weiteren Diensten sowie unsere eigene Strecken und Pass Datenbank.

Wir entwickeln Cumo Drive laufend weiter. Funktionen können sich ändern, solange der Kern der Leistung erhalten bleibt. Die App kann zeitweise eingeschränkt sein, etwa bei Wartung oder wenn Dienste Dritter ausfallen; dann plant sie über Ersatzdienste mit weniger Funktionen.

### 3. Sicherheit geht vor

* Die Straßenverkehrsordnung und Verkehrszeichen haben immer Vorrang vor den Hinweisen der App, auch bei Tempo, Sperrungen und Abbiegehinweisen.
* Bediene die App nicht während der Fahrt, außer über CarPlay oder die Sprachansagen. Plane vor der Fahrt oder lass Beifahrer planen.
* Strecken, Breiten, Belag, Passstatus, Wetter, Tempolimits und Kurvenhinweise beruhen auf Daten Dritter und Schätzungen. Sie können falsch, veraltet oder unvollständig sein. Prüfe Sperrungen und Wetter vor der Fahrt selbst.
* Cumo Drive ist kein Wettbewerbs oder Rennwerkzeug. Fahre angepasst und im Rahmen der Gesetze.

### 4. Konto

Für die App brauchst du ein Konto mit E-Mail-Adresse und Passwort. Halte dein Passwort geheim. Du kannst dein Konto jederzeit in der App löschen. Wir dürfen ein Konto sperren, wenn es gegen diese Bedingungen verstößt, nach Möglichkeit erst nach einer Warnung.

### 5. Abos und Preise

* Kostenpflichtige Pläne kaufst du in der App über Apple. Es gelten die Preise, die die App vor dem Kauf anzeigt, inklusive Umsatzsteuer. Abgerechnet wird über deine Apple ID.
* Wochen, Monats und Jahresabo verlängern sich automatisch um dieselbe Laufzeit, wenn du nicht spätestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple ID kündigst. Der Saison Pass gilt für die angegebene Zeit und endet von selbst.
* Bietet die App eine kostenlose Probezeit an, beginnt das gewählte Abo nach deren Ende, wenn du nicht vorher kündigst.
* Erstattungen beantragst du bei Apple. Dein gesetzliches Widerrufsrecht richtet sich nach den Bedingungen von Apple; mit dem sofortigen Freischalten der Inhalte nach dem Kauf kann es vorzeitig erlöschen.
* Club Lizenzen und Event Pässe für Clubs und Veranstalter schließen wir gesondert ab und rechnen per Rechnung ab. Mitglieder eines Clubs mit gültiger Lizenz können die Funktionen ohne eigenes Abo nutzen, solange die Lizenz läuft.

### 6. Unsere Inhalte und Daten

* App, Web Planer und unsere Inhalte, insbesondere die von uns zusammengestellten Datenbanken zu Pässen, Strecken, Highlights und Touren mit Bewertungen, Beschreibungen und Ansagen sowie die Routing Profile, sind urheberrechtlich und als Datenbank nach §§ 87a ff. UrhG geschützt.
* Du darfst sie für eigene, private Zwecke in App und Web Planer nutzen. Club Lizenzen berechtigen zur Nutzung für Ausfahrten des Clubs.
* Nicht erlaubt sind: systematisches oder automatisiertes Auslesen und Speichern (Scraping, Bots, nicht öffentliche Schnittstellen), das Vervielfältigen oder Verbreiten wesentlicher Teile der Datenbanken, die Nutzung zum Aufbau oder Training eines konkurrierenden Dienstes oder KI Modells sowie das Umgehen technischer Schutzmaßnahmen, soweit das Gesetz es nicht erlaubt.
* GPX und KML Export dienen der persönlichen Nutzung, etwa in einem Navigationsgerät. Gewerbliche Weitergabe exportierter Touren ist nur mit unserer Zustimmung erlaubt.
* Kartendaten stammen teilweise von OpenStreetMap (© OpenStreetMap Mitwirkende, Lizenz ODbL). Für diese Daten gelten die Bedingungen der ODbL; diese Bedingungen schränken die dort gewährten Rechte nicht ein.

### 7. Deine Inhalte

* Touren, Texte und Bewertungen, die du erstellst, bleiben deine.
* Wenn du eine Tour in der Community veröffentlichst, erlaubst du uns unentgeltlich, sie in Cumo Drive anzuzeigen, anderen Nutzern bereitzustellen und zur Verbesserung der Routenplanung zu nutzen. Die Anzeige endet, wenn du die Tour zurückziehst oder löschst.
* Bewertungen und gefahrene Spuren werten wir zusammengefasst und ohne Bezug zu deiner Person aus, um Straßen zu bewerten. Die Auswertung wird Teil unserer Datenbank.
* Veröffentliche nur, was du darfst: keine fremden Inhalte ohne Rechte, keine beleidigenden oder rechtswidrigen Inhalte, keine Strecken, die zu verbotenem Verhalten auffordern. Wir dürfen solche Inhalte entfernen.

### 8. Haftung

Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, für Schäden aus der Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den typischen, vorhersehbaren Schaden. Im Übrigen ist die Haftung ausgeschlossen.

Für Inhalte und Verfügbarkeit von Diensten Dritter (Karten, Wetter, Passstatus, Ortssuche) übernehmen wir keine Gewähr.

### 9. Änderungen dieser Bedingungen

Wir können diese Bedingungen ändern, wenn sich Gesetze, Funktionen oder Dienste ändern. Über wesentliche Änderungen informieren wir dich vorher in der App. Widersprichst du nicht innerhalb von sechs Wochen, gelten die neuen Bedingungen; auf diese Folge weisen wir in der Mitteilung hin.

### 10. Schluss

* Es gilt deutsches Recht. Bist du Verbraucher mit gewöhnlichem Aufenthalt in einem anderen Staat, bleiben die zwingenden Schutzvorschriften dieses Staates unberührt.
* Wir nehmen nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil und sind dazu nicht verpflichtet.
* Ist eine Bestimmung unwirksam, bleiben die übrigen wirksam.
