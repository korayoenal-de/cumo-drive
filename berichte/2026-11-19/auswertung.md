# Routen Check 19.11.2026: Auswertung

51 Routen, 36 ohne Befund, 15 mit Hinweis, 0 mit Fehler (Vortag 32, 18, 1). Beide Routing Server antworten, Planung im Schnitt 4 s, Fahrspaß 67, Traumstrecken und Pässe 44 % (Vortag 41 %).

## Fazit

Die festen Fälle sind stabil: alle 31 liefern bis auf 2 km (Stilfser Joch und Gavia) dieselbe Länge wie gestern, die Rundtouren damit diesmal reproduzierbar, keine Verschlechterung. Pässe und Traumstrecken werden auf allen Passrouten bevorzugt (Dolomiten, Grimsel Furka Susten, Klausen, Großglockner 87 bis 100 %), auch die neue Entscheidung „kurvig oder direkt je Etappe“ (plan.ts, 18.11.) hat keinen festen Fall verändert. Die Schwachstelle bleibt die Rundtour ab Tälern ohne Ausgang und ab Lugano: Bonneval wird 443 statt 270 km, Lugano fährt zum vierten Mal in Folge zu lang und durch Orte. Echte Probleme heute: 4, dazu Bensheim als bekannter Punkt.

## Echte Probleme

1. **Rundtour Bonneval 270 km wird 443 km, 240 km wird 412 km** (Hinweis, App fragt und bietet hin und zurück an). Die 270er Runde meidet den Iseran und fährt über Mont Cenis, Sestriere und durch Italien zurück, die 240er nimmt Iseran, Madeleine, Galibier und Mont Cenis. Im Sommer gäbe es eine echte Runde von etwa 250 km: Iseran, Bourg Saint Maurice, Cormet de Roselend, Beaufort, Albertville, Maurienne. Vermutung: `DEFAULT_AVOID.closures` ist an, und `smart-roundtrip.ts` zieht je Sperrung 1000 Punkte ab; mit gesperrtem Iseran bleibt nur die große Runde. Vorschlag: in der Rückfrage den Grund nennen („Iseran im Winter zu, kürzeste Runde 410 km“) und die Iseran Roselend Runde als Muster für Bonneval in die Varianten nehmen; Varianten über 130 % weiterhin hart aussortieren, solange eine passende existiert (Vorschlag vom 17.11.). Gleiches Bild, aber geografisch erzwungen: Sölden 110 → 225 km (kürzeste Runde Timmelsjoch, Jaufen, Brenner, Kühtai), Valloire 100 → 145 km, Linthal 220 km mit 17,8 km Stich Linthal Glarus (Klausen im Winter zu).
2. **Rundtour Lugano 80 km wird 126 km mit 40 % Orten** (vierter Tag in Folge, Zahlen identisch mit gestern). Die Runde zieht nach Westen zur Alpe di Neggia über Lago Maggiore und nach Osten Richtung Porlezza, beides durch dichte Uferorte. Vermutung: im Sottoceneri fehlen bevorzugte Strecken. Vorschlag wie am 18.11.: Strecken Datenbank ergänzen (Valcolla, Val d'Intelvi, Valle di Muggio, Monte Ceneri) und Lugano in `allowCities` der Prüfung.
3. **Planung zu langsam: Linthal 220 km 39 s, Bonneval 270 km 29 s** (Grenze 25 s, gestern Linthal 26 bis 28 s). Beide Fälle laufen in die gedrehten Varianten (plus und minus 60 Grad), weil der Stich über 6 % liegt, und jede Variante plant alle Pass Runden neu. Vorschlag: in `smart-roundtrip.ts` die gedrehten Varianten nur mit einer festen Zeitgrenze (etwa 8 s) rechnen und bei bekannten Sackgassentälern direkt die Rückfrage zeigen.
4. **Rundtour Chur 150 km: Schlenker bei Küblis** (46,915 N, 9,766 O), dritter Tag. In der vergrößerten Linie fährt die Runde einen Knoten von etwa 1 km. Vermutung: Abzweig von der Umfahrung in den Ort und wieder zurück (Anschluss am Tunnel). Vorschlag: auf dem Gerät mit Satellit ansehen; bestätigt es sich, Küblis Dorf in der Gewichtung des Servers abwerten oder die Prättigauer Straße als bevorzugte Strecke aufnehmen.

Bekannt und wartet auf Koray: **Rundtour Bensheim 120 km mit 37 % Orten** (gleich wie gestern). Bleibt bis zum Schritt Kurvig auf distance_influence 5 auf dem Server.

Verdacht: **Rundtour Valloire 100 km fährt durch den Fréjus Tunnel** (Schlenker bei 45,194 N, 6,674 O ist die Zufahrt in Modane). `DEFAULT_AVOID.tolls` ist aus, der Tunnel kostet einfach rund 50 €. Vorschlag: Maut in Rundtouren im Ergebnis als Hinweis nennen oder bei Rundtouren standardmäßig meiden.

## Fehlalarme und bessere Prüfung

* **Zirler Berg** (47,270 N, 11,259 O) bei München nach Tirol und Rundtour Innsbruck 190 km, **Cencenighe** (46,354 N, 11,966 O) bei Bozen 200 km: Kehren, gleiche Stellen wie an den Vortagen. Vorschlag: Schleifen innerhalb von 2 km um eine Passhöhe oder auf einer Passstrecke nicht melden.
* **Valloire Schlenker in Modane**: Tunnelzufahrt, kein Umweg. Vorschlag: Schleifen an Autobahn oder Tunnelanschlüssen nicht melden.
* **Orte über 30 %** bei Freiburg 60 km (Startstadt), Annecy 120 km (Seeufer), Altdorf 240 km (Reusstal, Walensee, Rheintal ohne Alternative), Arlberg nach Riedberg (Bregenzerwald liegt dazwischen): Vorschlag wie am 17. und 18.11., die ersten und letzten 5 km nicht zählen, Freiburg und Annecy in `allowCities`, bei Pass zu Pass Fällen nur melden, wenn ein Weg mit weniger Orten höchstens 20 % länger wäre.
* **Doppelt 0,3 und 0,5 km** bei Annecy und Bozen: kurze Stücke an Kreuzungen, unter der Schwelle für echte Stiche. Vorschlag: Hinweis erst ab 1 km oder nur außerhalb von 2 km um zu Hause.

## Gegenüber dem Vortag

* Gesamt: Fehler 1 → 0, Hinweise 18 → 15, Fahrspaß 67 (gleich), Traumstrecken und Pässe 41 → 44 %.
* Feste Fälle unverändert (Länge, Pässe, Fahrspaß, Befunde); einzig Stilfser Joch und Gavia 91,8 → 89,6 km bei gleichem Fahrspaß. Der Verdacht vom 18.11., Rundtouren seien nicht reproduzierbar, bestätigt sich heute nicht; bitte weiter beobachten.
* Lugano bleibt auffällig (16. bis 19.11.), Chur Küblis seit 17.11.
* Seit gestern auf main an der Routing Logik nur `plan.ts` (kurvig oder direkt je Etappe); kein fester Fall hat sich dadurch verändert.
* Die 20 wechselnden Fälle sind neu gewürfelt und nicht direkt vergleichbar.
