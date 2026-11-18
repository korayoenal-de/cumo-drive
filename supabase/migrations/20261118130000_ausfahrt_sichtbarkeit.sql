-- Sichtbarkeit einer Ausfahrt nachträglich ändern (Koray 18.11.)
--
-- Bisher stand privat oder öffentlich nur beim Anlegen fest. Wer privat anfängt und später Plätze frei hat,
-- musste absagen und neu anlegen. Jetzt kann der Organisator eine geplante Ausfahrt in der Community teilen
-- und wieder herausnehmen. Regeln wie beim Anlegen: teilen nur mit Mitgliedschaft. Zusagen, Einladungen,
-- Anfragen und der Chat bleiben; wer schon dabei ist, sieht die Ausfahrt auch privat weiter (can_see_ride).
-- Die Zahl der Plätze bleibt, wie sie ist. Keine Mitteilung an die Teilnehmer, für sie ändert sich nichts.

create function public.ride_set_public(ride uuid, make_public boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  st text;
  cancelled timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden' using errcode = 'P0001';
  end if;
  if make_public is null then
    raise exception 'Sichtbarkeit fehlt' using errcode = 'P0001';
  end if;
  select x.status, x.cancelled_at into st, cancelled
    from rides x where x.id = ride_set_public.ride and x.owner = auth.uid() for update;
  if st is null then
    raise exception 'Fahrt nicht gefunden' using errcode = 'P0001';
  end if;
  if st <> 'geplant' or cancelled is not null then
    raise exception 'Das geht nur vor der Abfahrt.' using errcode = 'P0001';
  end if;
  if make_public and not coalesce((public.my_entitlement() ->> 'active')::boolean, false) then
    raise exception 'In der Community veröffentlichen kannst du mit der Mitgliedschaft' using errcode = 'P0001';
  end if;
  update rides x set
    public = make_public,
    published_at = case when make_public and not x.public then now() else x.published_at end
  where x.id = ride_set_public.ride;
end $$;
revoke all on function public.ride_set_public(uuid, boolean) from public, anon;
grant execute on function public.ride_set_public(uuid, boolean) to authenticated;
