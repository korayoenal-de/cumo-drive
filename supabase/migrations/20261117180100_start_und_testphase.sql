-- Gründungstester und Testphase (Koray 16.11., ohne Startphase seit 17.11.)
--
-- Ein einziger Wert steuert alles: public.app_launch.release_at, der Release Tag. Solange er leer ist, ist für alle
-- alles frei und die Grenzen der kostenlosen Version schlafen. Am Release Tag trägt der Betreiber ihn ein:
--   update public.app_launch set release_at = '2026-12-01 00:00+01';
--
-- Danach gilt je Konto, gemessen am Anlegen des Kontos:
--  * vor dem Release Tag angelegt: Gründungstester, 12 Monate ab Release alles frei
--  * ab dem Release Tag angelegt: 14 Tage Testphase ab Anlegen, danach die kostenlose Version
-- Die 30 Tage Startphase entfällt (Koray 17.11.: es gibt den kostenlosen Plan). Jedes Konto bekommt genau eine Phase.
-- profiles.trial_ends_at wird dafür nicht mehr gelesen (es stünde sonst bei spät im Startfenster
-- angelegten Konten über dem Stichtag).

create table if not exists public.app_launch (
  id boolean primary key default true check (id),
  release_at timestamptz
);
insert into public.app_launch (id, release_at) values (true, null) on conflict (id) do nothing;
alter table public.app_launch enable row level security;
revoke all on public.app_launch from anon, authenticated;

create or replace function public.release_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select l.release_at from public.app_launch l where l.id;
$$;
revoke all on function public.release_at() from public, anon, authenticated;

-- Phase eines Kontos: vorstart, gruender, start oder test, mit Ende (vorstart ohne Ende)
create or replace function public.trial_for(uid uuid, out src text, out until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  rel timestamptz := public.release_at();
  created timestamptz;
begin
  select u.created_at into created from auth.users u where u.id = uid;
  created := coalesce(created, now());
  if rel is null then
    src := 'vorstart';
    until := null;
  elsif created < rel then
    src := 'gruender';
    until := rel + interval '12 months';
  else
    src := 'test';
    until := created + interval '14 days';
  end if;
end $$;
revoke all on function public.trial_for(uuid) from public, anon, authenticated;

-- Die Grenzen der kostenlosen Version gelten ab dem Release Tag (vorher stumm)
create or replace function public.limits_live() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(now() >= public.release_at(), false);
$$;
grant execute on function public.limits_live() to authenticated;

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
    else json_build_object('lat', h_lat, 'lon', h_lon, 'name', h_name, 'changes', h_changes, 'radius_km', 150) end;

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
revoke all on function public.entitlement_for(uuid) from public, anon, authenticated;

-- Die Startphase von 30 Tagen (Migration 20261117170000) entfällt wieder: trial_length liefert nur noch 14 Tage.
-- profiles.trial_ends_at wird nicht mehr gelesen, die Phase rechnet trial_for.
create or replace function public.trial_length(created timestamptz) returns interval
language sql immutable as $$ select interval '14 days' $$;
