-- Kontingent für kuratierte Strecken im Web Planer (Koray 17.11., Sicherheitskonzept Maßnahme 5).
-- Die Edge Function road-data liefert Strecken nur noch kachelweise (halbe Grad). Je Konto und Tag höchstens 60 neue
-- Kacheln mit Daten; dieselbe Kachel am selben Tag noch einmal zählt nicht. Ein Planungstag braucht meist 10 bis 30,
-- eine Route Frankfurt nach Nizza etwa 40. Die ganze Datenbank (rund 225 Kacheln) braucht so mehrere Tage.
-- Einträge älter als 30 Tage werden gelöscht; die Tabelle dient auch dem Alarm bei auffälligen Konten.

create table if not exists public.road_data_tiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Berlin')::date,
  tile text not null,
  primary key (user_id, day, tile)
);
alter table public.road_data_tiles enable row level security;

create or replace function public.road_data_take(tiles text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Europe/Berlin')::date;
  have text[];
  room integer;
  fresh text[];
begin
  if me is null then
    raise exception 'Bitte anmelden.' using errcode = 'P0001';
  end if;
  if random() < 0.01 then
    delete from road_data_tiles where day < today - 30;
  end if;
  select coalesce(array_agg(t.tile), '{}') into have from road_data_tiles t where t.user_id = me and t.day = today;
  room := greatest(0, 60 - coalesce(array_length(have, 1), 0));
  select coalesce(array_agg(x), '{}') into fresh from (
    select distinct x from unnest(tiles) as x where not (x = any(have)) limit room
  ) s;
  insert into road_data_tiles (user_id, day, tile) select me, today, x from unnest(fresh) as x on conflict do nothing;
  return array(select x from unnest(tiles) as x where x = any(have) or x = any(fresh));
end $$;

revoke all on function public.road_data_take(text[]) from public, anon;
grant execute on function public.road_data_take(text[]) to authenticated;
