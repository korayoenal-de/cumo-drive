-- Kostenlose Version (Koray 14.11.)
--
-- Nach der Testphase bleibt die App offen. Ohne Mitgliedschaft gilt:
--  * Planen geht überall, Fahren nur im Heimatgebiet (Kreis von 150 km um einen festen Mittelpunkt).
--  * Gruppenfahrt mit höchstens drei Fahrern, ebenfalls nur im Heimatgebiet.
--  * Funk nur, wenn der Organisator der Fahrt die Mitgliedschaft hat; dann für die ganze Gruppe.
--  * Das Heimatgebiet legt man einmal fest und kann es danach ein einziges Mal ändern (gegen Missbrauch).
-- Die Mitgliedschaft (Test, Plan, Club) hebt alle Grenzen auf.

alter table public.profiles
  add column if not exists home_area_lat double precision,
  add column if not exists home_area_lon double precision,
  add column if not exists home_area_name text,
  add column if not exists home_area_changes smallint not null default 0,
  add column if not exists home_area_set_at timestamptz;
-- Schreiben nur über set_home_area

-- Berechtigung eines beliebigen Kontos (für Funk: der Organisator), Logik wie my_entitlement
create function public.entitlement_for(uid uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  club_name text;
  club_max int;
  club_until timestamptz;
  p_plan text;
  p_until timestamptz;
  trial_end timestamptz;
  h_lat double precision;
  h_lon double precision;
  h_name text;
  h_changes smallint;
  home json;
begin
  if uid is null then
    return json_build_object('active', false, 'source', 'test', 'until', null, 'max_vehicles', 0, 'club_name', null, 'home', null);
  end if;

  select pr.plan, pr.plan_until, pr.trial_ends_at, pr.home_area_lat, pr.home_area_lon, pr.home_area_name, pr.home_area_changes
    into p_plan, p_until, trial_end, h_lat, h_lon, h_name, h_changes
  from public.profiles pr where pr.id = uid;
  home := case when h_lat is null then null
    else json_build_object('lat', h_lat, 'lon', h_lon, 'name', h_name, 'changes', h_changes, 'radius_km', 150) end;

  select cl.name, cl.max_vehicles, cl.valid_until into club_name, club_max, club_until
  from public.club_members m
  join public.clubs cl on cl.id = m.club_id
  where m.user_id = uid and cl.valid_until > now()
  order by cl.max_vehicles desc, cl.valid_until desc
  limit 1;

  if club_until is not null then
    return json_build_object('active', true, 'source', 'club', 'until', club_until,
      'max_vehicles', club_max, 'club_name', club_name, 'home', home);
  end if;

  if p_plan is not null and p_until > now() then
    return json_build_object('active', true, 'source', 'plan', 'until', p_until,
      'max_vehicles', 6, 'club_name', null, 'home', home);
  end if;

  if trial_end is null then
    select u.created_at + interval '14 days' into trial_end from auth.users u where u.id = uid;
  end if;

  if trial_end > now() then
    return json_build_object('active', true, 'source', 'test', 'until', trial_end,
      'max_vehicles', 6, 'club_name', null, 'home', home);
  end if;

  -- kostenlos: drei Fahrzeuge, im Heimatgebiet
  if p_plan is not null and p_until is not null then
    return json_build_object('active', false, 'source', 'plan', 'until', p_until,
      'max_vehicles', 3, 'club_name', null, 'home', home);
  end if;

  return json_build_object('active', false, 'source', 'test', 'until', trial_end,
    'max_vehicles', 3, 'club_name', null, 'home', home);
end $$;
revoke all on function public.entitlement_for(uuid) from public, anon, authenticated;

create or replace function public.my_entitlement() returns json
language sql stable security definer set search_path = '' as $$
  select public.entitlement_for(auth.uid());
$$;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;

-- Heimatgebiet festlegen: das erste Mal frei, danach genau eine Änderung
create function public.set_home_area(lat double precision, lon double precision, place text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  cur_lat double precision;
  cur_changes smallint;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden.' using errcode = 'P0001';
  end if;
  if lat is null or lon is null or lat not between -90 and 90 or lon not between -180 and 180 then
    raise exception 'Dieser Ort passt nicht.' using errcode = 'P0001';
  end if;
  select home_area_lat, home_area_changes into cur_lat, cur_changes from profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Lege zuerst dein Profil an.' using errcode = 'P0001';
  end if;
  if cur_lat is not null and cur_changes >= 1 then
    raise exception 'Dein Heimatgebiet hast du schon einmal geändert. Mit der Mitgliedschaft fährst du überall.' using errcode = 'P0001';
  end if;
  update profiles set
    home_area_lat = round(set_home_area.lat::numeric, 3)::double precision,
    home_area_lon = round(set_home_area.lon::numeric, 3)::double precision,
    home_area_name = left(nullif(btrim(place), ''), 80),
    home_area_changes = case when cur_lat is null then 0 else cur_changes + 1 end,
    home_area_set_at = now()
  where id = auth.uid();
  return public.entitlement_for(auth.uid());
end $$;
revoke all on function public.set_home_area(double precision, double precision, text) from public, anon;
grant execute on function public.set_home_area(double precision, double precision, text) to authenticated;

-- Funk in einer Fahrt: dabei (Organisator oder zugesagt) und der Organisator hat die Mitgliedschaft
create function public.ride_funk_allowed(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_chat(r)
    and coalesce((public.entitlement_for((select x.owner from rides x where x.id = r)) ->> 'active')::boolean, false);
$$;
revoke all on function public.ride_funk_allowed(uuid) from public, anon;
grant execute on function public.ride_funk_allowed(uuid) to authenticated;
