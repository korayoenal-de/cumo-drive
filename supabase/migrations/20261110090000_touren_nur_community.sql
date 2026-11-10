-- Veröffentlichte Tour nur aus Meine Touren entfernen (Koray 10.11.): Die Tour bleibt in der
-- Community, erscheint aber nicht mehr in der eigenen Bibliothek und wird nicht wieder heruntergeladen.
alter table public.tours add column in_library boolean not null default true;
