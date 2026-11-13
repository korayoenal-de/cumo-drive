# Abbiegehinweise: GraphHopper gegen Valhalla

Stand 2026-11-13 08:18 UTC, 10 Testrouten, Profil kurvig, Abstand für "dieselbe Stelle" 60 m.

| Route | km | GH | Valhalla | gleich | ähnlich | anders | nur GH | nur Valhalla |
|---|---|---|---|---|---|---|---|---|
| Weinstraße Pfalz | 22 | 25 | 28 | 19 | 4 | 0 | 2 | 5 |
| Schwarzwaldhochstraße | 49 | 25 | 31 | 16 | 8 | 0 | 1 | 7 |
| Allgäu Oberjoch | 23 | 23 | 32 | 19 | 1 | 1 | 2 | 11 |
| Timmelsjoch | 42 | 8 | 12 | 4 | 4 | 0 | 0 | 4 |
| Stilfser Joch | 41 | 12 | 17 | 8 | 3 | 1 | 0 | 5 |
| Furka und Grimsel | 37 | 11 | 14 | 9 | 1 | 0 | 1 | 4 |
| Vogesen Route des Crêtes | 30 | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| Gardasee Westufer | 58 | 50 | 45 | 25 | 8 | 1 | 16 | 11 |
| Kreisverkehre Elsass | 38 | 38 | 40 | 34 | 1 | 0 | 3 | 5 |
| Slowenien Vršič | 35 | 3 | 6 | 2 | 0 | 0 | 1 | 4 |
| **Summe** | 375 | 196 | 226 | 137 | 30 | 3 | 26 | 56 |

## Ergebnis

* 167 von 196 Anweisungen von GraphHopper (85 %) stimmen mit Valhalla überein oder unterscheiden sich nur in der Stärke (links gegen leicht links). Echte Widersprüche gibt es nur 3.
* 56 Mal meldet nur Valhalla ein Abbiegen. Das sind fast immer Kreuzungen, an denen die Straße ihren Namen oder ihre Nummer behält, aber abknickt („Rechts auf Jochstraße/B 308 abbiegen“, „Links abbiegen, um auf der Via Belvedere zu bleiben“). GraphHopper schweigt dort, weil sich der Name nicht ändert. Genau diese Stellen sind auf Bergstraßen und in Orten die gefährlichen.
* Die 26 Stellen „nur GH“ liegen fast alle in Ortsdurchfahrten (Riva del Garda), wo der Abgleich von Valhalla die Linie ausdünnt und kleine Haken abschneidet.

**Empfehlung:** Die Wegbeschreibung bleibt bei Valhalla, künftig auf dem eigenen Server. GraphHopper allein würde zu oft eine nötige Abbiegung verschweigen. Das Skript lässt sich jederzeit wiederholen, auch gegen den eigenen Valhalla (`VALHALLA=https://… npx tsx scripts/compare-instructions.ts`).

## Abweichungen im Einzelnen

### Weinstraße Pfalz

* nur GH 49.26872,8.13159: Leicht rechts abbiegen auf Staatsstraße
* nur GH 49.22933,8.06848: Links halten auf K 54
* nur Valhalla 49.32235,8.13573: Links abbiegen.
* nur Valhalla 49.32206,8.13558: Links auf Weinstraße/L 512 abbiegen.
* nur Valhalla 49.24505,8.11498: Rechts abbiegen um auf Böchinger Straße/K 54 zu bleiben.
* nur Valhalla 49.24409,8.11181: Links auf Böchinger Straße/K 54 abbiegen. Dann weiter auf K 54.
* nur Valhalla 49.23748,8.09300: Rechts abbiegen um auf Hauptstraße/L 513 zu bleiben.

### Schwarzwaldhochstraße

* nur GH 48.68740,8.18554: Links abbiegen auf Hauptstraße
* nur Valhalla 48.75975,8.24006: Links abbiegen um auf Lichtentaler Straße zu bleiben.
* nur Valhalla 48.74801,8.20805: Links abbiegen um auf L 84a zu bleiben.
* nur Valhalla 48.70694,8.20702: Leicht nach rechts auf K 3753 abbiegen.
* nur Valhalla 48.70320,8.19365: Rechts auf Liehenbachstraße/K 3753 abbiegen.
* nur Valhalla 48.69015,8.18394: Links abbiegen um auf Hindenburgstraße zu bleiben.
* nur Valhalla 48.68024,8.19397: Links abbiegen um auf Kirchweg zu bleiben.
* nur Valhalla 48.66596,8.18337: Rechts auf Omerskopfstraße/K 3765 abbiegen. Dann weiter auf K 3765.

### Allgäu Oberjoch

* anders 47.55585,10.42541: GH "Leicht rechts abbiegen" / Valhalla "Links abbiegen."
* nur GH 47.50821,10.32198: Links halten
* nur GH 47.50416,10.28150: Links abbiegen auf Altstädter Straße
* nur Valhalla 47.51698,10.40789: Leicht nach rechts auf B 308 abbiegen.
* nur Valhalla 47.51087,10.39442: Rechts auf Jochstraße/B 308 abbiegen.
* nur Valhalla 47.50581,10.38675: Rechts auf Jochstraße/B 308 abbiegen. Dann weiter auf B 308.
* nur Valhalla 47.50432,10.35376: Links auf An der Lexenmühle abbiegen.
* nur Valhalla 47.50386,10.35228: Links auf Hauptstraße abbiegen.
* nur Valhalla 47.50354,10.34506: Rechts abbiegen.
* nur Valhalla 47.50363,10.33950: Leicht nach rechts abbiegen.
* nur Valhalla 47.50388,10.33859: Links abbiegen.
* nur Valhalla 47.50643,10.32564: Leicht nach links abbiegen.
* nur Valhalla 47.51436,10.28750: Leicht nach rechts auf Richard-Wagner-Straße abbiegen.
* nur Valhalla 47.51232,10.28122: Links auf Marktstraße abbiegen.

### Timmelsjoch

* nur Valhalla 46.83619,11.16820: Links auf Timmelsjochstraße/Via Passo del Rombo/SS44bis abbiegen.
* nur Valhalla 46.83304,11.16680: Links abbiegen um auf Timmelsjochstraße/Via Passo del Rombo/SS44bis zu bleiben.
* nur Valhalla 46.83037,11.16897: Rechts abbiegen um auf Mooser Straße/Via Moso/LS/SP114 zu bleiben.
* nur Valhalla 46.83147,11.16727: Links auf Via Moso/Mooser Straße /Mooser Straße/LS/SP114 abbiegen. Dann weiter auf Via Moso/Mooser Straße/LS/SP114.

### Stilfser Joch

* anders 46.52884,10.45272: GH "Links abbiegen auf Strada Statale 38 dello Stelvio" / Valhalla "Rechts abbiegen."
* nur Valhalla 46.52908,10.45195: Rechts abbiegen.
* nur Valhalla 46.52928,10.45230: Links auf Strada Statale 38 dello Stelvio/SS38 abbiegen.
* nur Valhalla 46.51545,10.40808: Scharf nach rechts auf Strada Statale 38 dello Stelvio/SS38 abbiegen. Dann weiter auf SS38.
* nur Valhalla 46.47633,10.36855: Rechts auf Strada Statale 38 dello Stelvio/SS38 abbiegen.
* nur Valhalla 46.47290,10.36594: Links auf Via Stelvio/SS38 abbiegen.

### Furka und Grimsel

* nur GH 46.63358,8.59427: Links halten auf Missionsweg
* nur Valhalla 46.59880,8.50341: Leicht nach rechts abbiegen.
* nur Valhalla 46.58987,8.48570: Links abbiegen um auf Furkastrasse/19 zu bleiben.
* nur Valhalla 46.57692,8.38825: Links abbiegen um auf Furkastrasse/19 zu bleiben.
* nur Valhalla 46.57691,8.38812: Links abbiegen um auf Furkastrasse/19 zu bleiben.

### Gardasee Westufer

* anders 45.63126,10.57948: GH "Leicht rechts abbiegen auf Via Belvedere" / Valhalla "Links abbiegen um auf Via Belvedere zu bleiben."
* nur GH 45.62752,10.58443: Links abbiegen
* nur GH 45.64845,10.61531: Rechts halten auf Via Pulciano Gaino
* nur GH 45.64884,10.61753: Links halten auf Via Pulciano Gaino
* nur GH 45.64896,10.61850: Rechts halten auf Via Pulciana Cecina
* nur GH 45.66672,10.64533: Leicht rechts abbiegen auf Via Golf
* nur GH 45.67118,10.64776: Leicht links abbiegen auf Via per Villavetro
* nur GH 45.78951,10.75092: Leicht links abbiegen auf SP38
* nur GH 45.88703,10.83792: Rechts abbiegen auf Via Bastione
* nur GH 45.88711,10.83896: Rechts abbiegen auf Via al Bastione
* nur GH 45.88849,10.83967: Rechts halten auf Viale Giovanni Prati
* nur GH 45.88862,10.83989: Leicht rechts abbiegen auf Viale Guiseppe Canella
* nur GH 45.88908,10.84301: Im Kreisverkehr Ausfahrt 2 auf Viale Baruffaldi nehmen
* nur GH 45.88806,10.84431: Rechts halten auf Viale Madruzzo
* nur GH 45.88802,10.84416: Scharf links abbiegen auf Viale Martiri XXVIII Giugno
* nur GH 45.88636,10.84364: Rechts halten auf Viale Dante Alighieri
* nur GH 45.88635,10.84319: Rechts abbiegen auf Viale Dante Alighieri
* nur Valhalla 45.62940,10.56660: Leicht nach links abbiegen um auf Via Panoramica zu bleiben.
* nur Valhalla 45.64361,10.60913: Links abbiegen um auf Via Pulciano Gaino zu bleiben.
* nur Valhalla 45.65860,10.63302: Leicht nach rechts auf Via Golf abbiegen.
* nur Valhalla 45.66887,10.64553: Rechts abbiegen.
* nur Valhalla 45.73842,10.72204: Rechts auf Via Europa/SP38 abbiegen. Dann weiter auf SP38.
* nur Valhalla 45.78885,10.73725: Links halten auf Via Della Pertica.
* nur Valhalla 45.78130,10.76729: Links auf Via Alessandro Volta/SP115 abbiegen.
* nur Valhalla 45.78208,10.76978: Leicht nach links auf Via Alessandro Volta/SP115 abbiegen. Dann weiter auf SP115.
* nur Valhalla 45.79629,10.77951: Rechts auf Via Alessandro Volta/SP115 abbiegen. Dann weiter auf SP115.
* nur Valhalla 45.81878,10.79672: Links abbiegen.
* nur Valhalla 45.82067,10.80034: Leicht nach links abbiegen um auf Via Nova zu bleiben.

### Kreisverkehre Elsass

* nur GH 48.57219,7.74955: Rechts halten auf Rue de la Corderie
* nur GH 48.57191,7.74740: Links abbiegen auf Rue de la Corderie
* nur GH 48.56478,7.70630: Rechts abbiegen auf Route de Schirmeck
* nur Valhalla 48.57030,7.73758: Leicht nach rechts auf Rue de la Montagne Verte abbiegen.
* nur Valhalla 48.57205,7.72456: Auf Rue de la Montagne Verte links halten.
* nur Valhalla 48.53151,7.63463: Rechts abbiegen um auf Route de Strasbourg/M 392 zu bleiben.
* nur Valhalla 48.39821,7.49916: Rechts auf Rue Principale/D 215 abbiegen.
* nur Valhalla 48.39738,7.49284: Leicht nach rechts auf Route de Barr/D 62 abbiegen. Dann weiter auf D 62.

### Slowenien Vršič

* nur GH 46.48347,13.78359: Leicht rechts abbiegen auf Podbreg
* nur Valhalla 46.48437,13.78353: Leicht nach rechts auf Ulica dr. Josipa Tičarja abbiegen.
* nur Valhalla 46.40496,13.74298: Rechts auf Trenta/206 abbiegen.
* nur Valhalla 46.40591,13.73928: Links auf Trenta/206 abbiegen. Dann weiter auf 206.
* nur Valhalla 46.38243,13.75817: Scharf nach rechts auf Trenta/206 abbiegen. Dann weiter auf 206.
