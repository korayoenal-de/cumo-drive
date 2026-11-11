-- Koray 11.11.: statt Alter der Geburtstag (TT.MM.JJJJ), freiwillig. Das Datum selbst sieht niemand außer dir:
-- profiles ist für Eingeloggte lesbar, darum bekommt birth_date keine Spaltenfreigabe. Die eigene Angabe liest
-- my_birth_date(), Drivers bekommt nur das Alter oder "hat heute Geburtstag", je nach birthday_show.
alter table public.profiles add column if not exists birth_date date
  check (birth_date is null or (birth_date >= date '1920-01-01' and birth_date <= (current_date - interval '16 years')::date));
alter table public.profiles add column if not exists birthday_show text not null default 'age'
  check (birthday_show in ('age', 'birthday', 'none'));
grant select (birthday_show) on public.profiles to authenticated;

-- der Jahrgang von heute Mittag entfällt (war für alle lesbar)
revoke select (birth_year) on public.profiles from authenticated;

create or replace function public.my_birth_date()
returns date language sql security definer set search_path = public stable as $$
  select birth_date from profiles where id = auth.uid();
$$;
revoke all on function public.my_birth_date() from public, anon, authenticated;
grant execute on function public.my_birth_date() to authenticated;

-- Geburtstag heute (Zeitzone Berlin); wer am 29.2. Geburtstag hat, feiert in anderen Jahren am 28.2.
create or replace function public.is_birthday(d date)
returns boolean language sql stable set search_path = public as $$
  select case
    when d is null then false
    else to_char(d, 'MMDD') = to_char((now() at time zone 'Europe/Berlin')::date, 'MMDD')
      or (to_char(d, 'MMDD') = '0229' and to_char((now() at time zone 'Europe/Berlin')::date, 'MMDD') = '0228'
        and extract(day from (date_trunc('year', now() at time zone 'Europe/Berlin') + interval '1 month 28 days')) <> 29)
  end;
$$;

drop function if exists public.community_drivers();
create function public.community_drivers()
returns table (id uuid, display_name text, car text, home_name text, home_lat double precision, home_lon double precision,
  allow_messages boolean, garage jsonb, member_since timestamptz, is_me boolean, bio text, age smallint, birthday_today boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.car, p.home_name, p.home_lat, p.home_lon, p.allow_messages,
    case when p.show_garage or p.id = auth.uid() then
      coalesce((select jsonb_agg(jsonb_build_object('brand', v -> 'brand', 'model', v -> 'model', 'look', v -> 'look'))
        from jsonb_array_elements(case when jsonb_typeof(p.vehicles) = 'array' then p.vehicles else '[]'::jsonb end) v), '[]'::jsonb)
    else null end,
    p.created_at, p.id = auth.uid(), p.bio,
    case when p.birthday_show = 'age' and p.birth_date is not null
      then extract(year from age((now() at time zone 'Europe/Berlin')::date, p.birth_date))::smallint end,
    p.birthday_show <> 'none' and public.is_birthday(p.birth_date)
  from profiles p
  where auth.uid() is not null and p.display_name is not null and (p.show_in_drivers or p.id = auth.uid())
  order by p.display_name
  limit 3000;
$$;
revoke all on function public.community_drivers() from public, anon, authenticated;
grant execute on function public.community_drivers() to authenticated;
