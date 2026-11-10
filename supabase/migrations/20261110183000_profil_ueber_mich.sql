-- Profil in den Einstellungen (Koray 10.11.): kurzer Text "Über mich", sichtbar unter Drivers.
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 160);
grant select (bio) on public.profiles to authenticated;

drop function if exists public.community_drivers();
create function public.community_drivers()
returns table (id uuid, display_name text, car text, home_name text, home_lat double precision, home_lon double precision,
  allow_messages boolean, garage jsonb, member_since timestamptz, is_me boolean, bio text)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.car, p.home_name, p.home_lat, p.home_lon, p.allow_messages,
    case when p.show_garage or p.id = auth.uid() then
      coalesce((select jsonb_agg(jsonb_build_object('brand', v -> 'brand', 'model', v -> 'model', 'look', v -> 'look'))
        from jsonb_array_elements(case when jsonb_typeof(p.vehicles) = 'array' then p.vehicles else '[]'::jsonb end) v), '[]'::jsonb)
    else null end,
    p.created_at, p.id = auth.uid(), p.bio
  from profiles p
  where auth.uid() is not null and p.display_name is not null
  order by p.display_name
  limit 3000;
$$;
revoke all on function public.community_drivers() from public, anon, authenticated;
grant execute on function public.community_drivers() to authenticated;
