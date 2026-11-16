-- Einladungen und „Läuft jetzt“ (Tester Matthias 15.11.): die Jungfernfahrt vom Vortag stand am Morgen noch als
-- laufend da, weil my_ride_invites nur den Status 'beendet' und zwei Tage Alter prüfte. Jetzt gilt dieselbe Regel
-- wie in den Listen: vorbei ist eine Fahrt auch drei Stunden nach der geplanten Rückkehr oder um Mitternacht.
create or replace function public.my_ride_invites()
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
    and not public.ride_is_over(x.status, x.starts_at, nullif(x.tour ->> 'minutes', '')::numeric::integer)
    and coalesce(x.starts_at, x.created_at) > now() - interval '2 days'
  order by x.created_at desc
  limit 20;
$$;
revoke all on function public.my_ride_invites() from public, anon, authenticated;
grant execute on function public.my_ride_invites() to authenticated;
