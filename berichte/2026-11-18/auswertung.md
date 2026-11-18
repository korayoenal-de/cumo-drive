# Routen Check 18.11.2026: Auswertung

51 Routen, 32 ohne Befund, 18 mit Hinweis, 1 mit Fehler (Vortag 5 Fehler). Beide Routing Server antworten, Planung im Schnitt 4 s, Fahrspaß 67, Traumstrecken und Pässe 41 %.

## Fazit

Die festen Fälle sind stabil oder besser: Grimsel Furka Susten und Sellaronda fahren nichts mehr doppelt, die Schwarzwaldhochstraße hat keinen Befund mehr, und München nach Innsbruck nimmt jetzt den schnelleren Weg über Garmisch mit 56 % Autobahn. Pässe und Traumstrecken werden auf allen Passrouten bevorzugt (Dolomiten, Stilfser Joch, Klausen 87 bis 100 %). Die Schwachstelle bleibt die Rundtour ab Tälern und Seestädten: Livigno 70 km wird 183 km, Linthal 190 km nur 131 km, Lugano fährt zum dritten Mal in Folge viel durch Orte. Neu aufgefallen: Rundtouren sind nicht reproduzierbar, derselbe Fall liefert beim zweiten Lauf eine andere Runde. Echte Probleme heute: 5, dazu Bensheim als bekannter Punkt.

## Echte Probleme

1. **Rundtour Livigno 70 km wird 183 km** (Hinweis, App fragt). Die Runde fährt Foscagno, Bormio, Gavia, Mortirolo, Tirano, Bernina und Forcola (weitester Punkt 46,255 N, 10,519 O, 43 km Luftlinie). Livigno hat keine kurze Runde; die kürzeste echte Runde wäre Forcola, Bernina, Engadin, Ofenpass Straße und Munt la Schera Tunnel, etwa 110 km. Vermutung: der Tunnel fällt unter „Maut vermeiden“, und `app/src/lib/smart-roundtrip.ts` nimmt dann die beste Bewertung statt der passendsten Länge. Vorschlag: Varianten über 130 % hart aussortieren (wie am 17.11. vorgeschlagen), bei Tälern ohne kurze Runde gleich die Rückfrage mit hin und zurück zeigen; Maut für kurze Tunnel nicht als Ausschluss werten oder in der Rückfrage nennen.
2. **Rundtour Lugano 100 km mit 60 % Orten** (42 km) und **Lugano 80 km wird 126 km mit 40 % Orten** (dritter Tag in Folge). Die 100er Runde zieht nach Südwesten über Ponte Tresa Richtung Varese (45,82 N, 8,91 O) und zurück über das Mendrisiotto, beides dicht bebaut. Vermutung: im Süden fehlen bevorzugte Strecken, deshalb zieht nichts die Planung in die Täler. Vorschlag: Strecken Datenbank ergänzen (Valcolla, Val d'Intelvi, Monte Generoso Zufahrt, Valle di Muggio, Monte Ceneri und Alpe di Neggia) und Lugano als Startstadt in `allowCities` der Prüfung aufnehmen.
3. **Rundtour Garmisch 50 km: B2 Garmisch nach Klais hin und zurück** (Hinweis, 6,5 km doppelt plus 4,4 km parallel, 47,488 N, 11,160 O bis 47,482 N, 11,242 O). Die Runde ist ein Lolli: Stiel Garmisch, Klais, Mittenwald, Schleife über Scharnitz, Seefeld und Leutasch, 71 statt 50 km, Fahrspaß nur 38. Vermutung: ab Garmisch gibt es für 50 km keine echte Runde, die Auswahl hält den Stiel aber nicht für eine Stichstraße, weil er über 1,5 km um zu Hause hinausgeht. Vorschlag: in `smart-roundtrip.ts` bei kurzen Wunschlängen Lolli mit langem Stiel gegen das Angebot hin und zurück (39 km über Ettaler Sattel) abwägen und das bessere als Vorschlag zeigen, nicht nur als Rückfrage.
4. **Rundtour Linthal 190 km wird 131 km, Planung 26 bis 28 s** (Hinweis). Die Runde nimmt nur Klausen und Pragel. Eine passende Runde gäbe es: Klausen, Altdorf, Brunnen, Ibergeregg, Einsiedeln, Sattelegg, Näfels, etwa 190 km. Vermutung: der Pragel (Wintersperre, schmal) kürzt die Runde ab, und die Varianten mit weiteren Pässen laufen in eine Zeitgrenze. Vorschlag: in `smart-roundtrip.ts` bei zu kurzen Runden einen weiteren Pass aus der Nähe als Via Punkt einbauen (Ibergeregg, Sattelegg) und die Zeit je Variante begrenzen.
5. **Rundtouren sind nicht reproduzierbar.** Beim Nachprüfen mit gleichem Seed lieferte Cortina 130 km statt 127,5 km (mit Stich) eine Runde von 168,7 km ohne Befund, Martigny 260 km statt 276,6 km eine von 280,9 km mit 5,8 km Stich bei Saint Maurice (46,22 N, 7,00 O). Vermutung: parallele Varianten mit Zeitgrenze, je nach Antwortzeit des Servers gewinnt eine andere. Vorschlag: in `smart-roundtrip.ts` alle Varianten abwarten (mit fester Obergrenze) und bei Gleichstand stabil sortieren; sonst sind Vergleiche mit dem Vortag und Korays Würfeltests schwer zu deuten.

Bekannt und wartet auf Koray: **Rundtour Bensheim 120 km mit 37 % Orten** (Vortag 40 %). Bleibt bis zum Schritt Kurvig auf distance_influence 5 auf dem Server.

Verdacht bleibt: **Rundtour Chur 150 km** Schlenker bei Küblis (46,915 N, 9,766 O), heute nur noch einer statt zwei. Bitte auf dem Gerät ansehen, ob die alte Ortsdurchfahrt statt der Umfahrung gewählt wird.

## Fehlalarme und bessere Prüfung

* **Rundtour Cortina 130 km, Fehler 3 km doppelt**: Stück Cortina nach Pocol (46,540 N, 12,133 O bis 46,522 N, 12,110 O). Giau und Falzarego beginnen beide in Pocol, der Stiel ist von der Geografie erzwungen. Vorschlag: Ausnahme um zu Hause bis zur ersten Kreuzung mit einer Durchgangsstraße, höchstens 4 km (wie am 17.11.).
* **München nach Innsbruck, Pass verloren: Kesselberg, Fahrspaß 33 → 10**: im Profil Schnell ist der Weg über Garmisch richtig (Autobahn 61 → 80 km, 3 min schneller). Vorschlag: in `qa/daily/run.ts` den Vergleich „Pass verloren“ und „Fahrspaß schlechter“ für die Gruppe schnell nicht melden.
* **Zirler Berg** (47,270 N, 11,259 O) bei München nach Tirol und Rundtour Innsbruck 110 km, **Cencenighe** (46,354 N, 11,966 O) bei Bozen 200 km: Kehren am Pass, gleiche Stellen wie gestern. Vorschlag: Schleifen innerhalb von 2 km um eine Passhöhe oder auf einer Passstrecke nicht melden.
* **Umweg Col de la Cayolle nach Colle Fauniera** (206 km für 33 km Luftlinie) und **Klausenpass nach Splügenpass** (199 km für 54 km): im Hochgebirge gibt es keinen direkten Weg, die Route nimmt Valberg, Couillole und Lombarda bzw. Oberalp. Vorschlag: Umweg bei Pass zu Pass Fällen am kürzesten Straßenweg messen, nicht an der Luftlinie.
* **Orte über 30 %** bei Annecy 70 und 120 km, Freiburg 60 km (Startstadt), Pordoijoch nach Mendelpass (Bozen und Eppan liegen dazwischen), Gerlospass nach Jaufenpass (Zillertal und Wipptal ohne Alternative): Vorschlag wie am 17.11., die ersten und letzten 5 km nicht zählen und Annecy, Freiburg in `allowCities` aufnehmen; bei Pass zu Pass Fällen nur melden, wenn ein Weg mit weniger Orten höchstens 20 % länger wäre.
* **Martigny 260 km mit 47 % Orten**: teils echt (Rhonetal und Chablais), teils Start im Ort. Kein eigener Punkt, bitte nach den Änderungen an der Prüfung neu ansehen.

## Gegenüber dem Vortag

* Gesamt: Fehler 5 → 1, Hinweise 20 → 18, Fahrspaß 67 (gleich), Traumstrecken und Pässe 41 % (gleich).
* Feste Fälle besser: Grimsel Furka Susten doppelt 0,9 → 0 km, Sellaronda 0,2 → 0 km, Schwarzwaldhochstraße Orte 16,3 → 12,7 km (ohne Befund, aber Anteil Traumstrecken 84 → 71 %, bitte im Blick behalten), Chur Schlenker 2 → 1 und Orte 36 → 34 %, Freiburg Orte 38 → 39 % (praktisch gleich).
* München nach Innsbruck jetzt über Garmisch statt Kesselberg (gewollt im Profil Schnell, siehe oben).
* Lugano bleibt auffällig (16., 17. und 18.11.).
* Seit gestern keine Änderungen an der Routing Logik auf main, nur Oberfläche und Performance (kodierte Linien vom eigenen Server); die Längen der festen Fälle weichen um höchstens 0,7 km ab, die Dekodierung wirkt also korrekt.
* Die 20 wechselnden Fälle sind neu gewürfelt und nicht direkt vergleichbar.
