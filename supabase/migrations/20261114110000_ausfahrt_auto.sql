-- Auto in der Ausfahrt folgt der Garage (Koray 14.11.): Ein Teilnehmer hatte sein Auto gewechselt, in der Ausfahrt
-- stand weiter das beim Zusagen gemerkte. Die App schreibt das gerade gewählte Auto nach, bis die Fahrt startet.
create function public.ride_set_vehicle(ride uuid, my_vehicle text) returns void
language sql security definer set search_path = public as $$
  update ride_members m set vehicle = left(nullif(btrim(my_vehicle), ''), 80)
  from rides x
  where m.ride_id = ride_set_vehicle.ride and x.id = m.ride_id and m.user_id = auth.uid()
    and m.status = 'zugesagt' and x.status = 'geplant'
    and m.vehicle is distinct from left(nullif(btrim(my_vehicle), ''), 80);
$$;
revoke all on function public.ride_set_vehicle(uuid, text) from public, anon;
grant execute on function public.ride_set_vehicle(uuid, text) to authenticated;
