# Strecken Datenbank (Recherche)

Gesammelte schöne Straßen für Cumo Drive. Jede Datei ist ein JSON Array mit Einträgen nach diesem Schema.
Die Linien (genauer Straßenverlauf) werden später zentral aus OpenStreetMap erzeugt; hier zählen
eindeutige Anker: Straßennummer, Start, Ende und genug Zwischenorte mit Koordinaten.

```json
{
  "id": "at-gaberl",                       // eindeutig, Länderkürzel vorne, nur a-z 0-9 und -
  "name": "Gaberl Bergrennen",             // so wie es angesagt werden soll
  "country": "AT",                         // DE AT CH IT FR
  "region": "Steiermark",
  "kind": "rallye",                        // rallye | bergrennen | strecke | aussicht | pass
  "tier": "highlight",                     // highlight = ankündigen; prefer = nur bei Planung bevorzugen
  "note": "Bergrennstrecke",               // kurze deutsche Unterzeile, weiblich (Strecke, Straße)
  "roads": ["B 77"],                        // Straßennummern wie in OSM ref, falls bekannt
  "from": {"name": "Weißkirchen", "lat": 47.15, "lon": 14.74},
  "to":   {"name": "Gaberlsattel", "lat": 47.10, "lon": 14.92},
  "via":  [{"name": "...", "lat": 0, "lon": 0}],   // Orte oder Punkte entlang, bei langen Strecken alle 10 bis 20 km
  "length_km": 9.5,
  "facts": "1960er bis heute, 9,5 km, 600 Hm",       // kurz, für Ansage oder Info
  "quality": 4,                            // 1 bis 5, wie lohnend für Sportwagen (Belag, Kurven, Verkehr)
  "caveats": "Wochenende viel Motorradverkehr, Wintersperre Nov bis Mai",
  "sources": ["https://..."]
}
```

Regeln
- Nur Straßen, die öffentlich und für Pkw befahrbar sind. Keine Schotterwege, keine Mautprivatstraßen ohne Hinweis in caveats.
- Koordinaten auf etwa 100 m genau, aus Nominatim, OSM, Wikipedia oder der Quelle. Nie raten; lieber Ort weglassen.
- Lieber weniger Einträge mit sauberen Ankern als viele vage.
- Doppelte Strecken über Dateien hinweg sind ok, die werden beim Zusammenführen bereinigt.
