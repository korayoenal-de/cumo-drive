-- Konto löschen in der App (Apple Regel 5.1.1 v): löscht den eigenen Nutzer.
-- Alle eigenen Daten hängen per "on delete cascade" an auth.users: Profil, Touren (auch veröffentlichte),
-- Fahrten, Fahrzeuge, Gruppenfahrten als Lead, Mitgliedschaften in Fahrten und Clubs.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Nicht angemeldet';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
