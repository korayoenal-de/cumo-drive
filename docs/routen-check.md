# Täglicher Routen Check

Idee von Koray (16.11.2026): Jeden Tag 50 Testrouten über die echte Planung der App, jede wird geprüft, danach ein Bericht mit Befunden und Vorschlägen.

## Ablauf

1. Geplante Aufgabe jeden Morgen, eine neue Cloud Sitzung mit dem Repo.
2. Im Ordner app: `npm ci`, dann `npx tsx --tsconfig scripts/replay/tsconfig.json qa/daily/run.ts --out qa/daily/out --prev <letztes ergebnis.json>`.
3. Ergebnis und Bericht kommen auf den Branch `qa-berichte` unter `berichte/<Datum>/` (Verlauf, Vergleich mit dem Vortag). main bleibt unberührt.
4. Claude liest den Bericht, sieht sich die Linien der auffälligen Routen an (SVG), prüft die Befunde und schreibt Vorschläge.
5. Der Bericht landet im Projekt als `claude/routen-check.md` (immer der neueste), dazu eine Mitteilung aufs Handy.

Der Lauf ändert nie Code auf main und spielt keine Updates ein. Vorschläge setzt Claude erst nach Korays OK um.

## Fälle (qa/daily/cases.ts)

30 feste Fälle, jeden Tag gleich, damit Rückschritte auffallen:

* Schnell: Frankfurt nach Stuttgart, München nach Innsbruck, Zürich nach Mailand, Köln nach Frankfurt
* Pässe: Arabba nach Cortina, Brixen nach Cortina, Sellaronda, fünf Dolomitenpässe in einer Tour, Stilfser Joch und Gavia, Livigno, Grimsel Furka Susten, Galibier, Iseran, Großglockner, Timmelsjoch, Vršič, Klausen, Großer St. Bernhard
* Traumstrecken: Schwarzwaldhochstraße, Route des Crêtes
* Gemischt: München schnell, dann kurvig nach Tirol
* Rundtouren von 60 bis 250 km in DE, IT, AT, CH und FR

20 wechselnde Fälle aus dem Tagesdatum: 12 Rundtouren ab zufälligen Orten mit zufälliger Länge und Richtung, 8 Strecken zwischen zwei Pässen.

## Prüfungen

| Prüfung | Fehler | Hinweis |
| --- | --- | --- |
| Geplant | keine Route | Planung über 25 s |
| Erwartete Pässe | Pass fehlt | |
| Stichstraße (doppelt gefahren) | ab 1 km | ab 0,3 km |
| Kleine Schleifen und Schlenker | | Route kommt in gleicher Richtung auf 25 m zurück, nach 300 m bis 3 km |
| Ortsdurchfahrten | | über 30 % der km in bebautem Gebiet |
| Großstädte | | Route berührt den Kern einer Großstadt |
| Traumstrecken und Pässe | | Anteil unter dem Mindestwert des Falls |
| Rundtour Länge | unter 70 % oder über 130 % plus 5 km | |
| Umweg (Strecke) | | Länge über dem 2,6 fachen der Luftlinie |
| Schnell | | Schnitt unter 70 km/h oder unter 50 % Autobahn |
| Gegenüber dem Vortag | | Fahrspaß 8 Punkte schlechter, Pass verloren, mehr doppelt |

## Erster Lauf 16.11.

Siehe Bericht im Projekt. Auffällig: Rundtouren aus Sackgassen Tälern (Bonneval 80 km wurde 435 km), Lugano 80 km wurde 126 km, Stichstraßen bei den fünf Dolomitenpässen.
