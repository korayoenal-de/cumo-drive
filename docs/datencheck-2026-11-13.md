# Datencheck Rest, 13. November 2026

Jede kuratierte Strecke (437 in der App, dazu 13 wegen Schnellstraße geparkte) wurde mit Stützpunkten alle 1,2 km entlang ihrer eigenen Linie geplant, mit dem Sportwagen Profil auf Server 1 (Skript `routing/scripts/datencheck/check3.py`). Am 12.11. war nur von Anfang bis Ende geplant worden; ein abweichender Weg sagte dort nicht, warum.

## Ergebnis

| Befund | Anzahl |
|---|---|
| Folgt der Linie ohne Befund | 361 |
| Linie liegt auf geschwungenen Straßen etwas neben der Straße (ausgedünnte Linie, kein Fehler) | 27 |
| Außerhalb von Server 1 (Toskana, Zentralmassiv, Pyrenäen, liegen auf Server 2 zum Test) | 26 |
| Linie über Autobahn oder Kraftfahrstraße | 12 |
| Linie über Schotter, Wirtschaftsweg oder Nebenwege | 6 |
| Anlieger frei auf 500 bis 1000 m (kurze Stücke in Orten) | 9 |

## Umgesetzt

* **Zurück, mit neuer Linie ohne Schnellstraße:** Rigi Nordseite, Windische Bühel, Vipava Tal
* **Neue Linie auf Asphalt:** Würzjoch, Nationalparkstraße, Unteres Maintal
* **Wieder angesagt:** Seenstraße bei Reit im Winkl (Weitsee), Hoher Meißner, Gesäuse, Malta Hochalmstraße, Col de Joux Plane, Črnivec. Sie folgen ihrer Linie sauber; die Abweichung am 12.11. kam nur von der Planung Anfang bis Ende.
* **Gestrichen:** Panoramica Zegna (21 Prozent ohne festen Belag)
* **Geparkt, Linie läuft über Autobahn:** Hunsrückhöhenstraße, Rottal, Eisenstadt Mattersburg, Lavanttal, Packsattel (liegt auf der A2), Critérium Jurassien Villars Réclère, Karst Plateau. Lösung: aus den Quellen neu bauen, ohne Autobahn.
* **Geparkt, viel Kraftfahrstraße:** Illertal Höhenstraße (B 19 vierspurig), Weserbergland bei Rinteln
* **Anlieger frei:** bleiben alle, das Profil fährt die kurzen Stücke. Strada delle Dolomiti, Valle Verzasca und Gorges de l'Ardèche sind betroffen.

## Für Koray

* **Feldbergstraße:** Die Linie nutzt ein Stück Wirtschaftsweg mit Schotter. Auf Asphalt ist der Weg 33 Prozent länger. Geparkt, bis du entscheidest: neue Linie oder raus.
* **Davča:** Die Linie nutzt Nebenwege, für Sportwagen wäre der Weg doppelt so lang. Geparkt.
* **Mangartstraße und Gorges de l'Ardèche:** Ein Stützpunkt findet keine Straße im Graph. Mangart ist eine Mautstraße mit Tunneln, eventuell fehlt sie für Autos in der Karte. Beide bleiben in der App und werden weiter angesagt, wenn man sie fährt.
