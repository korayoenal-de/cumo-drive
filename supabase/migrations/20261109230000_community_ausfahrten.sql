-- Community Ausfahrten (Koray 9.11.): Abonnenten veröffentlichen eine Gruppenfahrt mit Zeit und Treffpunkt.
-- Andere fragen an, der Owner nimmt an oder lehnt ab, danach gibt es einen Chat und am Tag die
-- Gruppenfahrt wie bei Einladungen. Dazu Startpunkte der veröffentlichten Touren für die Karte.

-- Startpunkt einer Tour für die Pins der Community Karte (aus der verpackten Tour) -----------------
alter table public.tours
  add column start_lat double precision generated always as ((data #>> '{tour,wegpunkte,0,0}')::double precision) stored,
  add column start_lon double precision generated always as ((data #>> '{tour,wegpunkte,0,1}')::double precision) stored;

-- Fahrten: öffentlich als Ausfahrt ---------------------------------------------------------
alter table public.rides
  add column public boolean not null default false,
  add column note text check (note is null or char_length(note) <= 500),
  add column published_at timestamptz;
create index rides_public_starts on public.rides (starts_at) where public;

-- Mitglieder: Anfrage und Ablehnung ---------------------------------------------------------
alter table public.ride_members drop constraint if exists ride_members_status_check;
alter table public.ride_members add constraint ride_members_status_check
  check (status in ('eingeladen', 'zugesagt', 'abgesagt', 'angefragt', 'abgelehnt'));
alter table public.ride_members add column message text check (message is null or char_length(message) <= 300);

-- Wer nur angefragt hat oder abgelehnt wurde, ist kein Mitglied (sieht weder Fahrt noch Chat)
create or replace function public.is_ride_member(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from ride_members m where m.ride_id = r and m.user_id = auth.uid()
    and m.status in ('eingeladen', 'zugesagt', 'abgesagt'));
$$;

-- Belegte Plätze: Eingeladene und Zugesagte (Ersteller zählt mit)
create function public.ride_taken(r uuid) returns integer
language sql security definer set search_path = public stable as $$
  select count(*)::integer from ride_members m where m.ride_id = r and m.status in ('eingeladen', 'zugesagt');
$$;
revoke all on function public.ride_taken(uuid) from public, anon, authenticated;

-- Bestehende Funktionen zählen ab jetzt nur Eingeladene und Zugesagte ---------------------------
create or replace function public.join_ride(join_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r uuid;
  lim integer;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  select x.id, x.max_members into r, lim from rides x where x.code = lower(join_code) and x.status <> 'beendet' for update;
  if r is null then
    raise exception 'Fahrt nicht gefunden';
  end if;
  if not exists (select 1 from ride_members m where m.ride_id = r and m.user_id = auth.uid() and m.status in ('eingeladen', 'zugesagt'))
     and public.ride_taken(r) >= lim then
    raise exception 'Die Gruppe ist voll';
  end if;
  insert into ride_members (ride_id, user_id, status) values (r, auth.uid(), 'zugesagt')
  on conflict (ride_id, user_id) do update set status = 'zugesagt', responded_at = now();
  return r;
end $$;

create or replace function public.invite_to_ride(ride uuid, member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
  v_ride_status text;
  v_member_status text;
  v_car text;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  select x.owner, x.max_members, x.status into v_owner, v_max, v_ride_status
    from rides x where x.id = invite_to_ride.ride for update;
  if v_owner is null then
    raise exception 'Fahrt nicht gefunden';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Nur wer die Fahrt angelegt hat, kann einladen';
  end if;
  if v_ride_status = 'beendet' then
    raise exception 'Die Fahrt ist schon beendet';
  end if;
  if member is null or member = auth.uid() then
    raise exception 'Du bist schon dabei';
  end if;
  select p.car into v_car from profiles p where p.id = member and p.display_name is not null;
  if not found then
    raise exception 'Diesen Fahrer gibt es nicht';
  end if;
  select m.status into v_member_status from ride_members m where m.ride_id = invite_to_ride.ride and m.user_id = member;
  if v_member_status in ('eingeladen', 'zugesagt') then
    raise exception 'Schon eingeladen';
  end if;
  if public.ride_taken(invite_to_ride.ride) >= v_max then
    raise exception 'Die Gruppe ist voll (höchstens % Fahrzeuge)', v_max;
  end if;
  if v_member_status is null then
    insert into ride_members (ride_id, user_id, role, status, vehicle)
    values (invite_to_ride.ride, member, 'mitfahrer', 'eingeladen', v_car);
  else
    update ride_members m set status = 'eingeladen', responded_at = null
      where m.ride_id = invite_to_ride.ride and m.user_id = member;
  end if;
end $$;

create or replace function public.respond_invite(ride uuid, accept boolean, my_vehicle text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
  v_ride_status text;
  v_member_status text;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  select x.owner, x.max_members, x.status into v_owner, v_max, v_ride_status
    from rides x where x.id = respond_invite.ride for update;
  if v_owner is null then
    raise exception 'Fahrt nicht gefunden';
  end if;
  if v_ride_status = 'beendet' then
    raise exception 'Die Fahrt ist schon beendet';
  end if;
  select m.status into v_member_status from ride_members m where m.ride_id = respond_invite.ride and m.user_id = auth.uid();
  if v_member_status is null or v_member_status in ('angefragt', 'abgelehnt') then
    raise exception 'Keine Einladung für diese Fahrt';
  end if;
  if v_owner = auth.uid() and not coalesce(accept, false) then
    raise exception 'Als Ersteller kannst du nicht absagen';
  end if;
  if accept and v_member_status = 'abgesagt' and public.ride_taken(respond_invite.ride) >= v_max then
    raise exception 'Die Gruppe ist inzwischen voll';
  end if;
  update ride_members m
    set status = case when accept then 'zugesagt' else 'abgesagt' end,
        vehicle = coalesce(left(nullif(btrim(my_vehicle), ''), 80), m.vehicle),
        responded_at = now()
    where m.ride_id = respond_invite.ride and m.user_id = auth.uid();
end $$;

-- Teilnehmer ohne offene Anfragen und Ablehnungen (die stehen in ride_requests)
create or replace function public.ride_overview(ride uuid)
returns table (user_id uuid, display_name text, vehicle text, status text, role text, is_owner boolean)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.display_name, coalesce(m.vehicle, p.car), m.status, m.role, m.user_id = x.owner
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = m.user_id
  where m.ride_id = ride_overview.ride
    and m.status in ('eingeladen', 'zugesagt', 'abgesagt')
    and auth.uid() is not null
    and (x.owner = auth.uid() or public.is_ride_member(x.id))
  order by (m.user_id = x.owner) desc, m.joined_at;
$$;

-- Ausfahrt veröffentlichen: nur mit aktiver Mitgliedschaft, Tour aus dem eigenen Konto ------------
create function public.publish_ride(p_tour uuid, p_starts timestamptz, p_meeting jsonb, p_note text, p_seats integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ent json;
  v_max integer;
  v_name text;
  v_data jsonb;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  v_ent := public.my_entitlement();
  if not coalesce((v_ent ->> 'active')::boolean, false) then
    raise exception 'Ausfahrten veröffentlichen kannst du mit der Mitgliedschaft';
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
  v_max := least(greatest(coalesce(p_seats, 5) + 1, 2), greatest(coalesce((v_ent ->> 'max_vehicles')::integer, 6), 2), 20);
  insert into rides (name, owner, tour_id, tour, starts_at, meeting_point, status, public, note, published_at, max_members)
  values (v_name, auth.uid(), p_tour, v_data, p_starts, p_meeting, 'geplant', true,
    left(nullif(btrim(p_note), ''), 500), now(), v_max)
  returning id into v_id;
  return v_id;
end $$;

-- Ausfahrt zurückziehen (Owner): wird beendet und verschwindet aus der Community
create function public.cancel_public_ride(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update rides x set status = 'beendet', public = false
    where x.id = cancel_public_ride.ride and x.owner = auth.uid();
  if not found then
    raise exception 'Fahrt nicht gefunden';
  end if;
end $$;

-- Anstehende Ausfahrten für die Community (angemeldet) -------------------------------------------
create function public.community_rides()
returns table (
  id uuid, name text, owner_name text, owner_car text, starts_at timestamptz, meeting_point jsonb, note text,
  km numeric, minutes integer, start_lat double precision, start_lon double precision,
  end_lat double precision, end_lon double precision, goal_name text,
  taken integer, max_members integer, my_status text, is_owner boolean, open_requests integer, ride_status text)
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
    x.status
  from rides x
  left join profiles p on p.id = x.owner
  where auth.uid() is not null
    and x.public
    and x.status <> 'beendet'
    and x.starts_at > now() - interval '6 hours'
  order by x.starts_at
  limit 100;
$$;

-- Tour einer öffentlichen Ausfahrt (zum Zeigen auf der Karte, ohne Mitglied zu sein)
create function public.community_ride_tour(ride uuid) returns jsonb
language sql security definer set search_path = public stable as $$
  select x.tour from rides x where x.id = community_ride_tour.ride and x.public and auth.uid() is not null;
$$;

-- Teilnehmer einer öffentlichen Ausfahrt (Name und Auto der Zugesagten, für alle Angemeldeten)
create function public.community_ride_members(ride uuid)
returns table (user_id uuid, display_name text, vehicle text, is_owner boolean)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.display_name, coalesce(m.vehicle, p.car), m.user_id = x.owner
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = m.user_id
  where m.ride_id = community_ride_members.ride and x.public and auth.uid() is not null and m.status = 'zugesagt'
  order by (m.user_id = x.owner) desc, m.responded_at nulls first, m.joined_at;
$$;

-- Mitfahren anfragen ------------------------------------------------------------------------
create function public.request_ride(ride uuid, msg text default null, my_vehicle text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
  v_public boolean;
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
  select x.owner, x.max_members, x.public, x.status, x.starts_at into v_owner, v_max, v_public, v_status, v_starts
    from rides x where x.id = request_ride.ride for update;
  if v_owner is null or not v_public or v_status = 'beendet' then
    raise exception 'Diese Ausfahrt gibt es nicht mehr';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Das ist deine eigene Ausfahrt';
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

-- Eigene Anfrage zurückziehen oder als Teilnehmer absagen
create function public.withdraw_ride(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mine text;
begin
  select m.status into v_mine from ride_members m where m.ride_id = withdraw_ride.ride and m.user_id = auth.uid();
  if v_mine = 'angefragt' then
    delete from ride_members m where m.ride_id = withdraw_ride.ride and m.user_id = auth.uid();
  elsif v_mine in ('eingeladen', 'zugesagt') then
    if exists (select 1 from rides x where x.id = withdraw_ride.ride and x.owner = auth.uid()) then
      raise exception 'Als Organisator ziehst du die Ausfahrt zurück';
    end if;
    update ride_members m set status = 'abgesagt', responded_at = now()
      where m.ride_id = withdraw_ride.ride and m.user_id = auth.uid();
  end if;
end $$;

-- Offene Anfragen einer eigenen Ausfahrt mit Profil (nur Owner)
create function public.ride_requests(ride uuid)
returns table (user_id uuid, display_name text, vehicle text, message text, requested_at timestamptz, member_since timestamptz, drives integer, drive_km numeric)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.display_name, coalesce(m.vehicle, p.car), m.message, m.joined_at, p.created_at,
    (select count(*)::integer from drives d where d.owner = m.user_id),
    (select coalesce(sum(d.km), 0) from drives d where d.owner = m.user_id)
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = m.user_id
  where m.ride_id = ride_requests.ride and x.owner = auth.uid() and m.status = 'angefragt'
  order by m.joined_at;
$$;

-- Anfrage annehmen oder ablehnen (Owner)
create function public.answer_request(ride uuid, member uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
begin
  select x.owner, x.max_members into v_owner, v_max from rides x where x.id = answer_request.ride for update;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Nur der Organisator kann Anfragen beantworten';
  end if;
  if not exists (select 1 from ride_members m where m.ride_id = answer_request.ride and m.user_id = member and m.status = 'angefragt') then
    raise exception 'Diese Anfrage gibt es nicht mehr';
  end if;
  if accept and public.ride_taken(answer_request.ride) >= v_max then
    raise exception 'Die Ausfahrt ist schon voll';
  end if;
  update ride_members m set status = case when accept then 'zugesagt' else 'abgelehnt' end, responded_at = now()
    where m.ride_id = answer_request.ride and m.user_id = member;
end $$;

-- Chat der Ausfahrt ----------------------------------------------------------------------------
create table public.ride_messages (
  id bigint generated always as identity primary key,
  ride_id uuid not null references public.rides (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index ride_messages_ride on public.ride_messages (ride_id, created_at);
alter table public.ride_messages enable row level security;

create function public.can_chat(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from rides x where x.id = r and x.owner = auth.uid())
    or exists (select 1 from ride_members m where m.ride_id = r and m.user_id = auth.uid() and m.status = 'zugesagt');
$$;

create policy "Chat lesen als Teilnehmer" on public.ride_messages for select to authenticated using (public.can_chat(ride_id));
create policy "Chat schreiben als Teilnehmer" on public.ride_messages for insert to authenticated
  with check (user_id = auth.uid() and public.can_chat(ride_id));
create policy "Eigene Nachricht löschen" on public.ride_messages for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.ride_messages to authenticated;
grant insert (ride_id, body) on public.ride_messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.ride_messages;
exception when others then
  null;
end $$;

-- Rechte -----------------------------------------------------------------------------------
revoke all on function public.publish_ride(uuid, timestamptz, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.cancel_public_ride(uuid) from public, anon, authenticated;
revoke all on function public.community_rides() from public, anon, authenticated;
revoke all on function public.community_ride_tour(uuid) from public, anon, authenticated;
revoke all on function public.community_ride_members(uuid) from public, anon, authenticated;
revoke all on function public.request_ride(uuid, text, text) from public, anon, authenticated;
revoke all on function public.withdraw_ride(uuid) from public, anon, authenticated;
revoke all on function public.ride_requests(uuid) from public, anon, authenticated;
revoke all on function public.answer_request(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.can_chat(uuid) from public, anon, authenticated;

grant execute on function public.publish_ride(uuid, timestamptz, jsonb, text, integer) to authenticated;
grant execute on function public.cancel_public_ride(uuid) to authenticated;
grant execute on function public.community_rides() to authenticated;
grant execute on function public.community_ride_tour(uuid) to authenticated;
grant execute on function public.community_ride_members(uuid) to authenticated;
grant execute on function public.request_ride(uuid, text, text) to authenticated;
grant execute on function public.withdraw_ride(uuid) to authenticated;
grant execute on function public.ride_requests(uuid) to authenticated;
grant execute on function public.answer_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.can_chat(uuid) to authenticated;
