-- Mitteilungen in zwei Stufen (Konzept „Ausfahrt im Fokus“, Koray 20.11.2026): dringend (Chats, private Nachrichten,
-- Anfragen und Absagen zu deinen Ausfahrten, Ansagen am Tag) mit Ton, leise (Kontaktanfragen, neue Kontakte, Zusagen)
-- ohne Ton. Beide Gruppen lassen sich in den Einstellungen abschalten; die Funktion notify liest das hier.
alter table public.profiles add column if not exists notify_urgent boolean not null default true;
alter table public.profiles add column if not exists notify_quiet boolean not null default true;
grant select (notify_urgent, notify_quiet) on public.profiles to authenticated;
grant update (notify_urgent, notify_quiet) on public.profiles to authenticated;
