# calimoto Web Tourenplaner: Detailanalyse

Stand: 04.11.2026. Untersucht im angemeldeten Konto RALLYCUMO (Jahresabo Premium). Reine Beobachtung, nichts gespeichert, nichts verworfen. Ergänzt die bereits bekannte Grobanalyse in `calimoto-analyse.md`.

## 1. Planer: Start, Adresssuche, Karte, Kontextmenü

### Was es gibt
* Beim Öffnen von `/de/motorrad-routenplaner` wird die zuletzt bearbeitete, ungespeicherte Tour wiederhergestellt (hier "RCO EAST 26 E3"). Im zweiten Tab erschien dagegen ein leerer Planer. Der Entwurf hängt also am Tab bzw. an der Sitzung, nicht am Konto.
* Ladezeit: erst leere Fläche, dann Europakarte, nach etwa 8 bis 10 Sekunden erscheinen Seitenleiste und Route. Es gibt keinen Ladeindikator.
* Leerer Zustand der Seitenleiste: Kennzahlen als "–" (Distanz, Zeit, Kurven), Knopf "Vermeiden", Knopf "Gruppenfahrt", zwei Felder "Wo geht es los?" und "Wohin soll es gehen?", unten "Via Punkt hinzufügen", "Verwerfen" und "Speichern" (deaktiviert).
* Im leeren Zustand zeigt die Karte die gefahrenen Touren als blaue Linien (Premium Funktion). GPS Ausreißer erscheinen als lange gerade Linien quer durch Deutschland.
* Ein normaler Linksklick auf die Karte im leeren Planer setzt keinen Punkt. Das hängt an der Einstellung "Mausklick Verhalten".
* **Kontextmenü (Rechtsklick auf die Karte)**: dunkles Popover mit Pfeil zum Klickpunkt und vier Einträgen: "Als Start setzen", "Als Via Punkt setzen", "Als Ziel setzen", Trenner, "Hier Favorit erstellen". Escape und ein Klick in die Seitenleiste schließen es nicht. Es verschwindet erst beim nächsten Klick auf ein Kartenelement oder einen Chip. Beim Zoomen wandert es mit.
* **Adresssuche** (oben links über der Karte): Autocomplete ab wenigen Zeichen, maximal 5 Treffer, zweizeilig (Straße, PLZ Ort Region Land), ohne Icons oder Kategorien. Nur Adressen und Straßen: "Stilfser" liefert "Stilfser Joch Straße München" und mehrere Straßen, aber nicht den Pass als Ort. "Passo dello Stelvio" liefert nur Straßennamen. Strg+A funktioniert im Feld nicht zuverlässig, Text wird angehängt.
* Wegpunktliste: Start (Dreieck), nummerierte Via Punkte (1, 2, 3 …), Ziel (Flagge). Jeder Punkt ist ein editierbares Combobox Feld mit Adresse. Zwischen zwei Punkten steht eine Abschnittszeile mit Profil Dropdown sowie km und Zeit des Abschnitts.
* Unter Abschnitten mit Sperrungen gibt es ein Badge "Gesperrte Straße (4)" mit Aufklapper. Aufgeklappt zeigt es die Straßennamen (z. B. "SS52bis", 3 × "Plöckenpass Straße"). Doppelte Einträge werden nicht zusammengefasst.
* Gesperrte Abschnitte sind auf der Karte rot weiß gestrichelt mit rundem Verbotsschild. Ein Klick auf das Schild zoomt dorthin, es öffnet aber kein Popup mit Grund oder Zeitraum.
* Untere Werkzeugleiste mittig: Rückgängig, Wiederherstellen, Tour umkehren.
* Rechts unten: Standort, Zoom +/−, Kartenebenen.
* Kopf der Tour: Name mit Stift zum Umbenennen, Teilen Icon, Schließen X. Kennzahlen: km, Fahrzeit, Kurvenanzahl (Icon mit Zahl, z. B. 152).

### Wie bedient
* Punkte setzen per Rechtsklick Menü, per Suche oder durch Ziehen der Route (intelligente Via Punkte). Umsortieren erfolgt in der Liste. Ziehen und Umsortieren wurden nicht ausgeführt, um die offene Tour nicht zu verändern.
* Profil pro Abschnitt über das Dropdown (Schnell, Ohne Autobahn, Kurvig, Superkurvig, Haken am aktiven Eintrag). Es schließt sich mit einem zweiten Klick auf denselben Pfeil.

### Gut
* Profil pro Abschnitt, Sperrungen direkt am Abschnitt, Undo/Redo, Umkehren mit einem Klick.
* Das Kontextmenü ist klar und kurz.

### Schwach
* Keine Ladeanzeige, lange leere Karte.
* Die Suche findet keine POIs oder Pässe, obwohl es eine Kategorie Gebirgspässe gibt.
* Menüs schließen nicht mit Escape oder einem Klick daneben.
* Die Sperrung hat kein Info Popup (Grund, Zeitraum, Quelle).
* Der Entwurf ist an den Browser Tab gebunden und nicht als Konto Entwurf sichtbar.

## 2. Kategorien Chips (POIs)

### Was es gibt
* Horizontal scrollbare Chipleiste mit Pfeil rechts: Tankstellen, Gebirgspässe, Essen und Trinken, Sehenswürdigkeiten, Kurvenkombis, Bikertreffs, Campingplätze, Unterkünfte, Bikerhotels, Motorradparkplätze, Eisdielen.
* Ein aktivierter Chip wird zur dunklen Pille mit X. **Alle anderen Chips verschwinden**, es ist also immer nur eine Kategorie gleichzeitig aktiv.
* POIs erscheinen als dunkle runde Icons. Bei den Pässen steht der Name daneben (Sella Nevea, Passo Tanamea, Sedlo Učja).
* **Popup Tankstelle**: Name (Petrol Bovec), Adresse, Kategorie, Knöpfe Telefon und Webseite, aufklappbare Öffnungszeiten (heutiger Tag), Abschnitt "Details" mit Ausstattung (z. B. Druckluft), Quelle © OpenStreetMap, Herz (Favorit), X, großer roter Knopf "+ Hinzufügen" (als Via Punkt). Keine Spritsorten, keine Preise.
* **Popup Gebirgspass**: Name, Kategorie, Höhe (1.195 m), "+ Hinzufügen". Keine Wintersperre, keine Steigung, keine Fotos.
* **Popup Kurvenkombi**: nur der Titel "Kurvenkombi" und "+ Hinzufügen". Kein Name, keine Länge, keine Bewertung.
* Fotos entlang der Route (runde Bildmarker) öffnen eine Vollbild Lightbox mit Pfeilen links und rechts.

### Gut
* "Hinzufügen" direkt aus dem Popup in die Route ist sehr schnell.
* Telefon, Web und Öffnungszeiten für Tankstellen sind praktisch.

### Schwach
* Nur eine Kategorie gleichzeitig.
* Die POIs sind nicht nach Nähe zur Route gefiltert, es gibt keine Liste "Tankstellen entlang der Route".
* Die Pass und Kurvenkombi Daten sind dünn.

## 3. Karte, Ebenen, Höhenprofil, Kennzahlen

### Was es gibt
* **Kartenebenen** (Knopf unten rechts) öffnen das Panel "Karten Einstellungen*" mit Hinweis "*Wird als Cookie gespeichert": Radio Standard, Gelände, Satellit sowie die Checkbox "Bilder entlang der Route". Das Panel schließt mit einem zweiten Klick auf den Knopf.
* Die Kartenbasis ist Mapbox mit OSM. **Kurvige Straßen sind farbig umrandet** (gelb, orange, rot nach Kurvigkeit). Die Route ist dick rot mit weißem Kern.
* Zoom per Mausrad und +/− Knöpfen. Die Labels skalieren sauber.
* **Höhenprofil**: im Planer nicht sichtbar. Es gibt es nur auf der öffentlichen Tourdetailseite (Abschnitt "Höhenmeter" mit Flächendiagramm, Min und Max Achse, z. B. 441 m bis 2.533 m), ohne Hover Synchronisierung zur Karte.
* **Wegbeschreibung** (Turn by Turn Liste): im Web nicht gefunden.
* Die **Kurvenzahl** steht als Kennzahl im Tourkopf (Kurvenicon mit 152). Das Calimeter ist nur als Einstellung bekannt und wurde im Planer nicht als eigene Anzeige gesehen.

### Gut
* Die Kurvigkeitsfärbung des Straßennetzes ist das stärkste visuelle Planungswerkzeug.
* Satellit und Gelände lassen sich mit einem Klick umschalten.

### Schwach
* Kein Höhenprofil und keine Wegbeschreibung im Planer.
* Kartenwahl nur per Cookie, nicht im Konto gespeichert.

## 4. Meine Touren und Favoriten

### Was es gibt
* **Achtung**: Ist eine Tour offen, löst der Klick auf "Meine Touren" einen modalen Dialog aus: "Bist du dir sicher, dass du alle Routenpunkte entfernen möchtest?", Checkbox "Dieses Pop up nicht mehr anzeigen", "Abbrechen" und "Okay". Planen und Bibliothek schließen sich also gegenseitig aus.
* Im leeren Planer zeigt "Meine Touren" vier Tabs mit Icon und Zähler: Geplant (80), Gemerkt (0), Gefahren (104), Geteilt (3).
* Sortierung "Name • A bis Z" öffnet den modalen Dialog "Sortiere nach": Datum, Name, Distanz, Fahrzeit, mit Richtungspfeil sowie Abbrechen und Okay.
* Listenkarte: Titel fett plus Pills mit km und Fahrzeit. Keine Vorschaukarte, kein Datum, keine Kurvenzahl.
* Beim Hover über eine Karte öffnet sich links ein Detailpanel: Namensfeld, Minikarte mit Route, km und Zeit, Datum, Bewertung mit Sternen (Spaßfaktor, Landschaft, Straßenzustand), Tag Icons, "Datei Export", "In Route umwandeln" (bei gefahrenen Touren), Teilen, Papierkorb.
* Es gibt keine Suche, keine Ordner und keine Filter außer den vier Tabs. Viele Dubletten (gleiche Namen mehrfach) sind nicht unterscheidbar.
* Bei gefahrenen Touren treten unplausible Fahrzeiten auf (z. B. 91,6 km in 232:16 h, 525 km in 25:58 h), weil die Aufzeichnung offenbar nicht getrimmt wird.
* **Favoriten**: leerer Zustand nur mit dem Text "Du hast bisher keine Favoriten abgespeichert.", ohne Erklärung oder CTA.

### Gut
* Die Hover Vorschau mit Minikarte ist schnell.
* "In Route umwandeln" macht aus einer gefahrenen Aufzeichnung eine planbare Tour.

### Schwach
* Bei 80 bis 100 Touren gibt es keine Suche und keine Ordner.
* Der modale Verlust Dialog beim Wechsel ist sehr störend.
* Der leere Zustand der Favoriten ist ohne Hilfe.

## 5. Seite Touren (Entdecken)

### Was es gibt
* `/de/motorradtouren`: SEO Intro Text, Feld "Wohin soll es gehen? (Land oder Adresse)", Doppelschieber "Nach Länge filtern" von 20 km bis 1000+ km, Tag Filter als runde Icons: Wald, Gebirge, Wüste, Küste, Gewässer, Kurvig, Schnell, Offroad.
* Aussage "Über 200.000 Motorradtouren weltweit". Kartenkacheln mit Karte links und Foto rechts, "+5" Bilder, Merken Lesezeichen, km, Titel, Beschreibung des Nutzers. Viele Titel sind generisch ("Tour vom 2022 05 27").
* **Tourdetailseite** (`/de/calimotour/<slug>-tt-<id>`): Vollbildkarte mit Route und Fotomarkern, rechts eine Karte mit Bildergalerie (3er Raster, "8 Bilder"), Titel, "Gefahren von <user> · Datum", Fahrzeit, km, Höhenmeter bergauf und bergab, Kurvenzahl. Dazu Knöpfe (Daumen/Like, Merken, Melden), Beschreibung, Sternebewertung in drei Kategorien (Spaßfaktor, Landschaft, Straßenzustand), Tags, Höhenprofil, sticky "Planung starten" (rot) und "Datei Export".
* Es gibt keine Kommentare, keine Mehrfachbewertungen (nur die des Autors) und keine Pass Liste als Daten (nur im Freitext).

### Gut
* Die Detailseite ist kompakt und enthält alles für eine schnelle Entscheidung. "Planung starten" übernimmt die Tour in den Planer.
* Die drei Bewertungsdimensionen passen gut zu Sportwagen.

### Schwach
* Die Qualität der Inhalte ist gemischt (Rohaufzeichnungen, generische Namen).
* Es gibt keine Sortierung nach Beliebtheit und keine Suche nach Pässen.

## 6. Profilseite

### Was es gibt
* `/de/profil`: Avatar mit Kamera, Benutzername und "Benutzername ändern", "Meine Garage" (0 Fahrzeuge, Karussell mit Plus Kachel), Mitgliedschaft (Jahresabo, Verlängerungsdatum, Hinweis auf Verwaltung über den Apple Store), privates Profil (E Mail mit Verifizierungshinweis, Passwort, Geburtsjahr, Geschlecht), Newsletter Präferenzen, Ausloggen, Benutzerkonto löschen.
* **Keine Statistiken** (km gesamt, Kurven, Länder) im Web.

### Schwach
* Die Garage hat keinen Nutzen im Planer. Es wurde keine Verknüpfung von Fahrzeug und Routing gesehen.

## 7. Preise

* Basis (kostenlos): Tourenplanung weltweit mit Kurvenalgorithmus, Import (GPX, KML, ITN), POIs, Anzeige von Sperrungen (TomTom und OSM).
* Premium: Offlinekarten, Turn by Turn mit Sprachansagen, Export (GPX, KML, ITN), gefahrene Touren auf der Karte, synchronisierte Gruppenfahrten mit Standortteilen, Fahrt aufzeichnen, Android Auto und CarPlay, Warnung vor Blitzern und Gefahrenstellen, Geschwindigkeit und Tempolimit, Tour Statistiken (Schräglage, Beschleunigung).
* Preise: Wöchentlich 9,99 € (nur in der App), Jährlich 59,99 € ("am beliebtesten"), Saisonpass 3 Monate 39,99 € (Einmalzahlung). 14 Tage kostenlos testen. Gutscheine sind verfügbar.
* Social Proof: "3+ Millionen", 4,6 von 5 bei 56K+ Bewertungen.

## 8. Sonstiges

* Teilen Link Format für öffentliche Touren: `calimoto.com/de/calimotour/<slug>-tt-<id>`. Der Teilen Dialog im Planer wurde nicht geöffnet.
* Bestätigungsdialoge sind modale In Page Dialoge (keine Browser Dialoge) mit "Nicht mehr anzeigen".
* Tastaturkürzel: keine gefunden. Escape schließt weder Menüs noch das Kontextmenü.
* Onboarding: keine Hinweise oder Tooltips gesehen.
* Leere Zustände: nur Text (Favoriten) oder "–" (Kennzahlen).
* Sprache und Hilfe: DE Umschalter im Header, "Mehr" Menü, "App laden" in der rechten Leiste.
* Nicht geprüft: Via Punkt ziehen, Umsortieren, Teilen Dialog, Mausklick Verhalten. Diese Schritte hätten die offene Tour verändert.

## Für CUMO DRIVE übernehmen

### MVP
1. **Kurvigkeit als Kartenebene**: Straßen nach Kurvigkeit einfärben. Für Sportwagen zusätzlich nach Fahrbahnbreite und Belag gewichten, damit enge Feldwege nicht als "kurvig" glänzen.
2. **Profil pro Abschnitt**: Schnell, Landstraße, Kurvig, Superkurvig pro Etappe. Ergänzt um "Sportwagen tauglich" (Mindestbreite, keine unbefestigten Wege, kein Begegnungsverkehr Engpass).
3. **Rechtsklick Menü und Hinzufügen aus POI Popup**: übernehmen, aber Escape und Klick daneben schließen sauber.
4. **Sperrungen am Abschnitt mit Info**: zusätzlich Grund, Zeitraum und Quelle im Popup sowie Pass Wintersperren als eigene Datenquelle.
5. **Pässe als vollwertige Objekte**: Höhe, Öffnungsstatus, Steigung, Fotos, Bewertung, in der Suche auffindbar und als Liste entlang der Route.
6. **Tankstellen entlang der Route**: Liste mit Abstand ab Start und Umweg, Spritsorte Super Plus 98/102 als Filter und Reichweitenwarnung nach Tankgröße des Fahrzeugs.
7. **Höhenprofil im Planer**: mit Hover Synchronisierung zur Karte, statt nur auf der Detailseite.
8. **Tourbibliothek mit Suche, Ordnern und Tags**: z. B. Ordner pro Event (RCO 26), Dubletten Erkennung und Datum auf der Karte.
9. **Entwurf im Konto speichern**: kein Verlust Dialog beim Wechsel zur Bibliothek, der Entwurf bleibt parallel offen.
10. **Gruppenfahrt im Web vollwertig**: Teilnehmer einladen, Rollen (Lead, Sweeper), Treffpunkte, nicht nur QR Hinweis. Funk bleibt App Kern.

### Später
1. **Tourdetailseite mit drei Bewertungsdimensionen**: zusätzlich "Fahrspaß im Sportwagen" und "Parkplatz für Gruppen" als eigene Bewertung.
2. **Entdecken mit Filter nach Länge und Tags**: plus Tags wie Pässe, Panorama, Rennstrecke in der Nähe, Gruppengeeignet.
3. **Fotos entlang der Route mit Lightbox**: kuratiert durch Clubs statt Rohaufzeichnungen.
4. **Garage mit Wirkung**: Fahrzeug beeinflusst Routing (Bodenfreiheit, Breite, Tankgröße, Verbrauch).
5. **Statistiken im Profil**: km, Kurven, Pässe gesammelt, Länder, als Motivation und Club Ranking.
6. **Aufzeichnung trimmen**: Standzeiten und GPS Ausreißer automatisch entfernen, damit keine 232 Stunden Touren entstehen.
7. **Mehrere POI Kategorien gleichzeitig**: kombinierbare Chips statt Einzelauswahl.
8. **Preismodell**: Planung im Web gratis, Navigation, Offline, Gruppenfunk und Export als Premium. Saisonpass als Option, weil Sportwagenfahrer saisonal fahren.
