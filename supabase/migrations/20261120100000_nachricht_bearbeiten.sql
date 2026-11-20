-- Eigene Nachrichten bearbeiten (Koray 20.11.2026): im Chat einer Ausfahrt und in Unterhaltungen.
-- Nur der Text, nur die eigene Nachricht, nur in den ersten 24 Stunden. edited_at setzt die Datenbank selbst,
-- die App zeigt dann „bearbeitet“. Löschen gab es schon (Policy „Eigene Nachricht löschen“).

alter table public.ride_messages add column if not exists edited_at timestamptz;
alter table public.direct_messages add column if not exists edited_at timestamptz;

create or replace function public.message_edited() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- gesperrte Konten bearbeiten auch nichts (wie beim Senden, melden_blockieren.sql)
  if new.body is distinct from old.body and auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'Dein Konto ist gesperrt. Nachrichten kannst du gerade nicht senden.' using errcode = 'P0001';
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists ride_messages_edited on public.ride_messages;
create trigger ride_messages_edited before update on public.ride_messages for each row execute function public.message_edited();
drop trigger if exists direct_messages_edited on public.direct_messages;
create trigger direct_messages_edited before update of body on public.direct_messages for each row execute function public.message_edited();

drop policy if exists "Eigene Nachricht bearbeiten" on public.ride_messages;
create policy "Eigene Nachricht bearbeiten" on public.ride_messages for update to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '24 hours')
  with check (user_id = auth.uid());
grant update (body) on public.ride_messages to authenticated;

drop policy if exists "Eigene Nachricht bearbeiten" on public.direct_messages;
create policy "Eigene Nachricht bearbeiten" on public.direct_messages for update to authenticated
  using (sender = auth.uid() and created_at > now() - interval '24 hours')
  with check (sender = auth.uid());
grant update (body) on public.direct_messages to authenticated;
