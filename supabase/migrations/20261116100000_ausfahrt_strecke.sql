-- Koray 16.11.: Strecke einer geplanten Ausfahrt ersetzen (Tour überschrieben und übernommen, Umfahrung einer
-- Sperrung beim Start). Darf, wer die Ausfahrt leitet; alle Zugesagten bekommen eine Mitteilung.
create or replace function public.ride_change_tour(ride uuid, new_tour jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  if not public.ride_is_lead(ride) then
    raise exception 'Ändern kann nur, wer die Ausfahrt leitet.' using errcode = 'P0001';
  end if;
  select status into st from rides where id = ride_change_tour.ride for update;
  if st <> 'geplant' then
    raise exception 'Die Ausfahrt läuft schon.' using errcode = 'P0001';
  end if;
  if new_tour is null or jsonb_typeof(new_tour) <> 'object' or pg_column_size(new_tour) > 2000000 then
    raise exception 'Diese Strecke passt nicht.' using errcode = 'P0001';
  end if;
  update rides set tour = new_tour where id = ride_change_tour.ride;
  perform public.push_notify(jsonb_build_object('type', 'ride_changed', 'ride', ride, 'actor', auth.uid(), 'what', 'strecke'));
end $$;
revoke all on function public.ride_change_tour(uuid, jsonb) from public, anon;
grant execute on function public.ride_change_tour(uuid, jsonb) to authenticated;
