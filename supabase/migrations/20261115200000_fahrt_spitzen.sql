-- Orte der Spitzenwerte einer Fahrt (Koray 15.11.): im Rückblick auf der Karte zeigen, wo die stärkste Bremsung,
-- die größte Querbeschleunigung und die Höchstgeschwindigkeit waren.
-- Form: {"spitze": {"v": 153.2, "p": [lat, lon]}, "quer": {"v": 0.83, "p": [...], "seite": "links"}, "bremsung": {...}, "beschleunigung": {...}}
alter table public.drives add column if not exists peaks jsonb;
