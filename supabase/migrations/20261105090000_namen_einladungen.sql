-- Namen und Einladungen: Gruppenfahrten laufen nicht mehr über Codes. Wer eine Tour als Gruppe
-- fahren will, lädt die Mitfahrer mit ihrem Namen ein. Der Name steht im Profil, ist eindeutig
-- (Groß und Kleinschreibung zählen nicht) und hat 3 bis 30 Zeichen.

-- Profile: eindeutiger Name ---------------------------------------------------
-- Alte Einträge vorher bereinigen, sonst scheitern Prüfung und Index.
update public.profiles set display_name = nullif(btrim(regexp_replace(display_name, '\s+', ' ', 'g')), '')
  where display_name is not null;
update public.profiles set display_name = null
  where display_name is not null
    and (char_length(display_name) not between 3 and 30
      or display_name !~ '^[A-Za-z0-9À-ÖØ-öø-ÿĀ-ſ ._]+$');
-- bei doppelten Namen behält der älteste Eintrag den Namen
update public.profiles p set display_name = null
  where p.display_name is not null
    and exists (
      select 1 from public.profiles q
      where lower(q.display_name) = lower(p.display_name)
        and (q.created_at, q.id) < (p.created_at, p.id)
    );

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_format check (
  display_name is null or (
    char_length(display_name) between 3 and 30
    and display_name = btrim(display_name)
    and display_name !~ '\s\s'
    and display_name ~ '^[A-Za-z0-9À-ÖØ-öø-ÿĀ-ſ ._]+$'
  )
);
create unique index profiles_display_name_lower on public.profiles (lower(display_name));

-- Ist ein Name noch frei? Auch vor der Registrierung abfragbar (anon).
-- Der eigene Name zählt als frei, damit man ihn in den Einstellungen behalten kann.
create function public.name_available(n text) returns boolean
language sql security definer set search_path = public stable as $$
  select char_length(btrim(n)) between 3 and 30
    and btrim(n) ~ '^[A-Za-z0-9À-ÖØ-öø-ÿĀ-ſ ._]+$'
    and btrim(n) !~ '\s\s'
    and not exists (
      select 1 from profiles p
      where lower(p.display_name) = lower(btrim(n))
        and p.id is distinct from auth.uid()
    );
$$;

-- Fahrer per Namensanfang suchen (zum Einladen), nur angemeldet, höchstens 10 Treffer.
create function public.find_profiles(q text) returns table (id uuid, display_name text, car text)
language plpgsql security definer set search_path = public stable as $$
declare
  needle text := lower(btrim(coalesce(q, '')));
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  if char_length(needle) < 2 then
    return;
  end if;
  -- Platzhalter im Suchtext wörtlich nehmen
  needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.display_name, p.car
    from profiles p
    where p.display_name is not null
      and p.id <> auth.uid()
      and lower(p.display_name) like needle || '%'
    order by char_length(p.display_name), lower(p.display_name)
    limit 10;
end $$;

-- Fahrten: Größe der Gruppe ----------------------------------------------------
-- 6 Fahrzeuge inklusive Ersteller; eine spätere Enterprise Stufe erlaubt 20.
alter table public.rides
  add column max_members integer not null default 6 check (max_members between 2 and 20);

-- Die Gruppengröße setzt nur der Server: Fahrten dürfen nur bestimmte Spalten schreiben.
revoke insert, update on public.rides from authenticated;
grant insert (name, owner, tour_id, tour, starts_at, meeting_point, status) on public.rides to authenticated;
grant update (name, tour_id, tour, starts_at, meeting_point, status) on public.rides to authenticated;

-- Mitglieder: Einladung, Zusage, Absage und Fahrzeug -------------------------------
alter table public.ride_members
  add column status text not null default 'eingeladen' check (status in ('eingeladen', 'zugesagt', 'abgesagt')),
  add column vehicle text check (vehicle is null or char_length(vehicle) <= 80),
  add column responded_at timestamptz;
-- Wer bisher per Code beigetreten ist, war dabei
update public.ride_members set status = 'zugesagt';

create function public.is_ride_owner(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from rides x where x.id = r and x.owner = auth.uid());
$$;

-- Owner verteilt die Rollen (Lead, Schlusslicht, Mitfahrer) und entfernt Eingeladene.
create policy "Rollen ändern als Owner" on public.ride_members for update to authenticated
  using (public.is_ride_owner(ride_id)) with check (public.is_ride_owner(ride_id));
create policy "Mitglieder entfernen als Owner" on public.ride_members for delete to authenticated
  using (public.is_ride_owner(ride_id) and user_id <> auth.uid());
grant update (role) on public.ride_members to authenticated;

-- Wer eine Fahrt anlegt, ist Lead und hat zugesagt
create or replace function public.add_ride_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ride_members (ride_id, user_id, role, status, vehicle)
  values (new.id, new.owner, 'lead', 'zugesagt', (select p.car from profiles p where p.id = new.owner))
  on conflict (ride_id, user_id) do update set role = 'lead', status = 'zugesagt';
  return new;
end $$;

-- Beitreten per Code bleibt für ältere Versionen, die App nutzt es nicht mehr.
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
  if not exists (select 1 from ride_members m where m.ride_id = r and m.user_id = auth.uid())
     and (select count(*) from ride_members m where m.ride_id = r and m.status <> 'abgesagt') >= lim then
    raise exception 'Die Gruppe ist voll';
  end if;
  insert into ride_members (ride_id, user_id, status) values (r, auth.uid(), 'zugesagt')
  on conflict (ride_id, user_id) do update set status = 'zugesagt', responded_at = now();
  return r;
end $$;

-- Einladen: nur der Ersteller, höchstens max_members Fahrzeuge (Ersteller zählt mit).
create function public.invite_to_ride(ride uuid, member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
  v_ride_status text;
  v_member_status text;
  v_count integer;
  v_car text;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  -- Zeile sperren, damit zwei gleichzeitige Einladungen die Grenze nicht überschreiten
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
  if v_member_status is not null and v_member_status <> 'abgesagt' then
    raise exception 'Schon eingeladen';
  end if;
  select count(*) into v_count from ride_members m where m.ride_id = invite_to_ride.ride and m.status <> 'abgesagt';
  if v_count >= v_max then
    raise exception 'Die Gruppe ist voll (höchstens % Fahrzeuge)', v_max;
  end if;
  if v_member_status is null then
    insert into ride_members (ride_id, user_id, role, status, vehicle)
    values (invite_to_ride.ride, member, 'mitfahrer', 'eingeladen', v_car);
  else
    -- wer abgesagt hatte, wird neu eingeladen
    update ride_members m set status = 'eingeladen', responded_at = null
      where m.ride_id = invite_to_ride.ride and m.user_id = member;
  end if;
end $$;

-- Zusagen oder absagen (der Eingeladene selbst), dabei optional das Fahrzeug angeben.
create function public.respond_invite(ride uuid, accept boolean, my_vehicle text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_max integer;
  v_ride_status text;
  v_member_status text;
  v_count integer;
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
  if v_member_status is null then
    raise exception 'Keine Einladung für diese Fahrt';
  end if;
  if v_owner = auth.uid() and not coalesce(accept, false) then
    raise exception 'Als Ersteller kannst du nicht absagen';
  end if;
  if accept and v_member_status = 'abgesagt' then
    select count(*) into v_count from ride_members m where m.ride_id = respond_invite.ride and m.status <> 'abgesagt';
    if v_count >= v_max then
      raise exception 'Die Gruppe ist inzwischen voll';
    end if;
  end if;
  update ride_members m
    set status = case when accept then 'zugesagt' else 'abgesagt' end,
        vehicle = coalesce(left(nullif(btrim(my_vehicle), ''), 80), m.vehicle),
        responded_at = now()
    where m.ride_id = respond_invite.ride and m.user_id = auth.uid();
end $$;

-- Teilnehmer einer Fahrt mit Name, Fahrzeug, Status und Rolle (nur für Mitglieder und Owner).
create function public.ride_overview(ride uuid)
returns table (user_id uuid, display_name text, vehicle text, status text, role text, is_owner boolean)
language sql security definer set search_path = public stable as $$
  select m.user_id, p.display_name, coalesce(m.vehicle, p.car), m.status, m.role, m.user_id = x.owner
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = m.user_id
  where m.ride_id = ride_overview.ride
    and auth.uid() is not null
    and (x.owner = auth.uid()
      or exists (select 1 from ride_members me where me.ride_id = x.id and me.user_id = auth.uid()))
  order by (m.user_id = x.owner) desc, m.joined_at;
$$;

-- Eigene Einladungen und zugesagte Fahrten, die noch nicht beendet sind (ohne eigene Fahrten als Ersteller).
create function public.my_ride_invites()
returns table (ride_id uuid, name text, owner_name text, km numeric, ride_status text, my_status text, starts_at timestamptz, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select x.id, x.name, p.display_name,
    nullif(x.tour #>> '{tour,laenge_km}', '')::numeric,
    x.status, m.status, x.starts_at, x.created_at
  from ride_members m
  join rides x on x.id = m.ride_id
  left join profiles p on p.id = x.owner
  where m.user_id = auth.uid()
    and x.owner <> auth.uid()
    and m.status in ('eingeladen', 'zugesagt')
    and x.status <> 'beendet'
    and coalesce(x.starts_at, x.created_at) > now() - interval '2 days'
  order by x.created_at desc
  limit 20;
$$;

-- Rechte: Supabase gibt neuen Funktionen sonst automatisch anon und authenticated frei.
revoke all on function public.name_available(text) from public, anon, authenticated;
revoke all on function public.find_profiles(text) from public, anon, authenticated;
revoke all on function public.is_ride_owner(uuid) from public, anon, authenticated;
revoke all on function public.invite_to_ride(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_invite(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.ride_overview(uuid) from public, anon, authenticated;
revoke all on function public.my_ride_invites() from public, anon, authenticated;
revoke all on function public.join_ride(text) from public, anon;

grant execute on function public.name_available(text) to anon, authenticated;
grant execute on function public.find_profiles(text) to authenticated;
grant execute on function public.is_ride_owner(uuid) to authenticated;
grant execute on function public.invite_to_ride(uuid, uuid) to authenticated;
grant execute on function public.respond_invite(uuid, boolean, text) to authenticated;
grant execute on function public.ride_overview(uuid) to authenticated;
grant execute on function public.my_ride_invites() to authenticated;
grant execute on function public.join_ride(text) to authenticated;
