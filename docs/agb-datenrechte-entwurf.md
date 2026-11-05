# AGB Bausteine: Schutz unserer Daten (Entwurf)

Stand: 5. November 2026. Entwurf als Grundlage für die anwaltliche Prüfung, keine Rechtsberatung.

## Was wir schützen wollen

* Kuratierte Datenbank: Pässe mit Stufe, Kehren und Sperren, Bergrenn und Rallyestrecken, bevorzugte Abschnitte, Highlights, Texte und Ansagen.
* Routing Logik und Profile (Sportwagen Profil, Gewichtungen, Kurvenbewertung).
* Bewertungen und Spuren der Nutzer in ausgewerteter Form (welche Straßen gut ankommen).
* Club Touren (CUMO DRIVERS CLUB Originale).

## Rechtliche Grundlage

* Datenbankherstellerrecht (§§ 87a ff. UrhG): schützt eine Datenbank, wenn in Beschaffung, Prüfung oder Darstellung wesentlich investiert wurde. Unsere Recherche, Prüfung und Pflege ist genau diese Investition. Wir sollten sie dokumentieren (Arbeitszeit, Quellen, Prüfschritte).
* Urheberrecht an Texten, Beschreibungen und Software.
* Vertrag (AGB): verbietet Nutzern zusätzlich, was das Gesetz nicht sicher abdeckt, etwa automatisiertes Auslesen.

## Grenze: OpenStreetMap (ODbL)

Karte, Straßenverläufe und viele Koordinaten stammen aus OpenStreetMap. Die ODbL erlaubt kommerzielle Nutzung, verlangt aber:

* Namensnennung ("© OpenStreetMap Mitwirkende") in App und Web.
* Share alike: Eine Datenbank, die aus OSM Daten abgeleitet ist und öffentlich genutzt wird, muss auf Anfrage unter ODbL bereitgestellt werden. Das betrifft abgeleitete Geometrien, nicht unsere eigenen Inhalte.

Folgerungen für die Technik:

* Eigene Inhalte (Bewertungen, Stufen, Texte, Rennhistorie, Nutzerbewertungen) getrennt von OSM Geometrie speichern, verbunden nur über Kennungen. Dann gilt die ODbL als "Collective Database" nur für den OSM Teil.
* Koordinaten von Pässen und Strecken, die direkt aus OSM übernommen sind, sind OSM abgeleitet. Das ist in Ordnung, aber diese Koordinaten selbst können wir nicht exklusiv schützen.
* AGB können die ODbL nicht aushebeln. Klauseln immer mit Vorbehalt "soweit nicht Lizenzen Dritter (insbesondere ODbL) etwas anderes erlauben".

## Klauseln (Entwurf)

**§ X Rechte an Inhalten und Daten von Cumo Drive**

1. Die App, der Web Planer und alle darin enthaltenen Inhalte, insbesondere die von Cumo Drive zusammengestellten Datenbanken zu Pässen, Strecken, Highlights und Touren, deren Bewertungen, Beschreibungen und Ansagen sowie die Routing Profile, sind urheberrechtlich und als Datenbank nach §§ 87a ff. UrhG geschützt. Alle Rechte liegen bei [Betreiber], soweit nicht anders gekennzeichnet.
2. Der Nutzer erhält ein einfaches, nicht übertragbares Recht, die Inhalte für eigene, private Zwecke innerhalb der App und des Web Planers zu nutzen. Club Lizenzen berechtigen zur Nutzung für Ausfahrten des jeweiligen Clubs.
3. Untersagt ist insbesondere:
   a) das systematische oder automatisierte Auslesen, Kopieren oder Speichern von Inhalten (Scraping, Crawler, Bots, Abruf über nicht öffentliche Schnittstellen);
   b) das Vervielfältigen, Verbreiten oder öffentliche Zugänglichmachen wesentlicher Teile der Datenbanken oder die wiederholte Entnahme unwesentlicher Teile;
   c) die Nutzung der Inhalte zum Aufbau oder Training eines konkurrierenden Dienstes, einer Datenbank oder eines KI Modells;
   d) das Umgehen technischer Schutzmaßnahmen sowie das Dekompilieren der App, soweit nicht gesetzlich erlaubt.
4. Export Funktionen (GPX, KML) dienen der persönlichen Nutzung, etwa in einem Navigationsgerät. Eine Weitergabe exportierter Touren an Dritte zu gewerblichen Zwecken ist ohne Zustimmung nicht erlaubt.
5. Kartendaten stammen teilweise von OpenStreetMap (© OpenStreetMap Mitwirkende, Lizenz ODbL). Für diese Daten gelten die Bedingungen der ODbL; diese AGB schränken die dort gewährten Rechte nicht ein.

**§ Y Inhalte der Nutzer**

1. Nutzer behalten die Rechte an Touren, Fotos und Texten, die sie erstellen.
2. Mit dem Veröffentlichen einer Tour in der Community räumt der Nutzer [Betreiber] ein einfaches, unentgeltliches, zeitlich und räumlich unbeschränktes Recht ein, die Tour in Cumo Drive anzuzeigen, anderen Nutzern bereitzustellen und für die Verbesserung der Routenplanung zu nutzen. Das Recht endet für die Anzeige mit dem Löschen der Tour; bereits erfolgte Auswertungen bleiben bestehen.
3. Bewertungen nach der Fahrt und die gefahrene Spur nutzt [Betreiber] in zusammengefasster, nicht personenbezogener Form, um Straßen zu bewerten und die Routenplanung zu verbessern. Die so entstehende Auswertung ist Teil der Datenbank nach § X. Einzelheiten regelt die Datenschutzerklärung.

## Begleitend (Technik, nicht AGB)

* Keine offene Schnittstelle auf die kuratierte Datenbank, nur Zugriff über unsere App mit Anmeldung.
* Ratenbegrenzung und Abrufprotokoll auf Server und Supabase.
* Pass und Highlight Daten nicht komplett im Klartext in der App ausliefern, sondern regional nachladen.
* Wasserzeichen: wenige fiktive Einträge (zum Beispiel ein erfundener Alternativname) erkennen Kopien.
* Interne Dokumentation der Recherche als Nachweis der Investition.

## Zu klären mit Anwalt

* Ob die Bewertungsauswertung aus Nutzerspuren als personenbezogen gilt (DSGVO, Einwilligung, Opt out).
* Formulierung zur ODbL, insbesondere ob unsere kuratierte Datenbank als "Collective Database" gilt.
* Betreiber: Einzelunternehmen oder eigene Gesellschaft.
