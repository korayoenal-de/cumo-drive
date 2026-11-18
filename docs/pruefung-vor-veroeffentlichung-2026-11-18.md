# Prüfung vor der Veröffentlichung, 18.11.2026

Stand des Codes: nach dem OTA Update von 11:10 plus Aufräumen (dieser Commit). Geprüft in der Cloud Sitzung, nicht am Gerät.

## Regression und Kernfunktionen

* **Testlauf vor dem Update** (Typen, Lint, 64 lib Tests, Textscan, QS Korpus, Stresstest, Simulation der Pflicht Abläufe, feste Routen, Bedienfolgen): grün, heute elfmal gelaufen.
* **Routen Check komplett:** 51 Routen (30 feste, 21 wechselnde), 32 ohne Befund, 19 mit Hinweis, 0 Fehler. Planung im Schnitt 3 s, längste 23 s (Rundtour Linthal mit Rückfrage). Die Hinweise sind die bekannten Arten: Ortsanteil über 30 %, kleine Schleifen, Runde trifft die Wunschlänge nicht und die App fragt nach.
* **Bedienfolgen erweitert:** 3 Durchläufe mit je 10 Folgen und 8 Schritten (Punkte einfügen, entfernen, tauschen, Profil je Etappe): 0 Fehler. Hinweise: Nach Einfügen und Entfernen weicht die Route in einzelnen Fällen von der vorherigen ab, weil die vorherige aus einer Teilplanung kam. Auffällig bleibt R3: Teilplanung und ganze Planung liegen in zwei Fällen 28 und 43 km auseinander (Seed 23, Folge 5 und 4). Das ist kein Absturz, aber dieselben Punkte können je nach Vorgeschichte verschiedene Touren ergeben.
* **Stresstest** dreimal: 0 Fehler, GPX hin und zurück 116 bis 148 ms (Budget 1500), Passvorschläge für 25 Etappen 52 bis 55 ms.

## Stabilität

* **Rauchtest im Browser:** Web Build erzeugt und 24 Seiten ohne Anmeldung geladen (Start, Touren, Community, Einstellungen, Anmeldung, Registrierung, AGB, Datenschutz, Mitgliedschaft, Garage, Profil, Feedback, Gruppenfahrt, Nachrichten, Scan, Karte, Fahren, Blockiert, Englisch, Italienisch, Ausfahrt anlegen): keine Laufzeitfehler. Das deckt die Web Fassungen ab, nicht die nativen Karten und nicht angemeldete Zustände.
* **Fehlerberichte:** JavaScript Fehler und Abstürze gehen an `app_errors`. Unbehandelte abgelehnte Promises werden nicht gemeldet (255 Aufrufe mit `void`), das ist eine Lücke in der Sicht, kein Absturzrisiko.
* **Offen:** Der Absturz „Da ist etwas schiefgelaufen“ vom 18.11. gegen 10:38 ist nicht aufgeklärt. Der Bericht liegt in `app_errors`, lesbar nur für Admins.

## Leistung

* **App Paket iOS:** 13,2 MB Bytecode, 82 Bilder mit 5,6 MB. Die Streckendaten liegen nur einmal im Paket (verschleiert), die Rohdaten nicht.
* **Kartenblatt:** JavaScript wird beim Scrollen nur noch alle 8 pt gerufen, die Tab Leiste startet keine Feder mehr je Scroll Schritt.
* **Touren:** Die fünf Blätter je Tourkarte entstehen erst beim ersten Öffnen. Die Liste selbst ist weiter nicht virtualisiert, bei sehr vielen Touren der nächste Hebel.

## Aufgeräumt

* 107 ungenutzte Stile, 27 ungenutzte Exporte und der dadurch tote Code entfernt, zusammen rund 660 Zeilen (unter anderem der alte Bewertungsregler, die alte Mitgliedschaftskarte, alte Logo Spinner). Geprüft mit Typen, Lint und Tests.
* Die Prüfskripte laden die Node Typen jetzt ausdrücklich (`qa/node-types.d.ts`), vorher kamen sie zufällig über einen Import der App.
* Design System Artefakt: README, Button, Toast und Ebene auf dem Stand vom 18.11. Die Vorschaubilder von Button und Toast zeigen noch die alte Form.

## Nicht geprüft

* **Lasttest gegen Routing Server und Supabase:** nicht gelaufen, wartet auf Korays Entscheidung (trifft die echten Server und die Tester).
* **Am Gerät:** alles, was Karte, Navigation, CarPlay, Funk, Haptik und Käufe betrifft.
* **Mit Anmeldung:** Community, Kontakte, Chat und Ausfahrten laufen nur in der Simulation gegen eine lokale Datenbank, nicht gegen das echte Konto.
