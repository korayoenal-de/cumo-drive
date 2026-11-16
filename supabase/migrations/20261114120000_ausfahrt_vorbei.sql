-- Nach der Ausfahrt (Koray 14.11.): eine Ausfahrt ist vorbei, sobald die Lead die Fahrt beendet. Beendet sie keiner,
-- 3 Stunden nach der geplanten Rückkehr, spätestens um Mitternacht (Ortszeit). Danach steht sie für alle, die
-- dabei waren, unter Meine Touren bei Gefahren; aus der Community verschwindet sie. Der Chat bleibt.

alter table public.rides
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

-- Beginn und Ende der echten Fahrt mitschreiben
create or replace function public.rides_mark_times() returns trigger
language plpgsql as $$
begin
  if new.status = 'laeuft' and old.status is distinct from 'laeuft' then
    new.started_at := coalesce(new.started_at, now());
  end if;
  if new.status = 'beendet' and old.status is distinct from 'beendet' then
    new.ended_at := coalesce(new.ended_at, now());
  end if;
  return new;
end $$;
drop trigger if exists rides_mark_times on public.rides;
create trigger rides_mark_times before update of status on public.rides
  for each row execute function public.rides_mark_times();

create or replace function public.ride_is_over(status text, starts timestamptz, minutes integer) returns boolean
language sql stable as $$
  select status = 'beendet'
    or (starts is not null and (
      now() > starts + make_interval(mins => coalesce(minutes, 180)) + interval '3 hours'
      or now() >= ((date_trunc('day', starts at time zone 'Europe/Berlin') + interval '1 day') at time zone 'Europe/Berlin')));
$$;
grant execute on function public.ride_is_over(text, timestamptz, integer) to authenticated;

drop function if exists public.community_rides();
create function public.community_rides()
returns table (
  id uuid, name text, owner_name text, owner_car text, starts_at timestamptz, meeting_point jsonb, note text,
  km numeric, minutes integer, start_lat double precision, start_lon double precision,
  end_lat double precision, end_lon double precision, goal_name text,
  taken integer, max_members integer, my_status text, is_owner boolean, open_requests integer, ride_status text,
  is_public boolean, is_over boolean, started_at timestamptz, ended_at timestamptz)
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
    x.ended_at
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
