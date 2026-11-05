# Quellen für schöne und kurvige Straßen (Cumo Drive Routing)

Stand: 5. November 2026. Ziel: maschinenlesbare Quellen, mit denen der eigene GraphHopper Server (11.0, Profil `sportwagen`, Regionen DACH, Norditalien, Ostfrankreich, Slowenien) schöne und kurvige Straßen bevorzugt.

## Kurzfassung

1. **Beste Quelle: Curvature selbst aus unserem eigenen OSM Extrakt berechnen** (Algorithmus von Adam Franco, roadcurvature.com). Die Daten sind ODbL wie unsere Karte ohnehin, decken alle Länder gleich gut ab und liefern pro Straßenabschnitt die **OSM Way IDs**. Die fertigen KML Dateien von roadcurvature.com sind brauchbar zum Testen, aber vom **18.11.2024** und damit veraltet.
2. **Dazu als kuratierte Highlights aus OSM:** Relationen `route=road` mit `scenic=yes` (rund 60 Stück in DE AT CH IT, fast alle echte Hochalpen- und Panoramastraßen) und Passhöhen `mountain_pass=yes` auf asphaltierten Autostraßen (AT 259, CH 177 im Extrakt).
3. **Kommerzielle Apps (Kurviger, calimoto, Scenic, REVER, MyRoute-app), dangerousroads.org, quäldich.de, alpenrouten.de, rally-maps.com und Strava** sind für einen Datenimport rechtlich nicht nutzbar. Sie taugen höchstens als Inspiration für eine Handrecherche mit eigener Linienführung aus OSM.
4. **Einbindung:** Way IDs mit Stufe (highlight, prefer) vor dem Import als Tag in das PBF schreiben und in GraphHopper als Encoded Value auswerten. Schnell ohne Java über ein vorhandenes Encoded Value (Variante B, etwa 1,5 Tage), sauber mit eigenem Encoded Value im eigenen Build (Variante A, etwa 3 bis 4 Tage). Empfehlung: mit B starten, A wenn es sich bewährt.

## Bewertung im Überblick

| Quelle | Abdeckung DE AT CH IT FR | Lizenz, kommerziell | Format | Aufwand | Urteil |
|---|---|---|---|---|---|
| Curvature selbst berechnen (OSM) | alle gleich gut | ODbL, ja (Namensnennung) | Way IDs plus Wert je Abschnitt | 2 bis 3 Tage plus Einbindung | **Hauptquelle** |
| roadcurvature.com KML | alle (weltweit) | ODbL laut KML Kopf, ja | KMZ mit Way IDs in der Beschreibung | 0,5 Tage zum Parsen | zum Testen, Stand 11/2024 |
| OSM `route=road` + `scenic=yes` | DE 18, AT 19, CH 6, IT 13, FR siehe unten | ODbL, ja | Relation mit Way Mitgliedern | 0,5 Tage | **Highlights**, klein aber sauber |
| OSM `route=road` + `tourism=yes` (Ferienstraßen) | fast nur DE (67) | ODbL, ja | Relationen | 0,5 Tage | nur Auswahl, viele thematisch statt fahrerisch |
| OSM `mountain_pass=yes` auf Autostraßen | AT 259, CH 177 (Extrakt), Gesamtzahl siehe unten | ODbL, ja | Knoten mit `ele`, oft `wikidata` | 0,5 Tage | **gut**, für Ansagen und als Anker |
| OSM `scenic=yes` an Wegen | sehr dünn (AT 40, CH 13 Ways) | ODbL | Way Tag | gering | kaum Nutzen |
| OSM `tourism=viewpoint` | dicht (DE 31.825, IT 15.635, FR 18.922) | ODbL | Punkte | gering | als POI, nicht für Routing |
| OSM `motorroad=yes` | dicht | ODbL | Way Tag | keiner | **Gegenteil**: Kraftfahrstraße, eher abwerten |
| OSM `motorcycle=*`, `mtb:*` | kein Bezug zu schönen Straßen | ODbL | Way Tags | keiner | ungeeignet als Quelle |
| Wikidata Klasse „landschaftlich schöne Strecke“ (Q1406331) | DE 214, FR 38, IT 17, AT 11, CH 8 | CC0, ja | Items, teils mit OSM Relation (P402) | 0,5 Tage | Ergänzung, Brücke zu OSM nur bei rund der Hälfte |
| Wikidata Gebirgspässe (Q133056) | CH 2066, IT 618 (unvollständig), FR 1272, AT 635, DE 141 | CC0 | Items mit Höhe | 0,5 Tage | nicht nach Straße filterbar, OSM ist besser |
| Kurviger | Europa | AGB: kein Kopieren, keine kommerzielle Verwertung | GPX eigener Routen | – | nein |
| calimoto (inkl. Highlights) | Europa | AGB: Nutzung nur zu eigenen Zwecken, keine Skripte oder Crawler | GPX eigener Touren | – | nein |
| MyRoute-app | Europa | AGB Art. 23: Daten bleiben bei MyRoute-app, nur persönliche Nutzung | GPX | – | nein |
| Scenic, REVER | Europa, US | proprietär, keine offenen Daten gefunden | App intern | – | nein |
| dangerousroads.org | weltweit, über 12.000 Straßen | AGB verbieten ausdrücklich den Aufbau einer Datenbank | HTML | – | nein |
| alpenrouten.de | Alpen, 1.639 Wegpunkte, 154 Tracks | © Andreas Hecht, keine Lizenz | GPX zum Download | – | nur mit Erlaubnis |
| quäldich.de Pässelexikon | Alpen, Mittelgebirge, Rad | redaktionell, keine offene Lizenz; Seite blockt Bots (403) | HTML, GPX für Mitglieder | – | nur mit Erlaubnis |
| rally-maps.com | WP-Stufen bis Clubrallyes, sehr gut | keine offene Lizenz, Seite blockt Bots (HTTP 468) | Karten im Browser | – | nein, Handrecherche |
| Strava Heatmap, Segmente | weltweit, sehr dicht | API Vertrag: Daten nur dem jeweiligen Nutzer zeigen | API | – | nein |

## OpenStreetMap im Detail

Getestet: Die Overpass API (overpass-api.de, kumi.systems, private.coffee, mail.ru) war von hier aus nicht erreichbar (Verbindungsabbruch oder Timeout, overpass-api.de sperrt automatische Abrufe per robots.txt). Gezählt habe ich deshalb über taginfo (Geofabrik Länderinstanzen, Stand 4.11.2026) und mit `osmium` direkt auf den Länderextrakten von openstreetmap.fr (Stand 5.11.2026). Die Extrakte enthalten einen Randstreifen der Nachbarländer, daher tauchen manche Relationen in zwei Ländern auf.

### route=road Relationen

| | DE | AT | CH | IT | FR |
|---|---|---|---|---|---|
| route=road gesamt (taginfo) | 15.868 | 2.433 | 541 | 8.405 | 7.561 |
| davon mit `name`, ohne `ref` (osmium) | 719 | 176 | 41 | 636 | FR_NAMED |
| davon `scenic=yes` | 18 | 19 | 6 | 13 | FR_SCENIC |
| davon `tourism=*` | 67 | 5 | 0 | 1 | FR_TOURISM |

- Fast alle `route=road` Relationen sind normale nummerierte Straßen (B, L, SS, D). Die Namen ohne `ref` sind überwiegend Stadtstraßen, Umfahrungen und Planungen, also kein Signal.
- **`route=road` + `scenic=yes` ist das sauberste Signal.** Es sind fast ausschließlich bekannte Alpen- und Panoramastraßen, etwa Großglockner Hochalpenstraße, Silvretta Hochalpenstraße, Nockalmstraße, Timmelsjoch, Kaunertaler Gletscherstraße, Gerlos Alpenstraße, Villacher Alpenstraße, Furka, Grimsel, Susten, Tremola, Grosser St. Bernhard, Stilfser Joch, Strada della Forra, Amalfitana, Maira-Stura-Kammstraße, Route des Grandes Alpes, Schwarzwaldhochstraße, Deutsche Alpenstraße. Viele davon wurden 2023 und 2024 systematisch angelegt (Relation IDs ab 15.5 Mio.). Die Menge ist klein, die Linienführung aber exakt.
- **`tourism=yes` an route=road** markiert in Deutschland die Ferienstraßen (Deutsche Weinstraße, Romantische Straße, Burgenstraße, Deutsche Alleenstraße …). Fahrerisch gemischt: Spargelstraße oder Straße der Megalithkultur bringen für Sportwagen nichts. Nur handverlesen nutzen.
- Abfrage zum Nachstellen (Overpass, sobald erreichbar):

```
[out:json][timeout:120];
area["ISO3166-1"="AT"][admin_level=2]->.a;
rel(area.a)[type=route][route=road][scenic=yes];
out tags;
```

Mit osmium auf dem Server (ohne Overpass, so habe ich gezählt):

```
osmium tags-filter -R -o rr.opl region.osm.pbf r/route=road
osmium getid -r -o sel.osm.pbf region.osm.pbf r4205967 r9344306 ...
```

### Andere Tags

- `scenic=yes` an Wegen: AT 40 (davon 32 Abschnitte der B3 Wachau), CH 13, DE 997, IT 241, FR 48. Zu dünn und ungleichmäßig.
- `motorcycle:scenic`: kommt in keinem der fünf Länder vor.
- `tourism=viewpoint`: DE 31.825, AT 5.546, CH 4.596, IT 15.635, FR 18.922. Gut für Stopps (machen die POI Kacheln schon), nicht als Streckensignal.
- `motorroad=yes` ist die Kraftfahrstraße (DE 45.261 Ways). Das ist ein Signal für schnelle, eher langweilige Straßen und passt allenfalls zur Abwertung.
- `motorcycle=designated`, `mtb:scale`, `mtb` Routen: kein Bezug zu schönen Autostraßen. `mtb:scale` ist aber als Hilfsträger für die Einbindung interessant (siehe Variante B).
- `mountain_pass=yes`: DE 565, AT 1.426, CH 871, IT 4.565, FR 4.165 Knoten insgesamt. Davon liegen auf asphaltierten Autostraßen (highway primary bis unclassified, kein Schotter): **AT 259, CH 177** im Extrakt, 166 bzw. 90 davon mit `wikidata`. Damit lassen sich Passstraßen eindeutig verankern und mit Höhe ansagen („Hochtor, 2504 m“).

### Wikidata

SPARQL über query.wikidata.org funktioniert. Ergebnisse (Items mit Land P17):

- Klasse „landschaftlich schöne Strecke“ (Q1406331): DE 214 (101 mit OSM Relation P402), FR 38 (5), IT 17 (1), AT 11 (3), CH 8 (1).
- Gebirgspass (Q133056): CH 2066, FR 1272, AT 635, IT 618, DE 141. Fast keiner hat eine OSM Relation, und Wikidata trennt Fußpässe nicht von Straßenpässen. Für Passstraßen ist der Weg über OSM Knoten auf Autostraßen besser; das `wikidata` Tag am Knoten bringt dann Namen in mehreren Sprachen und Wikipedia Links.
- Großglockner Hochalpenstraße ist z. B. Q694270 mit den Klassen „landschaftlich schöne Strecke“, „Gebirgsstraße“ (Q1497067) und „Mautstraße“ (Q16939396). Das Mautstraßen Merkmal ist für `caveats` nützlich.

## roadcurvature.com und das Curvature Projekt

- Software: github.com/adamfranco/curvature, **GPL 3.0 oder später**. Die GPL betrifft nur die Software, nicht die erzeugten Daten.
- Daten: Der KML Kopf sagt ausdrücklich: „Curvature data is a derivative of Open Street Map … provided under the terms of the Open Data Commons Open Database License (ODbL).“ Kommerziell nutzbar wie OSM selbst, mit Namensnennung.
- Downloads: kml.roadcurvature.com, pro Land `c_300`, `c_1000` und `c_1000.curves` als KMZ. Italien, Frankreich und Deutschland zusätzlich nach Regionen. **Letzte Erzeugung 18.11.2024**, also seit fast zwei Jahren nicht aktualisiert.
- Inhalt: Jeder Placemark ist ein zusammenhängender Straßenabschnitt mit Name und ref, Curvature Wert, Länge, Straßentyp, Belag und einer Tabelle **aller OSM Way IDs**. Österreich c_1000: 10.250 Abschnitte, 84.168 Ways, 36.178 km. Schweiz c_1000: 4.851 Abschnitte, 36.730 Ways, 14.926 km.
- Berechnung: Für je drei aufeinanderfolgende Punkte wird der Kreisradius bestimmt. Abschnitte mit Radius unter 175 m zählen mit Gewicht 1, unter 100 m 1,3, unter 60 m 1,6, unter 30 m 2; flacher zählt 0. Die gewichteten Längen werden je Straße (gleicher Name oder ref) aufsummiert; nach mehr als etwa 3 km ohne Kurve wird geteilt. Der Wert entspricht grob den Metern in Kurven.
- Plausibilität AT (Top 10 nach Wert): Salleggerstraße L645, Kernhofer Straße B21, Faschinastraße L193, Gailtal Bundesstraße B111, Packer Straße B70, Mariazeller Straße B20, Nockalmstraße, Gaberlstraße B77, Zwettler Straße B124, Pustertaler Höhenstraße L324. Das deckt sich gut mit der Szene. Fehlgriffe gibt es auch: Nenzinger Himmel (Zufahrt beschränkt), Kaunertaler Gletscherstraße (Maut, Sackgasse), einzelne Wohnstraßen. Filter auf `highway` und `access` sind nötig.
- Mengen nach Schwelle (AT / CH):

| Schwelle | AT Abschnitte, km | CH Abschnitte, km |
|---|---|---|
| ≥ 1.000 | 10.250, 36.178 km | 4.851, 14.926 km |
| ≥ 3.000 | 1.374, 13.084 km | 699, 5.341 km |
| ≥ 5.000 | 425, 6.436 km | 236, 2.789 km |
| ≥ 10.000 | 74, 1.992 km | 35, 910 km |

Vorschlag: `prefer` ab 3.000, `highlight` ab 10.000 oder bei `scenic=yes` Relation oder Passhöhe mit Höhe über 1.500 m.

## Kommerzielle Apps und Webseiten

- **Kurviger** (basiert selbst auf GraphHopper und OSM): Die AGB untersagen Kopieren, Herunterladen und abgeleitete Werke; Weiterverwertung nur mit schriftlicher Erlaubnis. Es gibt eine API nur für die eigenen Daten des Nutzers. Kein offener Kurvendatensatz.
- **calimoto** (auch Highlights): AGB Ziff. 08.1 und 08.4 erlauben die Nutzung nur für die eigenen vertragsgemäßen Zwecke, untersagen Skripte, Robots und Crawler und Übertragung nur über die vorgesehenen Exportfunktionen. GPX Export eigener Touren geht, Highlights als Datensatz nicht.
- **MyRoute-app**: AGB Art. 23 behält alle Rechte inklusive Datenbankrecht. Die Dienste sind „solely intended for the personal use of individual users and may not be used for commercial purposes“.
- **Scenic** und **REVER**: proprietäre Apps, keine öffentlichen Daten oder Exporte über eigene Routen hinaus. Die Scenic AGB Seite war nicht abrufbar.
- **dangerousroads.org**: Die Terms erlauben nur private Kopien und verbieten ausdrücklich, Material „in a systematic or regular manner … so as to create a database“ herunterzuladen. Nicht nutzbar.
- **alpenrouten.de**: 1.639 Wegpunkte und 154 Tracks als GPX, Copyright Andreas Hecht, keine Lizenz. Nur mit Erlaubnis. Eine Anfrage könnte sich lohnen, weil die Sperrinfos für 301 Ziele (Wintersperren) gepflegt werden.
- **quäldich.de**: großes Pässelexikon, redaktionelle Inhalte ohne offene Lizenz; die Seite lieferte hier 403. Nur mit Erlaubnis.
- **rally-maps.com**: Die Seite antwortete hier nur mit HTTP 468 (Bot Sperre). Es gibt keine offene Lizenz und keinen dokumentierten KML Export; die Prüfungen sind sorgfältig von Hand gezeichnet. Für uns nur als Anregung bei der Handrecherche: Strecke auf rally-maps ansehen, Start, Ziel und Zwischenorte notieren, Linie aus OSM erzeugen. Das ist das bestehende Schema in `data/roads/README.md`.
- **Strava**: Der API Vertrag erlaubt Daten eines Nutzers nur diesem Nutzer anzuzeigen, auch öffentliche Daten anderer nicht. Die Heatmap ist nicht für Dritte lizenziert. Strava Metro gibt es nur für Verwaltungen und Planer. Für eine kommerzielle App keine Option.

## Vorschlag Einbindung in GraphHopper

Ausgangslage: GraphHopper 11.0, Profil `sportwagen` mit Landmarken, wöchentlicher Neuaufbau über `setup-server.sh` (osmium merge, dann Import). Das vorhandene Encoded Value `curvature` ist das Verhältnis Luftlinie zu Kantenlänge pro Kante. Es ist bei kurzen Kanten verrauscht und kennt keine zusammenhängende Straße. Die Curvature Methode bewertet dagegen den ganzen Straßenzug und ist darum das bessere Signal für „lohnende Straße“.

### Schritt 1: Liste erzeugen (2 bis 3 Tage)

Python Skript mit pyosmium (`pip install osmium`), läuft im wöchentlichen Update nach `osmium merge` auf `region.new.osm.pbf`:

1. Ways mit `highway` in primary, secondary, tertiary, unclassified (trunk nur ohne `motorroad`), asphaltiert oder ohne `surface`, `access` nicht privat.
2. Ways nach Name oder ref zu Straßenzügen verketten, Radien aus je drei Punkten, Gewichte 175/100/60/30 m wie im Curvature Projekt, Summe je Straßenzug, Teilung nach etwa 3 km ohne Kurve.
3. Stufen vergeben: `prefer` ab 3.000; `highlight` ab 10.000 oder Mitglied einer `route=road` Relation mit `scenic=yes` oder Teil einer Passstraße mit `mountain_pass` Knoten über 1.500 m. Dazu eine kleine Handliste aus `data/roads/*.json` (deren Linien ohnehin aus OSM gezogen werden) und eine Sperrliste für Fehlgriffe.
4. Ausgabe: `scenic_ways.csv` mit `way_id, tier, score, name`, plus GeoJSON zum Ansehen.

Alternative für den Start: die fertigen roadcurvature KMZ parsen (Way IDs stehen drin, Parser liegt als Skizze vor, 0,5 Tage). Wegen Stand 11/2024 passen dann aber IDs von inzwischen geteilten oder neu gezeichneten Ways nicht mehr, deshalb nur zum Testen.

Rechenzeit: Ein Lauf über das zusammengeführte PBF dauert schätzungsweise 15 bis 30 Minuten und passt in das Sonntagsfenster.

### Schritt 2: Tag ins PBF schreiben (0,5 Tage)

Zweites pyosmium Skript: liest `region.new.osm.pbf`, schreibt für jede Way ID der Liste einen Tag und gibt ein neues PBF aus. Danach normaler Import.

### Schritt 3a: Variante B, ohne Java (1 Tag, Empfehlung für den Start)

Ein vorhandenes Encoded Value nutzen, das das Auto Profil sonst nicht braucht: `mtb_rating` (liest `mtb:scale`).

- Im Vorverarbeitungsskript `mtb:scale` an allen Autostraßen entfernen (es betrifft nur Fahrradprofile, die wir nicht haben) und für unsere Liste setzen: `prefer` als `mtb:scale=0`, `highlight` als `mtb:scale=1`.
- `config.yml`: `mtb_rating` an `graph.encoded_values` anhängen.
- Abbildung laut `OSMMtbRatingParser` im Tag 11.0 geprüft: `mtb_rating = mtb:scale + 1`, ohne Tag 0. Also `prefer` ergibt 1, `highlight` ergibt 2. Trotzdem einmal an einem kleinen Testgraph über `/info` und eine Testroute bestätigen.
- `sportwagen.json`, zusätzliche Regel am Ende von `priority`. Statt zu belohnen wird alles andere leicht abgewertet, denn Werte über 1 vertragen sich schlecht mit Landmarken:

```json
{ "if": "mtb_rating >= 2", "multiply_by": "1" },
{ "else_if": "mtb_rating == 1", "multiply_by": "0.85" },
{ "else": "", "multiply_by": "0.7" }
```

Die Faktoren an den Testetappen (RCO East E3) einstellen. Weil die Regel fest im Serverprofil steht, werden die Landmarken beim wöchentlichen Import passend vorbereitet; jede Änderung braucht einen Neuaufbau.

Nachteil: Zweckentfremdung eines Tags, muss dokumentiert werden; bricht, falls wir später ein Fahrradprofil brauchen.

### Schritt 3b: Variante A, eigenes Encoded Value (3 bis 4 Tage, später)

GraphHopper kann laut Entwicklern eigene Tags bis heute nur mit Quellcodeänderung als Encoded Value aufnehmen. Dazu den Tag 11.0 forken, ein `EnumEncodedValue<CumoScenic>` (NONE, PREFER, HIGHLIGHT) mit Parser für den Tag `cumo:scenic` nach dem Vorbild von `RoadClassLink` und `OSMRoadClassLinkParser` anlegen und in `DefaultImportRegistry` registrieren, eigenes Jar bauen, `setup-server.sh` auf dieses Jar umstellen. Dann im Profil `cumo_scenic == HIGHLIGHT` usw. Sauber und lesbar, kostet aber bei jedem GraphHopper Update etwas Pflege.

### Ansagen und Highlights in der App

Unabhängig vom Routing liefern die `highlight` Einträge (Relation, Passknoten mit Name und Höhe) die Ansagen „Jetzt beginnt die Sölkpass Straße, Passhöhe 1790 m“. Dafür reicht eine Tabelle Way ID zu Highlight ID, die mit den POI Kacheln ausgeliefert wird.

### Aufwand gesamt

| Baustein | Tage |
|---|---|
| Curvature Skript plus Stufen, Sperrliste | 2 bis 3 |
| PBF Tagging plus Einbau in `setup-server.sh` | 0,5 |
| Variante B im Profil plus Abstimmung an Testetappen | 1 |
| (später) Variante A eigenes Encoded Value | 3 bis 4 |
| **Start mit B** | **etwa 4 bis 4,5** |

Lizenz: alles ODbL wie die Karte selbst. Pflicht ist die Namensnennung „© OpenStreetMap contributors“ (ist für die Karte ohnehin nötig). Werden die abgeleiteten Daten öffentlich als Datenbank weitergegeben, gilt Share Alike; für reine Routing Ergebnisse in der App nicht.

## Beispiel Einträge

`data/roads/quellen-beispiele.json` enthält 13 Einträge im Schema der Strecken Datenbank:

- 9 aus OSM Relationen `route=road` mit `scenic=yes` (Großglockner, Nockalmstraße, Silvretta, Gerlos, Furka, Grimsel, Susten, Tremola, Grosser St. Bernhard). Start, Ziel, Länge und Zwischenorte sind aus der Relationsgeometrie berechnet, die Ortsnamen sind der nächste OSM `place` Knoten, die Passhöhen kommen aus den `mountain_pass` Knoten.
- 4 aus der roadcurvature Liste Österreich (Faschinastraße, Sölkpass, Furkajoch, Packer Straße), Anker aus der KML Geometrie und OSM Orten.

Hinweise: Die Werte `quality` und die Texte in `caveats` (Maut, Wintersperre) sind meine Einschätzung und vor dem Ankündigen zu prüfen. Großer St. Bernhard und Tremola stammen aus dem Schweizer Extrakt; die Relation des Großen St. Bernhard endet dort am Grenzbereich auf der italienischen Seite (Fontintes). Timmelsjoch und Stilfser Joch habe ich weggelassen, weil ihre Relationen im jeweiligen Länderextrakt nur teilweise enthalten waren. Die Curvature Abschnitte folgen den Grenzen der Berechnung, nicht der üblichen Streckenbeschreibung (Faschinastraße beginnt z. B. bei Nüziders).

## Quellen

- https://roadcurvature.com/ und https://kml.roadcurvature.com/europe/austria.html
- https://github.com/adamfranco/curvature (Gewichte in `curvature/post_processors/add_segment_curvature.py`)
- https://taginfo.geofabrik.de/ (Länderzahlen), https://download.openstreetmap.fr/extracts/europe/ (Extrakte)
- https://query.wikidata.org/ (SPARQL)
- https://kurviger.com/en/terms, https://wiki.openstreetmap.org/wiki/Kurviger
- https://calimoto.com/de/agb
- https://s3.eu-west-1.amazonaws.com/storage.myrouteapp.com/legal/terms/20210629-en.pdf
- https://www.dangerousroads.org/terms-and-conditions-of-use.html
- https://www.alpenrouten.de/
- https://www.strava.com/legal/api
- https://github.com/graphhopper/graphhopper/blob/master/docs/core/custom-models.md
- https://discuss.graphhopper.com/t/how-to-add-custom-osm-tags-as-encoded-values-without-modifying-the-graphhopper-source/9256
