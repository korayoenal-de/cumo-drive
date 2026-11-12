# CUMO DRIVE Betrieb: Leistung, Sicherung, Verfügbarkeit

Stand: 12. November 2026. Geschrieben von Claude nach Korays Auftrag vom 12.11. (Unabhängigkeit, zweiter Server).
Messwerte stammen vom 12.11. und sind Momentaufnahmen.

## Aufbau

| Server | Adresse | Rolle |
|---|---|---|
| Server 1 (vmd211515) | 13.140.213.164, https://13-140-213-164.sslip.io | Routing (GraphHopper 11), POI Kacheln; Neuaufbau So 3 Uhr |
| Server 2 (vmd212412) | 13.140.213.114, https://13-140-213-114.sslip.io | Routing, POI Kacheln, Ortssuche (Photon Europa, unter /photon); Neuaufbau Mo 3 Uhr |

Beide: Contabo Cloud VPS 12 (12 Kerne, 48 GB, 400 GB SSD), Ubuntu 24.04, Caddy davor (TLS, HTTP/2 und HTTP/3), Ordner /opt/cumo-routing.
Skripte im Repo unter routing/server/cloud: setup-server.sh (Neuaufbau), betrieb.sh (Sicherung, Überwachung, Absicherung), harden.sh (Wächter).
Konten, Touren und Nachrichten liegen in Supabase (Frankfurt), der Funk bei LiveKit, Sperrungen kommen von TomTom.

## 1. Leistung für den einzelnen Nutzer

Gemessen:

* Rechenzeit einer typischen Änderung (Etappe 10 bis 130 km, echte Anfrage der App mit Traumstrecken Bereich): 0,05 bis 0,2 s auf dem Server.
* Rechenzeit ganzer Routen: 50 km 0,2 bis 0,9 s, 140 km 0,5 bis 0,8 s, 550 km kurvig 4 bis 6 s.
* Verbindung vom Mac: 0,07 bis 0,11 s je Anfrage über HTTP/2.
* Ein verschobener Punkt löst je nach Fall 2 bis 6 Anfragen nacheinander aus (kurvig, Vergleich mit dem direkten Weg, Nachbessern bei Stichstraßen).
* Ortsnamen beim Öffnen einer Tour: 7 Abfragen an das öffentliche Photon mit 1 bis 3 s je Abfrage.

Folgerung: Nicht die Rechenzeit bremst, sondern die Zahl der Anfragen nacheinander und fremde Dienste.

Umgesetzt (12.11.):

* Eigene Ortssuche auf beiden Servern (seit 12.11. abends auch Server 1). Die App fragt zuerst Server 2, dann Server 1 (je höchstens 4 s, gesperrt erst nach zwei Fristüberschreitungen in Folge), der öffentliche Dienst bleibt Notfall mit 7 s Frist (lib/photon.ts).
* Ortsnamen je Punkt werden gemerkt, statt mehrfach gefragt zu werden.
* Seit 11.11.: nur der geänderte Abschnitt wird neu geplant.

Offen, nach Wirkung sortiert:

1. Anfragen je Änderung senken: Vergleich und Nachbessern in einer Anfrage oder parallel, wo es geht.
2. Höhenprofil aus dem eigenen Server statt Valhalla /height (heute 0,4 bis 1,2 s und 30 KB hoch, 30 KB runter, unkomprimiert). Braucht Höhendaten im Import.
3. Lange Etappen im Profil Schnell mit dem schnellen Verfahren (Contraction Hierarchies) rechnen.
4. Traumstrecken Bereich fest auf dem Server (heute 68 KB je kurvige Anfrage, in der App komprimiert 17 KB, im Web unkomprimiert).

## 2. Leistung für viele Nutzer gleichzeitig

Gemessen auf Server 1 (140 km kurvig): 12 Anfragen gleichzeitig 0,6 s, 24 in 1,5 s, 48 in 5,4 s. Das sind etwa 10 Planungen je Sekunde je Server.

Schätzung (25 Anfragen je Planungssitzung von 10 Minuten): etwa 250 gleichzeitig Planende je Server, mit beiden 500; rund 2.800 Sitzungen je Stunde; das trägt grob 25.000 bis 30.000 aktive Nutzer, wenn jeder zehnte in der Spitzenstunde plant. Unsicherheit plus oder minus die Hälfte.

Umgesetzt: Jede Sitzung startet zufällig auf einem der beiden Server und bleibt dort; die Last teilt sich hälftig. Stopps sind fertige Dateien mit einem Tag Cache.

Reserve: ein dritter gleicher Server lässt sich ohne Änderung der Logik in die Liste aufnehmen (CUMO_ROUTING_SERVERS). Engpässe davor: TomTom Kontingent (20.000 Abrufe im Monat), Funk Minuten, sehr lange kurvige Touren.

## 3. Sicherung

| Was | Wo | Wie |
|---|---|---|
| Code, Profile, Skripte, kuratierte Daten | GitHub | jede Änderung committet und gepusht |
| Einstellungen, Skripte, Dienste der Server | jeweils der andere Server, /opt/backup/<name>/<Datum> | jede Nacht 2:10 Uhr, 14 Stände (backup.sh) |
| Graph, Kartendaten und POI Kacheln | auf beiden Servern | aus OpenStreetMap jederzeit neu baubar (Graph rund neun Stunden, siehe Neuaufbau, Kacheln 20 Minuten) |
| Konten, Touren, Nachrichten (Supabase) | Supabase | im Gratistarif KEINE Sicherung; Pro sichert täglich, 7 Tage |

Erste Sicherung in beide Richtungen am 12.11. von Hand geprüft. Offen: Supabase Pro vor echten Nutzern. Wiederherstellung einmal üben (Server aus der Sicherung neu aufsetzen).

## 4. Verfügbarkeit und Ausfälle

| Ausfall | Was passiert | Wer merkt es |
|---|---|---|
| Ein Routing Server antwortet nicht | App fragt automatisch den anderen (Prüfung /info, Wechsel auch mitten in der Planung) | Überwachung des Partners nach 3 Minuten |
| Neuaufbau (So und Mo 3 Uhr) | dauert rund neun Stunden (gemessen 8.11. auf Server 1: 3 Uhr bis nach 12 Uhr), das Routing dieses Servers ist solange aus; läuft nur, wenn der andere Server gesund ist, die App plant solange dort | Protokoll setup.log |
| Import scheitert | alter Graph läuft sofort weiter | Protokoll |
| Neuer Graph liefert keine Route | automatisch zurück zum alten Graph | Protokoll |
| GraphHopper hängt | Wächter startet nach drei Fehlversuchen neu | Protokoll |
| Beide Routing Server weg | App plant über Valhalla (weniger kurvig), kuratierte Strecken und Pässe sind in der App | Überwachung |
| Ortssuche (eigene) weg | öffentlicher Dienst als Notfall | Überwachung |
| POI Kacheln weg | Kacheln vom anderen Server; Empfehlungen (Restaurants) sind in der App | Überwachung |
| Supabase weg | Planen und Navigieren gehen weiter (Touren lokal), Community, Abgleich und Gruppe pausieren | Supabase Statusseite |
| LiveKit weg | Funk aus, Gruppenfahrt mit Live Positionen läuft weiter | Banner „Funk getrennt“ |
| TomTom weg oder Kontingent leer | keine aktuellen Sperrungen, Planung läuft | Protokoll der Edge Function |
| sslip.io weg | BEIDE Server nicht erreichbar, weil ihre Namen daran hängen | siehe Schwachstellen |

### Dauer des Neuaufbaus (korrigiert 12.11.)

Die frühere Angabe „etwa eine Stunde“ war falsch. Gemessen am Protokoll vom 8.11. (Server 1, altes Gebiet): Einlesen und Ortsdichte gut eine Stunde, danach die Landmarken für vier Profile nacheinander mit je etwa 70 Minuten, zusammen fast fünf Stunden, dann POI Kacheln. Insgesamt rund neun Stunden. Mit nur einem Server war das eigene Routing sonntags den ganzen Vormittag aus. Offen: Landmarken gleichzeitig rechnen (prepare.lm.threads), erwartet drei bis vier Stunden, erst nach Messung als Zahl übernehmen.

Überwachung (monitor.sh, jede Minute): eigener Dienst, Partner, POI des Partners, Ortssuche, Platte ab 85 Prozent. Zustandswechsel stehen in setup.log. Mit einer Adresse in /etc/cumo-notify (Webhook, zum Beispiel ntfy) geht zusätzlich eine Nachricht aufs Handy.

Schwachstellen, die bleiben:

1. **Namen über sslip.io:** ein fremder Gratisdienst für die Namensauflösung beider Server. Lösung: eigene Namen (zum Beispiel r1 und r2 unter rallycumo.de oder cumodrive.de), sslip bleibt als Notfall in der Liste. Braucht zwei DNS Einträge von Koray.
2. **Ein Anbieter, eine Region:** beide Server stehen bei Contabo in der EU. Fällt Contabo ganz aus, bleibt Valhalla als Notfall. Später: dritter Server bei einem anderen Anbieter.
3. **Keine Nachricht aufs Handy,** solange /etc/cumo-notify leer ist.
4. **Routing ist offen:** jeder, der die Adresse kennt, kann Routen abfragen. Heute unkritisch, später Drosselung je Adresse im Webserver.

## 5. Effiziente Datennutzung

* Kuratierte Strecken, Pässe und Empfehlungen liegen in der App und brauchen kein Netz.
* Stopps: fertige Kacheln (0,1 Grad) vom eigenen Server, einen Tag im Cache.
* Sperrungen: je 1 Grad Kachel, zwei Stunden zwischengespeichert in Supabase.
* Nur der geänderte Abschnitt wird geplant; gleiche Anfragen werden kurz gemerkt (memo), Ortsnamen ebenso.
* Graph und Kartendaten: wöchentlich, nur geänderte Dateien werden geladen (curl -z).
* Protokolle werden wöchentlich rotiert (8 Wochen).

### Aktualität der Daten

| Daten | Quelle | Takt | Wie |
|---|---|---|---|
| Straßennetz (Graph) | OpenStreetMap Auszüge (Geofabrik) | wöchentlich, Server 1 So 3 Uhr, Server 2 Mo 3 Uhr | setup-server.sh, mit Rückweg zum alten Graph |
| Stopps (POI Kacheln) | OpenStreetMap | wöchentlich, im selben Lauf | poi-tiles.sh |
| Ortssuche (Photon Europa) | fertiger Wochenstand von GraphHopper, gebaut aus OpenStreetMap | Prüfung Server 2 Mi 4 Uhr, Server 1 Do 4 Uhr, geladen wird nur ein neuerer Stand | photon-update.sh: laden, tauschen, Probeabfrage, sonst alter Stand zurück |
| Sperrungen | TomTom | alle zwei Stunden je Kachel | Supabase Edge Function |
| Kuratierte Strecken, Pässe, Empfehlungen | eigene Daten | mit jedem OTA Update | in der App |

Die Ortssuche läuft seit 12.11. auf Server 2 und seit 12.11. 18:25 auch auf Server 1 (Daten von Server 2 kopiert, 46 GB, etwa 30 Minuten; Einrichtung /root/photon-einrichten.sh), Stand der Daten 10.11., Antwort 0,2 bis 0,7 s. Server 1 aktualisiert donnerstags, damit nie beide gleichzeitig tauschen. Während des Tauschs (etwa 20 Minuten) fragt die App den öffentlichen Dienst. Abhängigkeit: Der Wochenstand kommt von GraphHopper; fällt er weg, läuft der letzte Stand weiter und wir bauen ihn selbst aus OpenStreetMap (Nominatim Import, aufwendig).

## 6. Kosten im Monat (Stand der Preisseiten 12.11.)

| Posten | Kosten | Hinweis |
|---|---|---|
| Server 1 und 2 (Contabo VPS 12) | je 23,80 bis 29,75 € | je nach Laufzeit |
| Supabase | 0 $, mit Pro 25 $ | Pro vor echten Nutzern |
| LiveKit (Funk) | 0 $ bis 5.000 Minuten, sonst ab 50 $ | eine Ausfahrt mit vier Autos über drei Stunden: 720 Minuten |
| TomTom | nach Verbrauch | Kontingent 20.000 Abrufe gesetzt |
| Expo | Starter Plan | Builds und OTA |
| Ortssuche, Höhen, Stopps | 0 € | laufen auf den eigenen Servern |

Sparen ohne Risiko: Photon, POI und später Valhalla Ersatz laufen auf vorhandenen Servern mit; kein privates Netz, kein Auto Backup bei Contabo (ersetzt durch gegenseitige Sicherung); Satellit im Web verschoben.

## 7. Effiziente Datenübertragung

Gemessen: Antwort einer Route 97 bis 163 KB, komprimiert 42 KB; kurvige Anfrage 64 KB, komprimiert 17 KB.

* Antworten komprimiert (zstd und gzip), HTTP/2, auf Server 2 auch HTTP/3 (besser im Mobilnetz).
* Anfragen ab 2 KB sendet die App komprimiert; im Web noch nicht (der Server erlaubt den Kopf im Browser nicht).
* Verbindung wird beim Öffnen des Planers vorgewärmt.

Offen: Linien kodiert übertragen (points_encoded) spart etwa zwei Drittel der Antwort; komprimierte Anfragen auch im Web; Höhenprofil vom eigenen Server.

## 8. Sicherheit

* Beide Server: Anmeldung nur per Schlüssel (Passwort abgeschaltet), Firewall (22, 80, 443), fail2ban, automatische Sicherheitsupdates. Server 1 seit 12.11. 10:03 Uhr mit Korays OK umgestellt.
* Schlüssel: Koray (eigener), Claude (claude-cumo-drive), dazu je ein Schlüssel von Server zu Server für Kopie und Sicherung in beide Richtungen.
* GraphHopper und Photon hören nur lokal, erreichbar nur über den Webserver.
* Geheimnisse liegen nicht auf den Servern (kein Supabase Schlüssel, kein TomTom Schlüssel).

## Befehle

Status: `ssh root@IP 'tail -n 5 /opt/cumo-routing/setup.log; systemctl is-active cumo-routing cumo-photon caddy; systemctl list-timers | grep cumo'`
Neuaufbau von Hand: `systemctl start cumo-routing-update`
Sicherung von Hand: `/opt/cumo-routing/backup.sh`
Betrieb neu einrichten: `ssh root@IP 'PEER_IP=<andere IP> bash -s' < routing/server/cloud/betrieb.sh`
