# CarPlay für CUMO DRIVE

Stand: 10. November 2026

Status: **Entitlement freigegeben am 6. November 2026, 15:13** (Mail von Apple „CarPlay Entitlements“); CarPlay Navigation App für die App ID de.rallycumo.drive aktiviert am 6.11., 15:21 (Koray). Umgesetzt seit 6.11., öffentlich als „in Entwicklung“ bezeichnet.

## Umgesetzt (Builds 13 bis 20)

* Karte mit Tour im dunklen CUMO Design, Kamera schräg wie auf dem iPhone, gleitet ohne Ruckeln
* Vorschau mit Los, Führung mit eigenen Manöversymbolen (200 m vorher orange), Restweg und Ankunft
* Linie nur vor dem Auto, Rückweg zur Tour gelb, Anweisung „Zurück zur Tour“ abseits der Tour
* Highlights als Hinweis, Bremshinweis, Menü Mehr (Überspringen, Pause, Karte, Gruppe), Übersicht, Bewertung, Gruppe
* Start im Auto mit Meine Touren und Schnelle Runde (Build 16)
* Eigenes Auto aus der Garage als Standort, sonst eigener Pin; hellere Pfeile
* Kombiinstrument mit Manöverdaten, wo unterstützt
* Seit 10.11. im Code (kommt mit Build 21): Herauszoomen bei Tempo wie in der App

## Regel

CarPlay wird bei jeder Änderung an Karte und Navigation mitgedacht (Koray 10.11.). Was die App neu kann, bekommt CarPlay ebenfalls, soweit die Vorlagen von Apple es zulassen.

## Offen

* Koray: Namen der Knöpfe, ob Rundtouren aus dem Auto automatisch gespeichert werden, ob Community Touren in der Liste stehen
* Funk im Auto: Antippen statt Halten, Lenkradtaste prüfen
* Planen im Auto bewusst nach hinten gestellt

## Damals eingereicht (6.11.)

Formular developer.apple.com/contact/carplay, App Type Navigation (turn by turn directions), TestFlight Beta, drei Screenshots (Navigation, geplante Route, Highlight Ansage). Beschrieben wurden Karte mit Route (CPMapTemplate), Führung mit Manöverfeldern und Sprache, Vorschau (CPTripPreview), Ankunft nach tatsächlichem Tempo, automatische Neuberechnung, Hinweise zu Highlights und Sperrungen (CPNavigationAlert) und Daten fürs Kombiinstrument. Planen und Bearbeiten bleibt auf dem iPhone und im Web Planer.
