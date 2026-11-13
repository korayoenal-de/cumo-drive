-- Private Ausfahrt (Konzept Koray 13.11.)
--
-- Eine Ausfahrt ist jetzt standardmäßig privat: sie steht nicht in der Community, sehen können sie nur der
-- Organisator, Eingeladene, Zugesagte und Anfragende. Öffentlich wird sie nur auf ausdrücklichen Wunsch.
--  * Privat geht ohne Mitgliedschaft mit höchstens drei Fahrzeugen insgesamt (du und zwei Mitfahrer).
--    In der Community veröffentlichen und mehr Plätze gibt es mit der Mitgliedschaft.
--  * Einladungslink: führt zu einer Anfrage, die der Organisator annimmt. Der Schlüssel liegt in ride_links,
--    ohne Leserechte für irgendwen; nur die Funktionen unten kommen heran (der Organisator über ride_link_key).
--  * Einladen darf nur der Organisator (wie bisher in invite_to_ride).

create table public.ride_links (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  link_key text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
  created_at timestamptz not null default now()
);
alter table public.ride_links enable row level security;
-- keine Policy: direkt liest und schreibt niemand
revoke all on public.ride_links from anon, authenticated;

-- Darf ich diese Ausfahrt sehen? Öffentlich, eigene, oder ich bin eingeladen, dabei oder habe angefragt
create function public.can_see_ride(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select auth.uid() is not null and exists (
    select 1 from rides x where x.id = r and (
      x.public or x.owner = auth.uid()
      or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = auth.uid() and m.status in ('eingeladen', 'zugesagt', 'angefragt'))
    )
  );
$$;
revoke all on function public.can_see_ride(uuid) from public, anon;
grant execute on function public.can_see_ride(uuid) to authenticated;

-- Anlegen mit Sichtbarkeit -------------------------------------------------------------------------
drop function if exists public.publish_ride(uuid, timestamptz, jsonb, text, integer);
create function public.publish_ride(p_tour uuid, p_starts timestamptz, p_meeting jsonb, p_note text, p_seats integer, p_public boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ent json;
  v_member boolean;
  v_max integer;
  v_name text;
  v_data jsonb;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  v_ent := public.my_entitlement();
  v_member := coalesce((v_ent ->> 'active')::boolean, false);
  if p_public and not v_member then
    raise exception 'In der Community veröffentlichen kannst du mit der Mitgliedschaft';
  end if;
  select t.name, t.data into v_name, v_data from tours t where t.id = p_tour and t.owner = auth.uid();
  if v_name is null then
    raise exception 'Tour nicht gefunden';
  end if;
  if p_starts is null or p_starts < now() + interval '30 minutes' then
    raise exception 'Die Abfahrt muss in der Zukunft liegen';
  end if;
  if p_starts > now() + interval '120 days' then
    raise exception 'Die Abfahrt darf höchstens 120 Tage entfernt sein';
  end if;
  if v_member then
    v_max := least(greatest(coalesce(p_seats, 5) + 1, 2), greatest(coalesce((v_ent ->> 'max_vehicles')::integer, 6), 2), 20);
  else
    -- kostenfrei: höchstens drei Fahrzeuge insgesamt, also zwei Mitfahrer (Koray 13.11.)
    v_max := least(greatest(coalesce(p_seats, 2) + 1, 2), 3);
  end if;
  insert into rides (name, owner, tour_id, tour, starts_at, meeting_point, status, public, note, published_at, max_members)
  values (v_name, auth.uid(), p_tour, v_data, p_starts, p_meeting, 'geplant', coalesce(p_public, false),
    left(nullif(btrim(p_note), ''), 500), now(), v_max)
  returning id into v_id;
  insert into ride_links (ride_id) values (v_id);
  return v_id;
end $$;
revoke all on function public.publish_ride(uuid, timestamptz, jsonb, text, integer, boolean) from public, anon;
grant execute on function public.publish_ride(uuid, timestamptz, jsonb, text, integer, boolean) to authenticated;

-- Einladungslink des Organisators (legt den Schlüssel bei älteren Ausfahrten nachträglich an)
create function public.ride_link_key(ride uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  k text;
begin
  if not exists (select 1 from rides x where x.id = ride_link_key.ride and x.owner = auth.uid() and x.status <> 'beendet') then
    raise exception 'Fahrt nicht gefunden';
  end if;
  insert into ride_links (ride_id) values (ride_link_key.ride) on conflict (ride_id) do nothing;
  select l.link_key into k from ride_links l where l.ride_id = ride_link_key.ride;
  return k;
end $$;
revoke all on function public.ride_link_key(uuid) from public, anon;
grant execute on function public.ride_link_key(uuid) to authenticated;

-- Liste: öffentliche und meine Ausfahrten, mit Sichtbarkeit ------------------------------------------
drop function if exists public.community_rides();
create function public.community_rides()
returns table (
  id uuid, name text, owner_name text, owner_car text, starts_at timestamptz, meeting_point jsonb, note text,
  km numeric, minutes integer, start_lat double precision, start_lon double precision,
  end_lat double precision, end_lon double precision, goal_name text,
  taken integer, max_members integer, my_status text, is_owner boolean, open_requests integer, ride_status text,
  is_public boolean)
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
    x.public
  from rides x
  left join profiles p on p.id = x.owner
  where auth.uid() is not null
    and x.status <> 'beendet'
    and x.starts_at is not null
    and x.starts_at > now() - interval '6 hours'
    and (x.public or x.owner = auth.uid()
      or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = auth.uid() and m.status in ('eingeladen', 'zugesagt', 'angefragt')))
  order by x.starts_at
  limit 100;
$$;
revoke all on function public.community_rides() from public, anon;
grant execute on function public.community_rides() to authenticated;

create or replace function public.community_ride_tour(ride uuid) returns jsonb
language sql security definer set search_path = public stable as $$
  select x.tour from rides x where x.id = community_ride_tour.ride and public.can_see_ride(x.id);
$$;

create or replace function public.community_ride_members(ride uuid)
returns table (user_id uuid, display_name text, vehicle text, is_owner boolean)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.display_name, coalesce(m.vehicle, p.car), m.user_id = x.owner
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = m.user_id
  where m.ride_id = community_ride_members.ride and public.can_see_ride(x.id) and m.status = 'zugesagt'
  order by (m.user_id = x.owner) desc, m.responded_at nulls first, m.joined_at;
$$;

-- Wer den Link hat, sieht die Eckdaten (ohne Teilnehmer und ohne Tour) und kann anfragen
create function public.ride_by_link(ride uuid, k text)
returns table (id uuid, name text, owner_name text, starts_at timestamptz, km numeric, max_members integer, taken integer, ride_status text)
language sql security definer set search_path = public stable as $$
  select x.id, x.name, p.display_name, x.starts_at, nullif(x.tour #>> '{tour,laenge_km}', '')::numeric, x.max_members,
    public.ride_taken(x.id), x.status
  from rides x
  join ride_links l on l.ride_id = x.id
  left join profiles p on p.id = x.owner
  where x.id = ride_by_link.ride and l.link_key = ride_by_link.k
    and x.status <> 'beendet' and auth.uid() is not null;
$$;
revoke all on function public.ride_by_link(uuid, text) from public, anon;
grant execute on function public.ride_by_link(uuid, text) to authenticated;

-- Anfragen: öffentlich wie bisher, privat nur mit dem Schlüssel aus dem Link
drop function if exists public.request_ride(uuid, text, text);
create function public.request_ride(ride uuid, msg text default null, my_vehicle text default null, k text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
  v_public boolean;
  v_key text;
  v_status text;
  v_starts timestamptz;
  v_mine text;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.display_name is not null) then
    raise exception 'Lege zuerst deinen Namen in den Einstellungen fest';
  end if;
  select x.owner, x.max_members, x.public, l.link_key, x.status, x.starts_at into v_owner, v_max, v_public, v_key, v_status, v_starts
    from rides x left join ride_links l on l.ride_id = x.id where x.id = request_ride.ride for update of x;
  if v_owner is null or v_status = 'beendet' or not (v_public or coalesce(v_key = request_ride.k, false)) then
    raise exception 'Diese Ausfahrt gibt es nicht mehr';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Das ist deine eigene Ausfahrt';
  end if;
  if exists (select 1 from blocks b where (b.blocker = v_owner and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = v_owner)) then
    raise exception 'Diese Ausfahrt gibt es nicht mehr';
  end if;
  if v_starts < now() then
    raise exception 'Die Ausfahrt hat schon begonnen';
  end if;
  select m.status into v_mine from ride_members m where m.ride_id = request_ride.ride and m.user_id = auth.uid();
  if v_mine in ('eingeladen', 'zugesagt') then
    raise exception 'Du bist schon dabei';
  end if;
  if v_mine = 'abgelehnt' then
    raise exception 'Der Organisator hat deine Anfrage abgelehnt';
  end if;
  if public.ride_taken(request_ride.ride) >= v_max then
    raise exception 'Die Ausfahrt ist voll';
  end if;
  insert into ride_members (ride_id, user_id, role, status, vehicle, message)
  values (request_ride.ride, auth.uid(), 'mitfahrer', 'angefragt',
    coalesce(left(nullif(btrim(my_vehicle), ''), 80), (select p.car from profiles p where p.id = auth.uid())),
    left(nullif(btrim(msg), ''), 300))
  on conflict (ride_id, user_id) do update
    set status = 'angefragt', message = excluded.message, vehicle = excluded.vehicle, joined_at = now(), responded_at = null;
end $$;
revoke all on function public.request_ride(uuid, text, text, text) from public, anon;
grant execute on function public.request_ride(uuid, text, text, text) to authenticated;
