# Funk (Walkie Talkie) für die Gruppenfahrt

Stand: 10. November 2026. Design entschieden (Koray 10.11.), Funk gebaut und ab Build 20 aktiv; Lead Blatt und Abstimmung mit den Ansagen folgen per Update.
Design Leinwand: "Funk in der Gruppenfahrt" (Claude Design) mit "Prototyp Lead".

## Design

### Grundprinzip
* Funk und Halt sind zwei getrennte Funktionen. Funk ist Sprache und kann stumm sein. Halt ist eine Anweisung an alle und kommt immer an (Feld und Ansage), auch wenn jemand den Funk stumm hat.
* Funk: runder oranger Knopf rechts in der Leiste, Beschriftung "Funk". Gedrückt halten spricht, loslassen beendet.
* Immer nur einer spricht, wer zuerst drückt. Wer währenddessen drückt, sieht "Warten" und ist danach dran; die Lead vor allen anderen.
* Funk und Navigationsansage nie gleichzeitig: Funk geht vor, die Ansage folgt danach. Ausnahme: Abbiegung unter 200 m (noch nicht gebaut).

### Zustände
* Bereit: Leiste mit Ankunft, Ansagen, Menü, Funk.
* Du sprichst: Banner oben orange "Du sprichst".
* Ein anderer spricht: Banner mit Name; eigener Knopf "Warten".
* Funk getrennt: Banner gelb, verbindet von selbst neu.

### Lead
* Halt: helle Pille "Halt" oben rechts unter der Abbiegekarte (gebaut). Gründe fächern nach unten auf: Sammeln, Parkplatz, Tanken, Pause, Fotostopp. Ein Tipp sendet.
* Menü als Bottom Sheet (Prototyp, noch nicht gebaut): Kopf mit Ankunft und Funk Knopf; Status nur lesen (Kreise mit Abstand, wer zurückfällt gelb vorne); Aktionen für alle als Kacheln (Zwischenziel überspringen, Tour pausieren); Schalter (Nur die Lead spricht, Ansagen); Seltenes als Textzeilen (Planung ansehen, Lead übergeben).
* Kein "Tour für alle beenden" in der Navigation (Koray 10.11.). "Auf alle warten" entfällt, dafür Halt Grund "Sammeln".
* Heute schon im Menü: Kurznachricht, Funk stumm, Nur die Lead spricht.

### Teilnehmer
* Gleiche Leiste. Menü: Planung ansehen, Kurznachricht an die Gruppe, Funk hören an oder aus, Gruppe verlassen.
* Gruppen Bedienung erscheint nur, wenn wirklich jemand mitfährt.

### Offen
* Funk nur in der Gruppenfahrt oder auch Club Kanal
* Sperrbildschirm: Sprechen über die Lautstärketaste prüfen
* CarPlay: Antippen statt Halten; Lenkradtaste (nicht jedes Auto meldet sie)
* Funkloch: kurze Nachrichten nachliefern?
* Darf die Lead andere unterbrechen?

## Technik (gebaut 10.11.)

* LiveKit Cloud, Projekt CUMO DRIVE in Frankfurt, Agent Observability aus. Secrets LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in Supabase.
* Edge Function livekit-token: prüft die Anmeldung und die Mitgliedschaft (is_ride_member) und gibt ein Token für den Raum ride-<rideId> (8 Stunden).
* App: app/src/lib/group/funk.ts mit @livekit/react-native und livekit-client. Lädt nur, wenn das native WebRTC Modul da ist (ab Build 20); ältere Builds bekommen dieselben Updates ohne Funk. Mikrofon an nur beim Drücken, Sprecher über ActiveSpeakers, "Nur die Lead spricht" als Datennachricht.
* Nur Gruppenfahrten mit ID (Einladung), nicht die alten Fahrtcodes aus dem Web Planer.
* Keine Aufzeichnung. Datenschutzerklärung ergänzt (LiveKit als Empfänger).

## Kosten (LiveKit Cloud, Preisseite 10.11.2026)

| Plan | Preis | Inklusive | Danach |
|---|---|---|---|
| Build | 0 $ | 5.000 WebRTC Minuten im Monat, 100 gleichzeitig | |
| Ship | ab 50 $ im Monat | 150.000 Minuten | 0,0005 $ je Minute |
| Scale | ab 500 $ im Monat | 1,5 Mio. Minuten | 0,0004 $ je Minute |

8 Autos, 3 Stunden = 1.440 Minuten. Kostenlos reichen etwa 3 Touren im Monat, Ship etwa 100. Sparen ließe sich mit Verbinden nur beim Sprechen (erstes Wort etwa 1 s später); vorerst immer verbunden.
