-- Heimatgebiet der kostenlosen Version: 120 km statt 150 km (Koray 19.11.2026).
-- Der Radius steht nur in entitlement_for, die App übernimmt ihn von dort. Sonst ist die Funktion unverändert.

create or replace function public.entitlement_for(uid uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  club_name text;
  club_max int;
  club_until timestamptz;
  p_plan text;
  p_until timestamptz;
  t record;
  h_lat double precision;
  h_lon double precision;
  h_name text;
  h_changes smallint;
  home json;
  live boolean := public.limits_live();
begin
  if uid is null then
    return json_build_object('active', false, 'source', 'test', 'until', null, 'max_vehicles', 0, 'club_name', null, 'home', null, 'limits', live);
  end if;

  select pr.plan, pr.plan_until, pr.home_area_lat, pr.home_area_lon, pr.home_area_name, pr.home_area_changes
    into p_plan, p_until, h_lat, h_lon, h_name, h_changes
  from public.profiles pr where pr.id = uid;
  home := case when h_lat is null then null
    else json_build_object('lat', h_lat, 'lon', h_lon, 'name', h_name, 'changes', h_changes, 'radius_km', 120) end;

  select cl.name, cl.max_vehicles, cl.valid_until into club_name, club_max, club_until
  from public.club_members m
  join public.clubs cl on cl.id = m.club_id
  where m.user_id = uid and cl.valid_until > now()
  order by cl.max_vehicles desc, cl.valid_until desc
  limit 1;

  if club_until is not null then
    return json_build_object('active', true, 'source', 'club', 'until', club_until,
      'max_vehicles', club_max, 'club_name', club_name, 'home', home, 'limits', live);
  end if;

  if p_plan is not null and p_until > now() then
    return json_build_object('active', true, 'source', 'plan', 'until', p_until,
      'max_vehicles', 6, 'club_name', null, 'home', home, 'limits', live);
  end if;

  select * into t from public.trial_for(uid);
  if t.src = 'vorstart' or t.until > now() then
    return json_build_object('active', true, 'source', t.src, 'until', t.until,
      'max_vehicles', 6, 'club_name', null, 'home', home, 'limits', live);
  end if;

  -- kostenlos: drei Fahrzeuge, im Heimatgebiet
  if p_plan is not null and p_until is not null then
    return json_build_object('active', false, 'source', 'plan', 'until', p_until,
      'max_vehicles', 3, 'club_name', null, 'home', home, 'limits', live);
  end if;

  return json_build_object('active', false, 'source', t.src, 'until', t.until,
    'max_vehicles', 3, 'club_name', null, 'home', home, 'limits', live);
end $$;
