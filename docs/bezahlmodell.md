# Bezahlmodell

Stand 16. November 2026, Entscheidungen von Koray. Gilt für App, Web Planer und Landingpage.

## Phasen je Konto

Ein Wert steuert alles: der Release Tag (`public.app_launch.release_at`). Jedes Konto bekommt genau eine freie Phase, gemessen am Anlegen des Kontos.

| Konto angelegt | Phase | Alles frei bis |
| --- | --- | --- |
| vor dem Release Tag | Gründungstester | Release plus 12 Monate |
| in den ersten 30 Tagen ab Release | Start | Release plus 30 Tage, fester Stichtag für alle |
| danach | Testphase | Anlegen plus 14 Tage |

Nach den 30 Tagen gibt es keine weiteren 14 Tage. Die Testphase läuft bei uns im Backend, nicht als Apple Testphase, weil Apple nicht weiß, wer die 30 Tage schon hatte. Vor dem Release Tag ist für alle alles frei, und die Grenzen der kostenlosen Version schlafen. Ab dem Release Tag gelten sie ohne App Update (der Schalter kommt vom Server).

## Nach der freien Phase

Wer keinen Plan kauft, fällt auf die kostenlose Version, gesperrt wird niemand:

* Planen überall, Fahren nur im Heimatgebiet (Kreis von 150 km, einmal änderbar)
* Gruppenfahrt mit 3 Fahrern insgesamt, im Heimatgebiet, ohne Walkie Talkie
* Funk für die ganze Gruppe, wenn der Organisator ein Abo hat
* Ausfahrten: Teilnahme für 3 Personen insgesamt, anlegen nur mit Abo

## Pläne im App Store

| Plan | Preis | Art |
| --- | --- | --- |
| Jahr | 59,99 € | Abo, verlängert sich |
| Monat | 14,99 € | Abo, verlängert sich |
| Woche | 7,99 € | Abo, verlängert sich |
| Saison Pass | 49 € | 6 Monate, verlängert sich nicht |

Der Saison Pass ist bewusst fair. Dass das Jahresabo dadurch weniger attraktiv wird, nehmen wir in Kauf (Koray 16.11.). Private Gruppen mit Abo bis 6 Fahrzeuge. Keine Apple Testphase an den Produkten.

## Club und Business Account

Auf Anfrage, individuelle Preise, Rechnung außerhalb des App Stores. Freischaltung im Backend (Tabelle `clubs`, Quelle `club`). Nicht in RevenueCat. In der App steht dafür kein Preis und kein Kaufknopf, nur „auf Anfrage“ mit Kontakt (Apple Regel 3.1.3(c)).

## RevenueCat

* Entitlement `pro`
* Produkte in einer Abo Gruppe „CUMO DRIVE“: `de.rallycumo.drive.jahr`, `de.rallycumo.drive.monat`, `de.rallycumo.drive.woche`, dazu `de.rallycumo.drive.saison` als Abo ohne Verlängerung
* Offering `default` mit den vier Paketen
* App User ID ist die Supabase Konto ID
* Ein Webhook von RevenueCat setzt in Supabase `profiles.plan` und `plan_until`. `my_entitlement` bleibt die eine Wahrheit für App, Web Planer, Club und freie Phasen
* Das Kauf SDK ist nativ, es braucht einen TestFlight Build

## Am Release Tag

Eine kleine Migration nach Korays OK: `update public.app_launch set release_at = '<Tag> 00:00+01';`
