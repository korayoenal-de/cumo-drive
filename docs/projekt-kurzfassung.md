# CUMO DRIVE Kurzfassung für den Projektkontext

Stand: 10. November 2026, 18:00. Ausführlich: Cumo Drive Dokumentation (https://claude.ai/artifact/HZQ5kKYHxZWA8tMbfddJyF, im Repo docs/dokumentation.md) und Cumo Drive Code (https://claude.ai/artifact/PsxCmzdf1MkH323DESsyjx). Bei Widersprüchen gilt die Dokumentation vor kontext.md und todos.md.

## Produkt
* Navigations App für Sportwagenfahrer ("calimoto für Autos") mit Gruppenfahrt und Funk. Ziel Monetarisierung und die schönste, einfachste App ihrer Art. Koray steuert, gestaltet, testet; Claude programmiert und betreibt.
* Tabs: Planen (Tour planen, Rundtour), Touren (Gespeichert, Gefahren), Community (Routen, Ausfahrten, Drivers), Einstellungen (Profilkarte, Gruppen, Unterseiten).
* Profil nur Kurvig, Schnell je Etappe; Fahrspaß 0 bis 100; Pegel S3; Sperrungen aus TomTom werden umplant.
* Navigation mit 42 Symbolen, Highlight Ansagen, Tempo und Bremshinweis, Zoom bei Tempo und mit zwei Fingern, Weg zur Tour um Orte herum; CarPlay in Entwicklung.
* Gruppenfahrt: Live Positionen, Kurznachrichten, Halt der Lead als Pille oben rechts, Funk über LiveKit (ab Build 20). Push bei Nachrichten (ab Build 19).
* Nach der Fahrt: Statistik und Bewertung mit fünf Sternen.

## Technik
* Expo SDK 58, React Native 0.88, Expo Router, Reanimated, react-native-maps; Web Planer aus demselben Code (MapLibre).
* Supabase Frankfurt (onfxnfkhajxvjmmvmzda), Edge Functions pass-status, road-closures, notify, livekit-token.
* Eigener GraphHopper 11 auf Contabo mit Ortsdichte, Ersatz Valhalla.
* Daten: 486 Strecken, 370 Pässe, 94 Fahrregionen.
* Builds 16, 19 und 20 in TestFlight, Runtime 1.1.0, OTA Kanal preview.

## Regeln
* CarPlay bei jeder Änderung an Karte und Navigation mitdenken.
* OTA und Builds nur nach Korays OK; OTA aus einem sauberen Arbeitsstand ohne .env.
* Keine Schlüssel committen, Passwörter, Secrets und Bestellungen macht Koray, kein git reset --hard.
* Texte in Du Form ohne Gedankenstriche; calimoto nie in App, Web und Landingpage.

## Offen
* Koray: Funk zu zweit testen, Screenshots und Web Upload, DNS, RevenueCat und Apple Bezahlvertrag, Anwalt, echte Fahrzeiten, Gründungstester Liste.
* Claude: Lead Blatt nach Prototyp, Build 21 (CarPlay Zoom, Profilfoto), Vermeiden als Einstellung, Impressum, Melden und Blockieren, Lernen Stufe 2, Haptik.
