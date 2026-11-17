-- Abgesagte Ausfahrt (Koray 17.11.): Teilnehmer sehen sie als „abgesagt“, nicht als beendet oder nicht gestartet.
-- Der Status bleibt 'beendet' (alle Stellen, die nur geplant oder laeuft kennen, bleiben gleich); neu ist der
-- Zeitpunkt der Absage, den community_rides als is_cancelled mitliefert. Ältere Apps ignorieren die Spalte.

alter table public.rides add column if not exists cancelled_at timestamptz;

create or replace function public.cancel_public_ride(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- nur eine geplante Ausfahrt gilt als abgesagt; sonst wie bisher nur beenden.
  -- public bleibt stehen (wie bei jeder beendeten Ausfahrt): vorbei sehen sie ohnehin nur Teilnehmer, und die App
  -- weiß so weiter, ob sie in die Community gehört oder als private nur unter Touren steht.
  update rides x set status = 'beendet',
      cancelled_at = case when x.status = 'geplant' then now() else x.cancelled_at end
    where x.id = cancel_public_ride.ride and x.owner = auth.uid();
  if not found then
    raise exception 'Fahrt nicht gefunden';
  end if;
end $$;
revoke all on function public.cancel_public_ride(uuid) from public, anon;
grant execute on function public.cancel_public_ride(uuid) to authenticated;

drop function if exists public.community_rides();
create function public.community_rides()
returns table (
  id uuid, name text, owner_name text, owner_car text, starts_at timestamptz, meeting_point jsonb, note text,
  km numeric, minutes integer, start_lat double precision, start_lon double precision,
  end_lat double precision, end_lon double precision, goal_name text,
  taken integer, max_members integer, my_status text, is_owner boolean, open_requests integer, ride_status text,
  is_public boolean, is_over boolean, started_at timestamptz, ended_at timestamptz, is_cancelled boolean)
language sql security definer set search_path = public stable as $$
  select x.id, x.name, p.display_name, p.car, x.starts_at, x.meeting_point, x.note,
    nullif(x.tour #>> '{tour,laenge_km}', '')::numeric,
    nullif(x.tour ->> 'minutes', '')::numeric::integer,
    (x.tour #>> '{tour,wegpunkte,0,0}')::double precision,
    (x.tour #>> '{tour,wegpunkte,0,1}')::double precision,
    (x.tour -> 'tour' -> 'wegpunkte' -> -1 ->> 0)::double precision,
    (x.tour -> 'tour' -> 'wegpunkte' -> -1 ->> 1)::double precision,
    x.tour -> 'tour' -> 'namen' ->> -1,
    public.ride_taken(x.id), x.max_members,
    (select m.status from ride_members m where m.ride_id = x.id and m.user_id = auth.uid()),
    x.owner = auth.uid(),
    case when x.owner = auth.uid() then (select count(*)::integer from ride_members m where m.ride_id = x.id and m.status = 'angefragt') else 0 end,
    x.status,
    x.public,
    public.ride_is_over(x.status, x.starts_at, nullif(x.tour ->> 'minutes', '')::numeric::integer),
    x.started_at,
    x.ended_at,
    x.cancelled_at is not null
  from rides x
  left join profiles p on p.id = x.owner
  where auth.uid() is not null
    and x.starts_at is not null
    and (
      -- anstehend: wie bisher für alle, die sie sehen dürfen
      (not public.ride_is_over(x.status, x.starts_at, nullif(x.tour ->> 'minutes', '')::numeric::integer)
        and (x.public or x.owner = auth.uid()
          or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = auth.uid() and m.status in ('eingeladen', 'zugesagt', 'angefragt'))))
      -- vorbei: nur für die, die dabei waren, ein Jahr lang
      or (public.ride_is_over(x.status, x.starts_at, nullif(x.tour ->> 'minutes', '')::numeric::integer)
        and x.starts_at > now() - interval '365 days'
        and (x.owner = auth.uid()
          or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = auth.uid() and m.status = 'zugesagt')))
    )
  order by x.starts_at;
$$;
revoke all on function public.community_rides() from public, anon;
grant execute on function public.community_rides() to authenticated;
