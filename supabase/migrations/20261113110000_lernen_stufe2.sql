-- Lernen Stufe 2 (Backlog, Koray 13.11.): nächtliche Auswertung der Signale aus Planen und Fahren.
--
-- Eingang: route_signals (geplant, gespeichert, übernommen, losgefahren, neu gewürfelt, gelöscht, veröffentlicht)
-- und gefahrene Fahrten (drives.track) mit ihrer Bewertung. Ausgang: learned_cells, je Rasterzelle von etwa
-- 330 m mal 330 m ein Wert, wie gern Fahrer dort unterwegs sind. Später zieht die Planung gute Zellen an und
-- meidet schlechte, der Fahrspaß Pegel kann daraus nachgeführt werden.
--
-- Datenschutz (Datenschutzerklärung, Abschnitt Verbesserung der Strecken):
--  * Eine Zelle zählt erst, wenn mindestens drei verschiedene Fahrer dort Signale haben.
--  * Je Fahrer und Zelle zählt höchstens ein begrenzter Beitrag, einer allein kann nichts kippen.
--  * Gefahrene Spuren verlieren die ersten und letzten 2 km (kein Rückschluss auf die Haustür);
--    die Signale der Planung kommen schon so gekürzt an.
--  * learned_cells enthält nur Zelle, Zahl der Fahrer und Wert, keine Personen und keine Spuren.

create table if not exists public.learned_cells (
  cx integer not null,
  cy integer not null,
  users integer not null,
  score numeric(5, 2) not null,
  driven integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (cx, cy)
);
alter table public.learned_cells enable row level security;
create policy "Gelernte Zellen lesen" on public.learned_cells for select to authenticated using (true);
grant select on public.learned_cells to authenticated;

-- Polyline (Genauigkeit 5) zu Punkten
create or replace function public.decode_polyline(t text)
returns table (n integer, lat double precision, lon double precision)
language plpgsql immutable as $$
declare
  i integer := 1;
  len integer := coalesce(length(t), 0);
  la bigint := 0;
  lo bigint := 0;
  k integer;
  b integer;
  shift integer;
  res bigint;
  d bigint;
begin
  n := 0;
  while i <= len loop
    for k in 0..1 loop
      shift := 0;
      res := 0;
      loop
        exit when i > len;
        b := ascii(substr(t, i, 1)) - 63;
        i := i + 1;
        res := res | ((b & 31)::bigint << shift);
        shift := shift + 5;
        exit when b < 32;
      end loop;
      d := case when (res & 1) = 1 then ~(res >> 1) else res >> 1 end;
      if k = 0 then la := la + d; else lo := lo + d; end if;
    end loop;
    n := n + 1;
    lat := la / 1e5;
    lon := lo / 1e5;
    return next;
  end loop;
end $$;

-- Zellen einer Linie, ohne die ersten und letzten trim_m Meter, jede Zelle einmal
create or replace function public.line_cells(t text, trim_m double precision default 0)
returns table (cx integer, cy integer)
language sql immutable as $$
  with p as (
    select n, lat, lon from public.decode_polyline(t)
  ), d as (
    select n, lat, lon,
      coalesce(sum(seg) over (order by n), 0) as along
    from (
      select n, lat, lon,
        coalesce(111195 * sqrt(power(lat - lag(lat) over (order by n), 2)
          + power((lon - lag(lon) over (order by n)) * cos(radians(lat)), 2)), 0) as seg
      from p
    ) s
  ), m as (select max(along) as total from d)
  select distinct floor(d.lon / 0.0045)::integer, floor(d.lat / 0.003)::integer
  from d, m
  where d.along >= trim_m and d.along <= m.total - trim_m;
$$;

-- Nächtliche Auswertung: alles neu rechnen (24 Monate Signale, Fahrten der letzten 24 Monate)
create or replace function public.learn_nightly() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  create temporary table if not exists learn_in (user_id uuid, cx integer, cy integer, w numeric, driven boolean) on commit drop;
  truncate learn_in;

  -- Planung: Behalten und Losfahren zählt positiv, Verwerfen negativ, bloßes Planen neutral
  insert into learn_in
  select s.user_id, c.cx, c.cy,
    case s.kind
      when 'losgefahren' then 3 when 'veroeffentlicht' then 3 when 'gespeichert' then 2 when 'uebernommen' then 2
      when 'neu_gewuerfelt' then -1 when 'geloescht' then -2 else 0 end,
    false
  from route_signals s, lateral public.line_cells(s.line, 0) c
  where s.line is not null and s.created_at > now() - interval '24 months';

  -- Fahrten: gefahren zählt, die Bewertung verstärkt oder kehrt um
  insert into learn_in
  select d.owner, c.cx, c.cy,
    2 + case when d.rating_score is null then 0 when d.rating_score >= 80 then 2 when d.rating_score < 40 then -4 else 0 end,
    true
  from drives d, lateral public.line_cells(d.track, 2000) c
  where d.track is not null and d.started_at > now() - interval '24 months';

  -- je Fahrer und Zelle begrenzt, je Zelle erst ab drei Fahrern
  delete from learned_cells;
  insert into learned_cells (cx, cy, users, score, driven, updated_at)
  select cx, cy, count(*)::integer, round(avg(w), 2), sum(case when driven then 1 else 0 end)::integer, now()
  from (
    select user_id, cx, cy, greatest(-3, least(5, sum(w))) as w, bool_or(driven) as driven
    from learn_in group by user_id, cx, cy
  ) per_user
  group by cx, cy
  having count(*) >= 3;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.learn_nightly() from public, anon, authenticated;

-- Für die App und die Planung: Zellen in einem Rechteck (höchstens 5000)
create or replace function public.learned_cells_in(s double precision, w double precision, n double precision, e double precision)
returns table (cx integer, cy integer, users integer, score numeric)
language sql stable security definer set search_path = public as $$
  select cx, cy, users, score from learned_cells
  where cy between floor(s / 0.003) and floor(n / 0.003) and cx between floor(w / 0.0045) and floor(e / 0.0045)
  limit 5000;
$$;
revoke all on function public.learned_cells_in(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.learned_cells_in(double precision, double precision, double precision, double precision) to authenticated;

-- jede Nacht um 3:41 (UTC), wenn pg_cron da ist
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('learn-nightly', '41 3 * * *', 'select public.learn_nightly()');
  end if;
exception when others then
  raise notice 'pg_cron nicht verfügbar: %', sqlerrm;
end $$;
