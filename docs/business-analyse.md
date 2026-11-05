# CUMO DRIVE: Business Analyse

Stand: 5. November 2026. Erstellt mit Web Recherche und nachgerechnet mit Python (Skripte im Anhang beschrieben).

**Lesehilfe:** Aussagen mit **[F]** sind Fakten mit Quellenangabe (Nummer verweist auf das Quellenverzeichnis am Ende). Aussagen mit **[A]** sind Annahmen von uns. Alle Rechenergebnisse stammen aus dem Modell, nicht aus Schätzung im Kopf.

## Kurzfassung

* **Markt:** In DACH gibt es nach unserem Modell rund 1,4 bis 2,6 Mio. Fahrzeuge, die für Genuss und Kurvenfahrten genutzt werden (Mittelwert 1,9 Mio.), also rund 1,1 bis 2,1 Mio. Personen. Davon sind etwa 0,22 bis 0,40 Mio. iPhone Nutzer, die aktiv Touren planen (SAM). Das entspricht einem Abo Potenzial von 13 bis 24 Mio. € pro Jahr zu Listenpreis.
* **Wettbewerb:** Der Markt ist nicht leer. Porsche bietet ROADS kostenlos und markenoffen an, Kurviger kann auch Auto und kostet 29,99 € im Jahr, und seit 2025 erscheinen mehrere kleine Auto Apps mit Konvoi und Sprachfunk (DriveGo für 29,99 $ im Jahr, Strada1, RoadStr). Keiner verbindet aber Sportwagen taugliches Routing (Breite, Belag, Sperrungen, Pässe, Rallye Historie) mit Gruppe, Funk, Web Planer und einem Club Modell für Veranstalter.
* **Umsatz Jahr 3 (netto nach USt, Apple und Erstattungen):** vorsichtig rund 72 Tsd. €, realistisch rund 385 Tsd. €, ambitioniert rund 1,45 Mio. €.
* **Größte Hebel:** Download zu Trial Rate und Trial zu Paid Rate (je ±29 % Umsatz), nicht der Preis. Das Gruppenmodell "jeder braucht ein eigenes Abo" ist Wachstumsmotor und Bremse zugleich.
* **Preis:** Jahresabo 59,99 € ist marktüblich (calimoto, Scenic). Saisonpass und Club Modell sollten angepasst werden (Details in Abschnitt 4).

## 1. Marktgröße (TAM, SAM, SOM)

### 1.1 Fahrzeugbestand: Fakten

| Kennzahl | Wert | Stichtag | Quelle |
| --- | --- | --- | --- |
| Pkw Bestand Deutschland | 49.486.487 | 1.1.2026 | [F] KBA via motor.com.de, mobiflip [1][2] |
| Pkw Bestand Österreich | 5.286.101 | 31.12.2025 | [F] Statistik Austria [3] |
| Pkw Bestand Schweiz | ca. 4.829.500 | Sept. 2025 (provisorisch) | [F] BFS via blue News [4] |
| Porsche Bestand DE | 410.445 | 1.1.2026 | [F] KBA via mobiflip [2] |
| Porsche Bestand DE (Vorjahr) | 402.411 | 1.1.2025 | [F] KBA via best selling cars [5] |
| Ferrari / Lamborghini / Maserati DE | 15.078 / 4.622 / 10.450 | 1.1.2025 | [F] [5] |
| Aston Martin / Bentley / Lotus / Alpine DE | 3.838 / 6.135 / 5.062 / 2.423 | 1.1.2025 | [F] [5] |
| Mercedes / BMW / Audi / VW DE | 4.721.019 / 3.453.884 / 3.308.722 / 10.288.048 | 1.1.2025 | [F] [5] |
| Cabriolets DE | ca. 2,2 Mio. | 2025 | [F] KBA via PC Welt [6] |
| Cabrio Neuzulassungen DE | 33.924 (2024: 40.984) | 2025 | [F] [6] |
| Oldtimer Pkw DE (mit und ohne H Kennzeichen) | 822.537 | 1.1.2026 | [F] KBA via mobiflip [2] |
| Oldtimer gesamt DE (Kfz und Anhänger) | 923.538 (+4,0 %) | 1.1.2026 | [F] [2][7] |
| Anteil Oldtimer Halter mit H Kennzeichen | ca. 54 %, fallend | 2026 | [F] ADAC via autohaus [7] |
| Porsche Bestand Steiermark | 5.360 | Ende 2025 | [F] Landesstatistik Steiermark [8] |

**Was die Statistik nicht hergibt:** Für AMG, M, RS, GTI und vergleichbare Performance Varianten veröffentlicht das KBA keine Bestandszahlen nach Ausstattungslinie. Österreich und die Schweiz veröffentlichen Markenbestände nur kostenpflichtig (Statistik Austria Tabellenband T4 für 111 € [3]). Diese Lücken füllen wir mit klar markierten Annahmen.

### 1.2 Enthusiasten Fahrzeugpool DACH (Modell)

Rechenweg: Porsche + Exoten + Performance Varianten + genussorientierte Cabrios + aktiv bewegte Oldtimer, abzüglich Doppelzählung (zum Beispiel Porsche Cabrio oder Oldtimer Porsche). AT mit gleicher Dichte wie DE, CH mit 1,5facher Dichte, weil die Schweiz eine überdurchschnittliche Sportwagendichte hat (Indiz: 34 von 599 Ferrari Daytona SP3 gingen 2025 in die Schweiz [9]).

| Annahme [A] | niedrig | mittel | hoch |
| --- | --- | --- | --- |
| Performance Anteil am Bestand von Mercedes, BMW, Audi, VW | 1,5 % | 2,0 % | 3,0 % |
| Anteil Cabrios, die genussorientiert bewegt werden | 25 % | 35 % | 45 % |
| Anteil Oldtimer, die regelmäßig Touren fahren | 20 % | 30 % | 40 % |
| Abzug Doppelzählung | 25 % | 20 % | 15 % |
| Dichtefaktor Schweiz gegenüber DE | 1,5 | 1,5 | 1,5 |

| Ergebnis (gerechnet) | niedrig | mittel | hoch |
| --- | --- | --- | --- |
| Performance Varianten DE | 326.575 | 435.433 | 653.150 |
| Genuss Cabrios DE | 550.000 | 770.000 | 990.000 |
| Touren Oldtimer DE | 164.507 | 246.761 | 329.015 |
| Pool DE nach Abzug | 1.124.352 | 1.528.198 | 2.065.685 |
| Pool AT | 120.102 | 163.241 | 220.655 |
| Pool CH | 164.592 | 223.711 | 302.392 |
| **Pool DACH Fahrzeuge** | **1.409.046** | **1.915.149** | **2.588.732** |

### 1.3 TAM, SAM, SOM

| Stufe | Definition | niedrig | mittel | hoch |
| --- | --- | --- | --- | --- |
| **TAM** | Personen im Pool, bei 1,25 Enthusiasten Fahrzeugen je Person [A] | 1,13 Mio. | 1,53 Mio. | 2,07 Mio. |
| TAM in € | Personen × 59,99 € Jahresabo | 67,6 Mio. € | 91,9 Mio. € | 124,2 Mio. € |
| **SAM** | davon iPhone Nutzer (55 % [A], wohlhabende Zielgruppe 40 bis 65) und aktive Tourenplaner oder Gruppenfahrer (35 % [A]) | 216.993 | 294.933 | 398.665 |
| SAM in € | × 59,99 € | 13,0 Mio. € | 17,7 Mio. € | 23,9 Mio. € |
| **SOM Jahr 3** | zahlende Fahrzeuge laut Umsatzmodell (Abschnitt 3), bezogen auf SAM mittel | 1.665 (0,6 %) | 8.556 (2,9 %) | 33.753 (11,4 %) |

Hinweis: Frankreich und Italien sind nicht im SAM enthalten. Sie sind die Expansionsreserve ab Jahr 2 oder 3.

### 1.4 Szene: Clubs, Tourenanbieter, Track Days

| Segment | Fakt | Quelle |
| --- | --- | --- |
| Porsche Club Deutschland | ca. 8.000 Mitglieder in 97 regionalen Porsche Clubs | [F] PCD Imagebroschüre [10] |
| Porsche Clubs weltweit | über 700 Clubs, über 240.000 Mitglieder, 86 Länder | [F] Porsche Newsroom 2022 [11] |
| Porsche Club Dachverbände | eigene Verbände für Deutschland, Österreich, Frankreich, Italien | [F] stuttcars [12] |
| Porsche Zentren mit eigenen Touren | zum Beispiel "12 Pässe Tour" des Porsche Zentrums Münster, "Wiesn Ausfahrt" Porsche Zentrum Mannheim | [F] [13][14] |
| Event und Tourenkalender | elferspot listet Tours und Events (zum Beispiel KALMAR Beyond Adventure Alpen 2026) | [F] [15] |
| Hotels als Gastgeber | Hotel Jagdhof (Tirol) mit eigenem Porschetreffen Programm April 2026 | [F] [16] |
| Kommerzielle Tourenanbieter | zum Beispiel Alpcars (Großglockner im Porsche), biggarage 5 Day Sportscars Tour, Luxury Escapes 8 Tage Alpine Supercar Tour | [F] [17][18][19] |
| Sportwagen Vermietung | mietedeinsportauto: 17 deutsche Städte, über 300 Fahrzeuge, "über 6 Mio. Nutzer" pro Jahr, Tagesmiete ab 199 € (Audi RS3) | [F] [20] |
| Track Days | Nürburgring Nordschleife Touristenfahrten für jeden mit Führerschein gegen Gebühr; Motorräder seit 2025 ausgeschlossen, also reine Auto Szene | [F] [21][22] |
| Ferrari, AMG, BMW M Clubs | Mitgliederzahlen nicht öffentlich auffindbar; AMG bindet Kunden über die AMG Private Lounge | [F] [23] |

**Einordnung [A]:** Die organisierte Szene (Clubs, Zentren, Veranstalter) ist klein in Köpfen, aber groß im Multiplikator. Ein Fahrtenleiter eines Regionalclubs plant 5 bis 15 Ausfahrten im Jahr mit 8 bis 25 Fahrzeugen. Genau hier passt das Club Modell.

### 1.5 Vergleich Motorradmarkt (bewiesenes Modell)

| Kennzahl | Wert | Quelle |
| --- | --- | --- |
| Krafträder Bestand DE | 5.071.468 | [F] KBA 1.1.2026 [1] |
| calimoto Nutzer | "über 3 Mio." (Webseite, App Store) bzw. "über 4 Mio. in 154 Ländern" (dealroom) | [F] [24][25][26] |
| calimoto Bewertungen | 4,6 von 5 bei 56K+ Bewertungen | [F] [24] |
| calimoto Umsatz | ca. 4,6 Mio. $ pro Jahr (Schätzung von dealroom, keine Bilanzzahl) | [F] [25] |
| calimoto Eigentümer | Mehrheit seit 2022 bei Russmedia Equity Partners | [F] [25] |
| Kurviger iOS DE | 4,6 Sterne bei 9.935 Bewertungen | [F] App Store [27] |

**Rechnung:** 4,6 Mio. $ × 0,92 / (59,99 € / 1,19 × 0,85) ergibt rund 99.000 zahlende calimoto Nutzer, also rund 2,5 bis 3,3 % der kommunizierten Nutzerbasis. Wendet man eine ähnliche Durchdringung von rund 2 % auf den Enthusiasten Pool DACH an (1,9 Mio. Fahrzeuge), ergibt sich eine Größenordnung von rund 38.000 Zahlenden als langfristige Obergrenze. Das ambitionierte Szenario (33.753 zahlende Fahrzeuge in Jahr 3) liegt schon nahe an dieser Grenze. **Folgerung:** Der Automarkt für diese Art App ist in DACH rund ein Drittel so groß wie der Motorradmarkt (5,07 Mio. Motorräder gegenüber 1,5 Mio. Enthusiasten Pkw in DE), und Autofahrer brauchen Kurven Navigation weniger zwingend als Motorradfahrer, weil das Auto Navi Alternativen bietet.

## 2. Wettbewerb

### 2.1 Wettbewerber im Überblick

| App | Fokus | Preis | Nutzer, Bewertungen | Quelle |
| --- | --- | --- | --- | --- |
| **ROADS by Porsche** | Auto, markenoffen ("It doesn't matter what brand or model you drive") | **kostenlos** | über 180.000 Nutzer (Stand 2023), Start 2019 | [F] [28][29] |
| calimoto | Motorrad | Woche 9,99 €, Jahr 59,99 €, Saisonpass 3 Monate 39,99 €, Familie Jahr (UK 83 £), 14 Tage Test | 3 bis 4 Mio. Nutzer, 4,6 bei 56K | [F] [24][26][30], eigene Sichtung 4.11.2026 |
| Kurviger | Motorrad und Auto | Tourer 14,99 €/Jahr (3,49 €/Monat), Tourer+ 29,99 €/Jahr (6,99 €/Monat) | 4,6 bei 9.935 (iOS DE) | [F] [27][31] |
| DriveGo | Auto, "Curvy Roads, CarPlay & Convoy" | Pro Jahr 29,99 $ (Rabatt 22,99 $), Monat 2,99 $ | 4,8 bei 5 Bewertungen (US), 2026 gestartet | [F] [32] |
| RoadStr | Auto, Routen und Events, Spanien | kostenlos | 4,4 bei 114 (US) | [F] [33][34] |
| Strada1 | Auto, Konvoi, Treffen | k. A. | 4,8 bei 31, 1k+ Downloads, Start 23.1.2026 | [F] [35] |
| Drively Routes | Auto, Community Straßen | Drively Club (Preis k. A.) | 4,4 bei 19, 5k+ Downloads, Start 9/2025 | [F] [36] |
| Rallista | Auto, US, Events | 2,99 $ und 14,99 $, Drive Packs 24,99 $ | 4,0 bei 34, letztes Update 11/2023 | [F] [37] |
| Scenic | Motorrad | Jahr 59,90 $, Quartal 29,90 $, Monat 14,90 $ | k. A. | [F] [38] |
| REVER | Motorrad | Pro Jahr 39,99 $, Monat 7,49 $ | k. A. | [F] [39] |
| Roadtrippers | Roadtrip Planung, US Fokus | Basic 35,99 $, Pro 49,99 $, Premium 59,99 $ pro Jahr | k. A. | [F] [40] |
| MyRoute-app | Profi Planer, Garmin Export | Silver ab 3,95 €/Monat, Gold ab 6,95 €/Monat oder 199 € einmalig, Navigation Next ab 4,95 €/Monat oder 129 € einmalig | k. A. | [F] [41][42] |
| Sygic | Auto Navigation | Premium+ 29,99 € (Aktion 13,99 €) | k. A. | [F] [43] |
| Google Maps, Apple Maps, Waze | Alltag | kostenlos | Massenmarkt | [A] eigene Produktkenntnis: kein kurviges Routing, nur Vermeiden von Autobahn, Maut, Fähren; Standort teilen ja |
| Furkot | Web Roadtrip Planer | k. A. (nicht geprüft) | k. A. | Recherche ohne Ergebnis |
| DriveTribe | Social Plattform von Clarkson, Hammond, May | eingestellt 2022 | | [F] [44] |
| BMW, Mercedes Apps | Fahrzeugsteuerung, Ziel ans Auto senden | im Fahrzeugpreis | | [A] keine Gruppen oder Kurven Tour Funktion gefunden, nicht abschließend geprüft |
| Harry's LapTimer und Track Apps | Rundenzeiten auf der Rennstrecke | | | Randthema, kein direkter Wettbewerb |

### 2.2 Feature Matrix

Legende: ✓ vorhanden, (✓) eingeschränkt, ✗ fehlt, ? nicht belegt. Cumo Drive Spalte = geplanter Umfang.

| Funktion | **CUMO DRIVE** | ROADS by Porsche | calimoto | Kurviger | DriveGo | RoadStr | Strada1 | Google/Apple |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Für Autos gebaut | ✓ Sportwagen | ✓ | ✗ Motorrad | (✓) | ✓ | ✓ | ✓ | ✓ |
| Kurviges Routing | ✓ eigener Server | ✓ curvy, balanced, dynamic [28] | ✓ [26] | ✓ 4 Stufen [31] | ✓ [32] | ? | (✓) Kategorien [35] | ✗ |
| Breite, Belag, Sperrungen für Autos | ✓ Kern USP | ? | ✗ warnt nur bei Sperrung (eigene Sichtung) | (✓) Sperrungen im Tourer | ? | ? | ? | (✓) |
| Pässe, Bergrennen, Rallye Historie | ✓ | (✓) Location Stories [29] | (✓) Pässe als POI | (✓) POI | ✗ | ✗ | (✓) "Mountains & Passes" | ✗ |
| Städte meiden | ✓ | ? | (✓) | ✓ Standard [31] | ? | ? | ? | ✗ |
| Sprachnavigation | ✓ | ✓ [28] | ✓ Premium | ✓ Tourer+ | ✓ | ✓ | ? | ✓ |
| CarPlay | geplant (Antrag) | ✓ | ✓ Premium | ✓ seit 2025 [45] | ✓ | ✓ | ? | ✓ |
| Gruppe mit Live Position | ✓ bis 6 Fahrzeuge | (✓) Gruppen und Chat, Live Position nicht belegt [28][29] | ✓ Premium [26] | ✗ | ✓ Konvoi | ✓ RoadSharing [33] | ✓ | (✓) Standort teilen |
| Funk / Sprachchat | ✓ | ✗ | ✗ (nur Quick Messages [30]) | ✗ | ✓ Voice Chat | ? | ✓ Walkie Talkie | ✗ |
| "Halt" ansagen | ✓ | ✗ | (✓) Quick Messages | ✗ | ? | ? | ? | ✗ |
| Web Planer | ✓ | ✓ roads.porsche.com [29] | ✓ | ✓ | ? | ? | ? | ✓ |
| GPX/KML Import und Export | ✓ | (✓) GPX Export, Google Maps Import [46] | ✓ Import, Export Premium | ✓ | ✓ GPX | ? | ? | ✗ |
| Community Touren | ✓ | ✓ | ✓ 200.000+ Touren | (✓) | ✓ | ✓ 10.000+ Routen | ✓ | ✗ |
| Garage | ✓ | ? | ✓ | ? | ✓ | ? | ✓ | ✗ |
| Club / Veranstalter Lizenz | ✓ Club S, L | ✗ | (✓) Familie | ✗ | ✗ | ✗ | ✗ | ✗ |
| Android | später | ✗ (iOS laut PCA 2024 [47]) | ✓ | ✓ | ? | ✓ | ✓ | ✓ |
| Preis pro Jahr | 59,99 € | 0 € | 59,99 € | 29,99 € | ca. 30 $ | 0 € | ? | 0 € |

### 2.3 Positionierung

**Vorschlag:** *"Die Tourenapp für Sportwagen Gruppen. Von Veranstaltern gebaut, nicht von einem Hersteller."*

* Gegen **ROADS by Porsche**: ROADS ist gratis und gut, aber ein Marketinginstrument eines Herstellers mit Fokus Einzelfahrer und Community. Live Konvoi, Funk und Veranstalter Werkzeuge sind nicht belegt. Ein Ferrari, AMG oder M Fahrer fährt nicht gern unter Porsche Logo, und Porsche selbst plant keine Rallye Highlights anderer Marken. Kritik von Nutzern: Wegpunkte setzen ist umständlich, keine Autobahnabschnitte, nur iPhone [47].
* Gegen **calimoto**: gleiche Mechanik, aber für Motorräder. Autos werden über zu schmale Straßen geschickt (eigene Erfahrung CDC). calimoto hat jedoch Technik, Daten und Marke, um jederzeit ein Auto Profil nachzuziehen.
* Gegen **Kurviger**: kann Auto, ist günstig, aber ohne Gruppe und ohne Funk.
* Gegen **DriveGo, Strada1, RoadStr**: diese decken Konvoi und Sprachchat bereits ab, sind aber klein, generisch und ohne eigenes Sportwagen Routing. Ihr Preisanker (rund 30 $ im Jahr) drückt auf unseren Jahrespreis.

### 2.4 Lücken, die CUMO DRIVE besetzen kann

1. **Routing Qualität für Sportwagen:** Mindestbreite, Belag, gesperrte Straßen standardmäßig meiden, Etappen Check vor dem Speichern. Das ist der einzige Vorteil, den Kopierer nicht in Wochen nachbauen.
2. **Veranstalter Werkzeug:** Planen im Web, Gruppe per Link einladen, Funk, Halt ansagen, Roadbook Export. Kein Wettbewerber verkauft Lizenzen an Clubs und Tourenanbieter.
3. **Kuratierte Highlights:** Pässe, Bergrennstrecken, historische Rallye Prüfungen. Das ist Content mit Heritage (CUMO DRIVERS CLUB) und schwer zu kopieren.

### 2.5 Risiken aus dem Wettbewerb

| Risiko | Wahrscheinlichkeit [A] | Wirkung | Gegenmaßnahme |
| --- | --- | --- | --- |
| ROADS by Porsche bleibt gratis und wird besser (Konvoi, Funk) | mittel | hoch für Porsche Fahrer, die größte Einzelgruppe | markenoffen positionieren, Veranstalter Fokus, Routing Qualität sichtbar machen (Vergleichsvideos) |
| calimoto bringt ein Auto Profil | mittel | hoch | schneller im Club Kanal sein, Sportwagen Routing als Marke besetzen |
| Indie Apps mit 30 $ Preis (DriveGo und Co.) | hoch | mittel (Preisdruck) | Mehrwert über Gruppe, Club, Highlights; Preis nicht unter 49 € senken |
| Google oder Apple bauen "kurvige Route" ein | niedrig bis mittel | mittel | Gruppe, Funk und Veranstalter Funktionen bleiben Nische |

## 3. Umsatzprognose Jahr 1 bis 3

### 3.1 Modellaufbau

Monatliches Modell über 36 Monate, Launch **März 2027** [A], Jahr 1 = 2027 (10 Monate), Jahr 2 = 2028, Jahr 3 = 2029.

* Downloads × Trial Start Rate × Trial zu Paid Rate = neue Zahler.
* Virale Schleife: Jeder neue Zahler bringt im Folgemonat k zusätzliche Downloads, weil Gruppenmitglieder ein eigenes Abo brauchen.
* Neue Zahler verteilen sich auf Woche, Monat, Jahr, Saison.
* Woche: Einmalkauf mit durchschnittlich 1,4 bis 1,8 Wochen. Monat: monatliche Kündigung, in der Saison (April bis Oktober) niedrig, außerhalb hoch. Jahr: Verlängerung nach 12 Monaten mit Rate r. Saisonpass: Wiederkauf ein Jahr später.
* Clubs: Jahreslizenzen über Web (Stripe), keine Apple Gebühr.
* Netto = Brutto × (1 minus Erstattungen) / (1 plus USt) × (1 minus Apple Gebühr).

### 3.2 Benchmarks (Fakten)

| Benchmark | Wert | Quelle |
| --- | --- | --- |
| Download zu Trial, Median aller Apps | 6,2 % (Top 10 %: 20,3 %) | [F] RevenueCat SOSA 2025 [48] |
| Trial zu Paid, Kategorie Travel | 48,7 % | [F] [48] |
| Trial zu Paid, Trials mit 17 bis 32 Tagen | 42,5 % (2026) bzw. 45,7 % (2025) | [F] [48][49] |
| Trial zu Paid, Trials bis 4 Tage | 25,5 % | [F] [49] |
| Download zu Paid nach 35 Tagen, Hard Paywall Median | 10,7 % (2026), 12,1 % (2025) | [F] [49][48] |
| Download zu Paid nach 35 Tagen, Freemium Median | 2,1 % | [F] [49] |
| Kündigungen am Tag 0 bei 14 Tage Trials | 35,7 % | [F] [50] |
| Retention nach 1 Jahr: Jahres / Monats / Wochenabo | 44,1 % / 17,0 % / 3,4 % (2025) | [F] [48] |
| Kündigung im ersten Jahr bei Jahresabos | rund 72 % (2026, gestiegen von rund 56 %) | [F] [49] |
| Erstattungsquote Travel | 1,51 % | [F] [48] |
| Westeuropa: Trial Conversion liegt unter Nordamerika | ohne Zahl | [F] [50] |
| Apple Small Business Program | 15 % Provision unter 1 Mio. $ Jahreserlös | [F] Apple, allgemein bekannt |

### 3.3 Annahmentabelle [A]

| Annahme | vorsichtig | realistisch | ambitioniert | Begründung |
| --- | --- | --- | --- | --- |
| Downloads Jahr 1 / 2 / 3 (organisch und bezahlt) | 8.000 / 15.000 / 22.000 | 20.000 / 40.000 / 60.000 | 45.000 / 90.000 / 150.000 | ROADS erreichte weltweit und gratis rund 180.000 Nutzer in 4 Jahren [28]; Kurviger hat rund 10.000 iOS Bewertungen in DE [27] |
| Virale Downloads je neuem Zahler (k) | 0,2 | 0,35 | 0,5 | Gruppe bis 6 Fahrzeuge, jedes Mitglied braucht ein Abo |
| Download zu Trial | 20 % | 28 % | 35 % | Hard Paywall mit Test, hoher Kaufwille der Zielgruppe; deutlich über Median 6,2 %, weil Navigation ohne Abo nicht nutzbar ist |
| Trial zu Paid | 35 % | 42 % | 48 % | Benchmarks 42,5 bis 48,7 %, Westeuropa leicht darunter |
| ergibt Download zu Paid | 7,0 % | 11,8 % | 16,8 % | realistisch entspricht Hard Paywall Median |
| Mix Woche / Monat / Jahr / Saison | 15 / 20 / 40 / 25 % | 10 / 20 / 50 / 20 % | 8 / 17 / 55 / 20 % | Jahresabo ist bei 14,99 € Monatspreis rechnerisch klar günstiger |
| Wochen je Wochenkäufer | 1,4 | 1,6 | 1,8 | Wochenendtour, Urlaub, Mietwagen |
| Monatsabo Kündigung in Saison / außerhalb | 10 % / 28 % | 8 % / 22 % | 6 % / 18 % | ergibt 12 Monats Retention von 9 / 16 / 24 % (Benchmark 17 %) |
| Verlängerung Jahresabo | 30 % | 40 % | 50 % | Benchmark 28 bis 44 % |
| Wiederkauf Saisonpass | 35 % | 45 % | 55 % | Saisonfahrer kommen wieder |
| Saisonpass Laufzeit | 3 Monate | 3 Monate | 3 Monate | wie calimoto [30] |
| Club S aktiv Jahr 1 / 2 / 3 | 3 / 6 / 10 | 8 / 18 / 30 | 15 / 35 / 60 | 97 Porsche Regionalclubs allein in DE [10] |
| Club L aktiv Jahr 1 / 2 / 3 | 1 / 2 / 3 | 3 / 6 / 10 | 5 / 12 / 20 | Tourenanbieter, Zentren, Hotels |
| Saisonalität Downloads Jan bis Dez | 3, 4, 8, 12, 14, 13, 12, 11, 10, 7, 3, 3 % | gleich | gleich | Saison April bis Oktober |
| USt gewichtet (DE 19 %, AT 20 %, CH 8,1 %, Mix 80/10/10) | 18 % | 18 % | 18 % | App Store Preise sind Bruttopreise |
| Apple Gebühr | 15 % | 15 % | 15 %, über 1 Mio. $ 30 % auf Neuabos | Small Business Program |
| Erstattungen | 2 % | 2 % | 2 % | Travel 1,51 % [48] |
| Clubpreise | brutto inkl. 19 % USt, Stripe 1,5 % + 0,25 € | gleich | gleich | vorsichtige Lesart |

### 3.4 Ergebnis

| Szenario | Jahr | Downloads | neue Zahler | aktive Jahresabos | Saisonpässe | Monatsabos (Spitze) | Club Fahrzeuge | App Umsatz brutto | App netto | Club netto | **Gesamt netto** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vorsichtig | 1 | 8.110 | 568 | 227 | 142 | 74 | 56 | 27.435 € | 19.367 € | 1.947 € | **21.314 €** |
| vorsichtig | 2 | 15.210 | 1.065 | 494 | 316 | 142 | 112 | 60.091 € | 42.420 € | 3.894 € | **46.314 €** |
| vorsichtig | 3 | 22.309 | 1.562 | 773 | 501 | 211 | 180 | 93.520 € | 66.019 € | 6.245 € | **72.263 €** |
| realistisch | 1 | 20.830 | 2.450 | 1.225 | 490 | 343 | 156 | 129.689 € | 91.551 € | 5.436 € | **96.988 €** |
| realistisch | 2 | 41.692 | 4.903 | 2.941 | 1.201 | 729 | 336 | 315.690 € | 222.856 € | 11.681 € | **234.537 €** |
| realistisch | 3 | 62.549 | 7.356 | 4.854 | 2.012 | 1.130 | 560 | 518.073 € | 365.725 € | 19.468 € | **385.193 €** |
| ambitioniert | 1 | 48.980 | 8.229 | 4.526 | 1.646 | 1.051 | 280 | 448.090 € | 316.321 € | 9.734 € | **326.055 €** |
| ambitioniert | 2 | 98.127 | 16.485 | 11.330 | 4.202 | 2.339 | 660 | 1.141.791 € | 806.027 € | 22.957 € | **828.984 €** |
| ambitioniert | 3 | 163.573 | 27.480 | 20.779 | 7.807 | 4.046 | 1.120 | 2.082.809 € | 1.470.322 € | 38.936 € | **1.509.258 €** |

**Korrektur Apple Schwelle (ambitioniert Jahr 3):** Bei 1,08 $ je € [A] liegt die 1 Mio. $ Schwelle bei rund 925.926 € Erlös. In Jahr 3 werden rund 0,64 Mio. € darüber erzielt; bei 60 % Anteil Neuabos [A] und 15 Prozentpunkten Mehrprovision kostet das rund 57.642 €. **Ambitioniert Jahr 3 netto damit rund 1,45 Mio. €.** Jahr 2 bleibt mit rund 870.509 $ knapp unter der Schwelle.

**Summe über 3 Jahre (netto):** vorsichtig rund 140 Tsd. €, realistisch rund 717 Tsd. €, ambitioniert rund 2,61 Mio. € (nach Apple Korrektur).

**Saisonalität (realistisch, Jahr 3, Brutto je Monat):** Januar 17.178 €, Mai 63.596 € als Spitze, Dezember 22.923 €. Rund 76 % des Umsatzes fallen in April bis Oktober. Die Liquidität muss den Winter überbrücken.

### 3.5 Sensitivität (realistisch, App netto Jahr 3, Basis 365.725 €)

| Änderung | App netto Jahr 3 | Veränderung |
| --- | --- | --- |
| Download zu Trial 20 % statt 28 % | 258.146 € | minus 29 % |
| Download zu Trial 35 % | 461.989 € | plus 26 % |
| Trial zu Paid 30 % statt 42 % | 258.146 € | minus 29 % |
| Downloads minus 30 % | 256.007 € | minus 30 % |
| Jahresverlängerung 28 % (RevenueCat 2026) | 349.034 € | minus 5 % |
| Jahresverlängerung 50 % | 380.775 € | plus 4 % |
| keine virale Wirkung (k = 0) | 351.035 € | minus 4 % |
| Wochenpass 9,99 € statt 6,99 € | 368.217 € | plus 1 % |
| Saisonpass 49 € statt 39 € | 379.925 € | plus 4 % |
| Saisonpass gestrichen (Käufer gehen zu 70 % ins Jahr, 30 % in den Monat) | 397.591 € | plus 9 % |
| Jahresabo 69,99 € bei gleichem Mix | 399.994 € | plus 9 % |

**Lesart:** Conversion und Reichweite bewegen das Ergebnis drei bis sechsmal stärker als jede Preisänderung. Die Verlängerungsrate wirkt in drei Jahren noch wenig, entscheidet aber ab Jahr 4 über den Wert des Geschäfts.

### 3.6 Kostenblick (nur grob, alles [A])

Eigener Routing Server (Valhalla oder GraphHopper mit Europa Daten, dedizierter Server mit 64 bis 128 GB RAM) rund 100 bis 250 € pro Monat, Kartenkacheln und Geocoding je nach Anbieter 0 bis 500 € pro Monat, Supabase rund 25 bis 100 € pro Monat, Sprachfunk Infrastruktur nutzungsabhängig, Apple Developer Programm 99 $ pro Jahr. Der Betrieb liegt damit im vorsichtigen Szenario bei einem großen Teil des Umsatzes, im realistischen Szenario deutlich darunter. Nicht eingerechnet: Marketing, Support Zeit, Rechtsberatung.

## 4. Go to Market, Pricing, Risiken, nächste Schritte

### 4.1 Go to Market Hebel

| Hebel | Warum | Konkret | Priorität |
| --- | --- | --- | --- |
| **CUMO DRIVERS CLUB als Testfeld und Schaufenster** | Echte Touren beweisen das Produkt, Teilnehmer werden Botschafter | Jede CDC Tour 2027 läuft nur noch mit CUMO DRIVE (statt calimoto, Zello, WhatsApp); Teilnehmer erhalten den Test bei Anmeldung | sehr hoch |
| **Porsche Regionalclubs und Markenclubs** | 97 Regionalclubs allein im PCD [10], Fahrtenleiter planen jedes Jahr Ausfahrten | Pilotprogramm "Club Season 2027": 10 Clubs mit Club S zum Einführungspreis, Gegenleistung Feedback und Nennung | sehr hoch |
| **Tourenanbieter und Porsche Zentren** | Zentren organisieren selbst Pässe Touren [13][14]; Anbieter wie Alpcars [17] | Club L als Werkzeug für Veranstalter, Roadbook Export als Verkaufsargument | hoch |
| **Sportwagen Vermieter** | mietedeinsportauto: 17 Städte, über 300 Fahrzeuge [20]; Mieter wollen ein Wochenende lang die besten Straßen | Wochenpass als Beigabe oder Upsell bei der Buchung, kuratierte Touren je Standort | hoch, passt perfekt zum Wochenpass |
| **Hotels an Pässen** | Hotels wie der Jagdhof veranstalten eigene Porschetreffen [16] | "Hotel Touren" als Community Touren mit Hotel als Start, Hotel verteilt Code | mittel |
| **Instagram @rallycumo** | Bestehender Kanal und Automatisierung, Zielgruppe ist visuell | Reels "Route des Monats" mit Link in die App, Vorher Nachher calimoto gegen CUMO DRIVE Routing | hoch; nur kommerziell lizenzierte Musik verwenden |
| **Events und Track Day Szene** | Nordschleife ist seit 2025 reine Auto Szene bei Touristenfahrten [21] | Anfahrt Touren zu Events (zum Beispiel "die schönste Anfahrt zum Ring") | mittel |
| **Plattformen wie elferspot** | Event Kalender mit Sportwagen Touren [15] | Kooperation: Events mit Tour Datei in CUMO DRIVE | mittel |
| **Frankreich und Italien** | Alpenpässe, Vogesen, Dolomiten sind Kernrevier der Zielgruppe | ab Jahr 2: Sprachen FR und IT, Partner vor Ort | später |

### 4.2 Pricing Einschätzung

| Element | Heute | Einschätzung | Empfehlung |
| --- | --- | --- | --- |
| 14 Tage Test | ✓ | richtig; 17 bis 32 Tage Trials konvertieren am besten [49], 14 Tage passen zum Wochenrhythmus | behalten, Test am besten an die erste Tour koppeln (Start bei erster Navigation statt beim Download) |
| Woche 6,99 € | | günstiger als calimoto (9,99 €). Wirkung auf Umsatz klein (plus 1 % bei 9,99 €) | auf 7,99 bis 9,99 € anheben; ideal für Mietwagen Kunden |
| Monat 14,99 € | | gleich Scenic [38], doppelt Kurviger Tourer+ Monat. Gut als Anker, der das Jahresabo attraktiv macht | behalten |
| Jahr 59,99 € | | gleich calimoto und Scenic, doppelt Kurviger und DriveGo, gegen ROADS (gratis) nur mit klarem Mehrwert haltbar | behalten; 69,99 € erst, wenn Gruppe und Funk stabil laufen (plus 9 % im Modell) |
| Saisonpass 39 € | | kritisch, falls er die ganze Saison abdeckt: Sportwagen fahren fast nur April bis Oktober, dann ersetzt der Pass das Jahresabo für 35 % weniger | auf 3 Monate begrenzen (wie calimoto [30]) oder auf 49 € setzen; im Modell bringt Streichen plus 9 % |
| Gruppe: jeder braucht ein eigenes Abo | | stärkster viraler Hebel, aber größte Hürde: Gäste einer einmaligen Ausfahrt zahlen ungern 59,99 € | **Gast Pass**: Gastgeber mit Abo lädt bis zu 5 Gäste für einen Tag kostenlos oder für 2,99 € je Gast ein; danach Angebot mit Testrabatt |
| Club S 490 € (12 Fahrzeuge) | | entspricht 40,83 € je Fahrzeug, 32 % unter Einzelabo. Passt für feste Clubs | behalten |
| Club L 890 € (20 Fahrzeuge) | | 44,50 € je Fahrzeug, also teurer je Fahrzeug als Club S. Für Tourenanbieter mit wechselnden Teilnehmern passt ein fester Fahrzeugpool nicht | Staffel umdrehen (größer ist günstiger je Fahrzeug) und zusätzlich **Event Lizenz** (zum Beispiel 99 bis 149 € je Tour bis 20 Fahrzeuge) für Veranstalter |
| Familie / Zweitfahrzeug | fehlt | calimoto bietet ein Familienabo [26] | Partner oder Familienabo prüfen |

### 4.3 Größte Risiken

1. **Kostenlose Konkurrenz durch Porsche:** ROADS ist gratis, markenoffen, hat CarPlay und Community [28][46]. Für die größte Einzelgruppe (410.445 Porsche in DE) ist die Zahlungsbereitschaft das Kernrisiko.
2. **Gruppenfunktion nur mit iOS:** Wenn ein Gruppenmitglied Android nutzt, funktioniert die Gruppe nicht. Bei Ausfahrten ist das der Normalfall. Gegenmittel: Web Ansicht für Gäste oder Android früh nachziehen.
3. **Technik in der Fahrsituation:** Sprachfunk (Push to Talk) und CarPlay brauchen nativen Code und Freigaben von Apple. Ein Ausfall auf einer Tour zerstört Vertrauen im Club Kanal sofort.
4. **Nischengröße und Saisonalität:** SAM rund 0,3 Mio. Personen, rund 76 % des Umsatzes in sieben Monaten. Bezahlte Werbung ist in einer so kleinen Zielgruppe teuer.
5. **Nachahmer und calimoto:** Konvoi und Sprachchat sind bei DriveGo und Strada1 schon vorhanden [32][35]; calimoto kann ein Auto Profil nachziehen.
6. **Recht und Haftung:** Blitzerwarner sind in Deutschland für Fahrer verboten (§ 23 Abs. 1c StVO) [A, Rechtslage allgemein bekannt, vor Einbau prüfen]; Live Standorte erfordern saubere DSGVO Umsetzung; Routen über gesperrte oder ungeeignete Straßen bergen Haftungsfragen.
7. **Zweierteam:** Entwicklung nur durch Koray und Claude bedeutet begrenzte Kapazität für Support, Android und Expansion.

### 4.4 Die drei wichtigsten nächsten Schritte

1. **Gruppen und Preismodell vor dem Launch validieren (bis Februar 2027):** 15 bis 20 Gespräche mit Fahrtenleitern von Porsche Regionalclubs und zwei bis drei Tourenanbietern; Gast Pass, Event Lizenz und Saisonpass als Varianten zeigen. Ziel: fünf Absichtserklärungen für Club Season 2027.
2. **Den Routing Vorteil messbar machen:** 10 Referenzrouten (Vogesen, Schwarzwald, Alpenpässe) parallel mit CUMO DRIVE, ROADS by Porsche, calimoto und Kurviger planen und auf echten CDC Touren fahren. Kennzahlen: Anteil zu schmaler oder gesperrter Abschnitte, Kurvenanteil, Fahrerbewertung. Ergebnis als Vergleichsvideo für Instagram und Club Präsentationen.
3. **Funnel Kennzahlen ab Tag 1 instrumentieren:** RevenueCat oder vergleichbar einbauen und die beiden stärksten Hebel überwachen: Download zu Trial (Ziel mindestens 25 %) und Trial zu Paid (Ziel mindestens 40 %). Liegen die Werte nach der ersten Saison unter 20 % und 35 %, gilt das vorsichtige Szenario, und Produkt oder Onboarding müssen vor jeder Werbeausgabe nachgebessert werden.

## Anhang: Rechenweg

Die Zahlen wurden mit zwei Python Skripten berechnet: ein Marktmodell (Pool, TAM, SAM) und ein Monatsmodell über 36 Monate (Downloads, Funnel, Kohorten für Monats, Jahres und Saisonabos, Clubs, USt, Apple, Erstattungen) samt Sensitivitätsrechnung. Alle Annahmen stehen in den Tabellen 1.2, 1.3 und 3.3, sodass das Modell mit anderen Werten nachgerechnet werden kann.

## Quellen

1. motor.com.de, Pkw Bestand in Deutschland 2026: die KBA Zahlen: https://motor.com.de/ratgeber/pkw-bestand-deutschland-2026
2. mobiflip, Das ist der aktuelle Fahrzeugbestand in Deutschland: https://www.mobiflip.de/das-ist-der-aktuelle-fahrzeugbestand-in-deutschland/
3. Statistik Austria, Fahrzeugbestand 2025 STATkompakt: https://www.statistik.at/fileadmin/publications/Fahrzeugbestand_2025_STATkompakt.pdf
4. blue News, Anzahl Fahrzeuge auf Schweizer Straßen nimmt zu (BFS): https://www.bluewin.ch/de/news/wirtschaft/anzahl-fahrzeuge-auf-schweizer-strassen-nimmt-um-ein-prozent-zu-li.2919461
5. best selling cars, 2025 Germany total number of registered cars by brand: https://www.best-selling-cars.com/germany/2025-germany-total-number-of-registered-cars-by-brand-kfz-bestand/
6. PC Welt, Diese Autos kauft bald niemand mehr (Cabrio): https://www.pcwelt.de/article/3081808/diese-autos-kauft-bald-niemand-mehr-cabrio.html
7. autohaus, Zahl der Oldtimer erreicht neuen Rekordwert: https://www.autohaus.de/nachrichten/autohersteller/zahl-der-oldtimer-erreicht-neuen-rekordwert-jede-menge-kulturgut-3775822
8. Landesstatistik Steiermark, Pkw Bestand nach Marken 2012 bis 2025: https://www.landesentwicklung.steiermark.at/cms/dokumente/12658772_142970621/9ed37f52/Pkw-Bestand%20nach%20Marken%202012-2025.pdf
9. Blick, Die Schweiz ist Europas Sportwagen Paradies: https://www.blick.ch/auto/abgefahren/von-bugatti-bis-koenigsegg-die-schweiz-ist-europas-sportwagen-paradies-id21631275.html
10. Porsche Club Deutschland, Imagebroschüre: https://www.porsche-club-deutschland.de/wp-content/upload/Mitgliedschaft/Dateien/PCD-ImageBroschuere.pdf
11. Porsche Newsroom, Porsche Clubs feiern 70jähriges Bestehen: https://newsroom.porsche.com/de/2022/szene-passion/porsche-clubs-70-jahre-community-weltweit-28481.html
12. stuttcars, Porsche Club Umbrella Organizations: https://www.stuttcars.com/porsche-clubs-community/porsche-club-umbrella-organizations
13. Porsche Zentrum Münster, 12 Pässe Tour 2025: https://dealer.porsche.com/de/muenster/de-DE/news-und-veranstaltungen/rueckblick/2025/12-paesse-tour
14. Porsche Zentrum Mannheim, Wiesn Ausfahrt: https://dealer.porsche.com/de/mannheim/de-DE/news-und-veranstaltungen/aktuelles/2024/wiesn-ausfahrt
15. elferspot, Tours und Events: https://www.elferspot.com/de/events/
16. Hotel Jagdhof, Programm Porschetreffen 2026: https://offers.hotel-jagdhof.at/fileadmin/files/PDF/202604_jagdhof_spa_hotel_programm_porschetreffen_final.pdf
17. elferspot, Im Porsche auf den Großglockner (Alpcars): https://www.elferspot.com/de/?p=3658652
18. biggarage, 5 Day Sportscars Tour Europe: https://www.biggarage.de/info/5-day-sportscars-tour-europe.html
19. Luxury Escapes, 8 Day Alpine Supercar Driving Tour 2026: https://luxuryescapes.com/ie/tour/tour-487bab0e-5e24-4e69-a66f-60f0032a7057/alpine-8d-supercar-driving-tour-with-luxury-st-moritz-stay-base
20. mietedeinsportauto: https://www.mietedeinsportauto.de/
21. motor1, Nürburgring verbannt Motorräder von Touristenfahrten: https://de.motor1.com/news/751367/nuerburgring-nordschleife-verbannt-motorraeder/
22. AUTO ZEITUNG, Fünf Fakten über den Nürburgring: https://www.autozeitung.de/fakten-nuerburgring-204256.html
23. Mercedes-AMG, Community und Private Lounge: https://mercedes-amg.com/en/community
24. calimoto, Preise: https://calimoto.com/en/pricing
25. dealroom, Calimoto GmbH: https://app.dealroom.co/companies/calimoto
26. App Store UK, calimoto: https://apps.apple.com/gb/app/id1209129603
27. App Store DE, Kurviger: https://apps.apple.com/DE/app/id6473445827
28. Porsche Newsroom, ROADS by Porsche Update 2023: https://newsroom.porsche.com/en/2023/products/porsche-roads-by-porsche-app-update-31243.html
29. Porsche Stories, What is ROADS by Porsche: https://porsche.com/stories/innovation/what-is-porsche-roads
30. iphone-ticker, calimoto deutlich teurer (2023): https://www.iphone-ticker.de/calimoto-deutlich-teurer-biker-app-setzt-auf-neues-premium-modell-215844/
31. iphone-ticker, Kurviger Reise und Routenplanung für Auto und Motorrad (2025): https://www.iphone-ticker.de/kurviger-reise-und-routenplanung-fuer-auto-und-motorrad-248329/
32. App Store US, DriveGo: https://apps.apple.com/us/app/-/id6757678516
33. App Store US, RoadStr: https://apps.apple.com/us/app/id1382535778
34. motor1 ES, RoadStr: https://es.motor1.com/news/495974/roadstr-aplicacion-coches-planes-aficionados/
35. mwm.ai, Strada1: https://mwm.ai/apps/strada1/6752026119
36. mwm.ai, Drively Routes: https://mwm.ai/apps/drively-routes/6744893918
37. App Store US, Rallista: https://apps.apple.com/us/app/rallista/id1380338355
38. App Pricing Lab, Scenic In App Prices: https://apppricinglab.com/iap/apple/1089668246
39. App Pricing Lab, REVER In App Prices: https://apppricinglab.com/iap/apple/975571447
40. Adapty Paywall Library, Roadtrippers: https://adapty.io/paywall-library/roadtrippers/
41. MyRoute-app Shop: https://www.myrouteapp.com/en/shop
42. MyRoute-app Support, Subscriptions: https://support.myrouteapp.com/en/support/solutions/articles/12000074800
43. iphone-ticker, Sygic Premium zum halben Preis (2024): https://www.iphone-ticker.de/sygic-gps-navigation-jahreszugang-premium-zum-halben-preis-246137/
44. The Drive, DriveTribe is finally shutting down: https://www.thedrive.com/news/43814/drivetribe-is-finally-shutting-down-for-good
45. iphone-ticker, Kurviger mit CarPlay und GPX Import (2025): https://www.iphone-ticker.de/motorrad-app-kurviger-carplay-unterstuetzung-und-gpx-import-254249/
46. AppFollow, ROADS by Porsche Store Listing: https://apps.appfollow.io/ios/roads-by-porsche/1438225964?country=us
47. PCA Upper Canada Region, There's an App for That (2024): https://pcaucr.org/2024/07/theres-an-app-for-that/
48. RevenueCat, State of Subscription Apps 2025: https://revenuecat.com/state-of-subscription-apps-2025
49. RevenueCat, Subscription App Trends and Benchmarks 2026: https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026.md
50. SaaStr, Top 10 Learnings from RevenueCat's State of Subscription Apps: https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/
51. Motorradonline, 5 Millionen Marke geknackt (Krafträder 1.1.2025: 5.059.248): https://www.motorradonline.de/ratgeber/5-millionen-marke-geknackt-motorraeder-in-deutschland/
