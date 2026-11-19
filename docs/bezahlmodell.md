# Bezahlmodell

Stand 19. November 2026, Entscheidungen von Koray. Gilt für App, Web Planer und Landingpage.

## Phasen je Konto

Ein Wert steuert alles: der Release Tag (`public.app_launch.release_at`), gemessen am Anlegen des Kontos.

| Konto angelegt | Quelle | Stand |
| --- | --- | --- |
| solange kein Release Tag eingetragen ist | vorstart | alles frei |
| vor dem Release Tag | gruender | Gründungstester, alles frei bis Release plus 12 Monate |
| ab dem Release Tag | kostenlos | gleich die kostenlose Version, mehr nur mit Plan |

Entschieden am 17.11.: keine Startphase von 30 Tagen, keine Testphase von 14 Tagen, kein Apple Gratismonat. Der kostenlose Plan reicht. Damit gibt es auch nichts, was man mit neuen E-Mail Adressen immer wieder freischalten könnte.

Achtung: Gründungstester ist, wer vor dem Release Tag ein Konto anlegt. Solange die App nur über TestFlight läuft, sind das die eingeladenen Tester. Wer sich vorher im Web Planer registriert, zählt ebenfalls dazu.

## Kostenlose Version

Ab dem Release Tag, ohne App Update (der Schalter `limits_live()` kommt vom Server):

* Planen überall, Fahren nur im Heimatgebiet (Kreis von 120 km um den Heimatort, einmal änderbar)
* Gruppenfahrt mit 3 Fahrern insgesamt, im Heimatgebiet, ohne Walkie Talkie
* Funk für die ganze Gruppe, wenn der Organisator ein Abo hat
* Ausfahrten: Teilnahme für 3 Personen insgesamt, anlegen nur mit Abo

Entschieden am 19.11.: 120 km statt 150 km, damit die kostenlose Version nicht zu viel abdeckt. Der Radius steht auf dem Server (`entitlement_for`, Migration `20261119150000_heimatgebiet_120.sql`), die App übernimmt ihn von dort. Genannt wird er in der Bezahlschranke, in den Einstellungen, auf der Landingpage und in den Nutzungsbedingungen (Abschnitt 5).

Die Paywall erscheint im Flow, dort wo eine Grenze greift (Losfahren außerhalb, viertes Auto, Funk, Heimatgebiet ändern, Ausfahrt nach Ablauf). Gründungstester sehen am letzten Tag ihrer 12 Monate einmal den Rückblick mit eigenem Gebrauch.

## Pläne im App Store

| Plan | Preis | Art |
| --- | --- | --- |
| Jahr | 59,99 € | Abo, verlängert sich |
| Monat | 14,99 € | Abo, verlängert sich |
| Woche | 7,99 € | Abo, verlängert sich |
| Saison Pass | 49 € | 6 Monate, verlängert sich nicht |

Kein Einführungsangebot an den Produkten (am 17.11. kurz angelegt und wieder gelöscht). Private Gruppen mit Abo bis 6 Fahrzeuge. Erinnerung lokal auf dem Gerät: Jahr 7 Tage vor der Verlängerung, Saison Pass 3 Tage vor dem Ende. Nach dem Ende bleiben die Touren im Konto.

## Club und Business Account

Auf Anfrage, individuelle Preise, Rechnung außerhalb des App Stores. Freischaltung im Backend (Tabelle `clubs`, Quelle `club`). Nicht in RevenueCat. In der App steht dafür kein Preis und kein Kaufknopf, nur „auf Anfrage“ mit Kontakt (Apple Regel 3.1.3(c)).

## Einrichtung (Stand 17.11.)

Apple (App Store Connect, App 6830681049):
* Vertrag für gebührenpflichtige Apps, Bankkonto (Revolut) und Steuerformulare sind eingereicht, Apple prüft
* EU Händlerstatus (DSA): Händler, Kontakt kontakt@cumodrive.com
* Abo Gruppe „CUMO DRIVE“ (ID 22589084), Anzeigename DE „CUMO DRIVE Mitgliedschaft“, EN „CUMO DRIVE Membership“, IT „CUMO DRIVE Abbonamento“
* Abos in der Gruppe, Stufe 1 bis 3: `de.rallycumo.drive.jahr` (ID 6835902574), `de.rallycumo.drive.monat` (ID 6835904055), `de.rallycumo.drive.woche` (ID 6835905204), alle 175 Länder, Basis Deutschland, Namen und Beschreibung DE, EN, IT
* Abo ohne Verlängerung `de.rallycumo.drive.saison` (49,00 €, alle Länder, DE, EN, IT)
* Offen: Prüf Screenshot je Produkt (Paywall aus Build 35), dann mit der nächsten App Version zur Prüfung einreichen
* In App Purchase Key liegt bei RevenueCat

RevenueCat (Projekt „CUMO DRIVE“, App „CUMO DRIVE iOS“, Bundle ID de.rallycumo.drive):
* Entitlement `pro` mit Jahr, Monat und Woche; der Saison Pass hängt bewusst nicht an `pro`, die 6 Monate rechnet unser Webhook (`plan_until` = Kauf plus 183 Tage)
* Offering `default` mit `$rc_annual`, `$rc_monthly`, `$rc_weekly`, `$rc_six_month`
* App User ID ist die Supabase Konto ID
* Edge Function `revenuecat-webhook` setzt `profiles.plan` und `plan_until`. `my_entitlement` bleibt die eine Wahrheit

## Code

* Zweig `free-plan` (17.11.): kostenlose Version und Gründungstester aus `start-und-abo` mit main zusammengeführt, ohne Start und Testphase. Migrationen `20261117180000_kostenlos_heimatgebiet.sql` und `20261117180100_start_und_testphase.sql`.
* 19.11.: Heimatgebiet 120 km, Migration `20261119150000_heimatgebiet_120.sql`.

## Am Release Tag

Eine kleine Migration nach Korays OK: `update public.app_launch set release_at = '<Tag> 00:00+01';`
