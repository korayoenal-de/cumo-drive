-- Fehler 14.11. (Koray: Wohnort wird zurückgesetzt): Die Einstellungen lesen seit den Kontakten auch
-- invites_contacts_only. profiles hat Leserechte je Spalte, für diese Spalte fehlte das Recht. Dadurch
-- schlug das Laden der eigenen Einstellungen fehl und die App zeigte leere Werte (Wohnort fehlt).
grant select (invites_contacts_only) on public.profiles to authenticated;
