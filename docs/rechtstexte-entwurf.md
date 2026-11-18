# Rechtstexte Cumo Drive

Stand: 18. November 2026. Fassung zum Start, von Claude nach bestem Wissen fertiggestellt (Koray 18.11.: kein Anwalt, bis es Einnahmen gibt). Keine Rechtsberatung. Der Wortlaut steht nur noch an einer Stelle: `app/src/content/legal.ts` (Deutsch, maßgeblich), `legal-en.ts` und `legal-it.ts`. Die Fassung `2026-11-18` wird bei der Registrierung als Nachweis gespeichert.

## Was am 18.11. fertiggestellt wurde

* Der Hinweis „Entwurf, anwaltliche Prüfung steht aus“ ist aus App und Web entfernt.
* **Widerruf:** Apple ist Verkäufer der Abos. Widerruf und Erstattung laufen über Apple (reportaproblem.apple.com). Vorher stand dort eine unklare Formulierung zum Erlöschen des Widerrufsrechts.
* **Änderung der Bedingungen:** keine stille Zustimmung nach sechs Wochen mehr. Solche Klauseln hat der BGH 2021 bei Banken gekippt. Jetzt: unkritische Änderungen gelten ab Veröffentlichung, wesentliche erst mit Zustimmung.
* **Mindestalter 16** für ein Konto (Alter für eine wirksame Einwilligung nach DSGVO in Deutschland; deckt Österreich, Italien und Frankreich mit ab).
* **Fehlerberichte** stehen in der Datenschutzerklärung (Daten, Zweck, Speicherdauer 12 Monate).
* **Supabase** ist mit dem richtigen Vertragspartner genannt (Supabase Pte. Ltd., Singapur) und mit allen Daten, die dort liegen.
* Geprüft: Alle Dienste, die Daten bekommen, sind genannt (Supabase, Contabo, Apple, Expo, LiveKit, RevenueCat, TomTom, als Notfall komoot und FOSSGIS).

## Annahmen, auf denen die Texte beruhen

* Anbieter und Verantwortlicher: CUMO DRIVERS CLUB, vertreten durch Koray Önal, behandelt wie ein Einzelunternehmen. Die Anschrift steht im eigenen Impressum (cumodrive.de/impressum).
* Kein Datenschutzbeauftragter nötig (weniger als 20 Personen mit Datenverarbeitung). Aufsichtsbehörde Hessen.
* Auswertung von Bewertungen, Spuren und Nutzung der Planung: zusammengefasst und ohne Personenbezug, auf Grundlage des berechtigten Interesses mit Widerspruchsrecht. Start und Ziel werden um 2 km gekürzt, ein Abschnitt zählt erst ab drei Fahrern.
* Keine Teilnahme an der Verbraucherschlichtung. Die Plattform der EU zur Online Streitbeilegung gibt es seit Juli 2025 nicht mehr, ein Link darauf ist nicht mehr nötig.
* Server Protokolle höchstens 14 Tage (bei Contabo und Supabase so eingestellt halten).

## Noch zu tun (Koray)

* **Impressum:** CUMO DRIVE hat seit dem 18.11. ein eigenes Impressum unter cumodrive.de/impressum und in der App (Einstellungen), in drei Sprachen. Ohne Telefonnummer; zweiter Kontaktweg ist das Feedback in der App. Das Impressum von rallycumo.de gehört nur noch zum Club (dort steht noch „§ 5 TMG“ statt DDG, kein Thema für die App).
* **Verträge zur Auftragsverarbeitung:** siehe `docs/auftragsverarbeitung.md`. Die Datenschutzerklärung sagt, dass diese Verträge bestehen. Contabo muss dafür vor dem Start abgeschlossen sein.
* **Web:** Die geänderten Texte kommen erst mit dem nächsten Web Paket auf cumodrive.de.

## Bleibt ein Risiko, bis ein Anwalt draufgesehen hat

* Privatanschrift als ladungsfähige Anschrift im Impressum (rechtlich in Ordnung, aber öffentlich sichtbar).
* Haftungsklausel und Datenbankschutz sind übliche Formulierungen, nicht auf den Einzelfall geprüft.
* Berechtigtes Interesse statt Einwilligung für die Auswertung der Fahrten.
* Expo: ob der Abschnitt in den Nutzungsbedingungen als Vertrag nach Art. 28 reicht.
* Club Lizenzen (Geschäftskunden) sind nur in einem Satz geregelt und brauchen eigene Bedingungen, sobald es sie gibt.
