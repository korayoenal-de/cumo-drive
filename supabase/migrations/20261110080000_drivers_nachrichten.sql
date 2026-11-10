-- Drivers und Nachrichten (Koray 10.11.): Mitglieder stehen mit ihrem Wohnort auf der Community
-- Karte. Im Profil: Wohnort, ob man angeschrieben werden darf, ob andere den Fuhrpark sehen.
-- Dazu private Nachrichten zwischen zwei Fahrern.

-- Profil: Wohnort und Einstellungen ------------------------------------------------------------
alter table public.profiles
  add column home_name text check (home_name is null or char_length(home_name) <= 80),
  add column home_lat double precision check (home_lat is null or home_lat between -90 and 90),
  add column home_lon double precision check (home_lon is null or home_lon between -180 and 180),
  add column allow_messages boolean not null default true,
  add column show_garage boolean not null default true;

-- Wohnort nur auf etwa 1 km genau speichern (Ortsmitte, keine Adresse)
create function public.round_home() returns trigger
language plpgsql set search_path = public as $$
begin
  new.home_lat := round(new.home_lat::numeric, 2)::double precision;
  new.home_lon := round(new.home_lon::numeric, 2)::double precision;
  if new.home_lat is null or new.home_lon is null then
    new.home_lat := null;
    new.home_lon := null;
  end if;
  return new;
end $$;
create trigger profiles_round_home before insert or update of home_lat, home_lon on public.profiles
  for each row execute function public.round_home();

-- Fremde Konten lesen die Garage nicht mehr direkt, nur über community_drivers (beachtet show_garage).
revoke select on public.profiles from authenticated;
grant select (id, display_name, car, created_at, home_name, home_lat, home_lon, allow_messages, show_garage) on public.profiles to authenticated;

-- Eigene Garage für den Abgleich auf dem Gerät
create function public.my_vehicles() returns jsonb
language sql security definer set search_path = public stable as $$
  select coalesce((select p.vehicles from profiles p where p.id = auth.uid()), '[]'::jsonb);
$$;

-- Drivers für die Karte und die Liste --------------------------------------------------------
create function public.community_drivers()
returns table (id uuid, display_name text, car text, home_name text, home_lat double precision, home_lon double precision,
  allow_messages boolean, garage jsonb, member_since timestamptz, is_me boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.car, p.home_name, p.home_lat, p.home_lon, p.allow_messages,
    case when p.show_garage or p.id = auth.uid() then
      coalesce((select jsonb_agg(jsonb_build_object('brand', v -> 'brand', 'model', v -> 'model', 'look', v -> 'look'))
        from jsonb_array_elements(case when jsonb_typeof(p.vehicles) = 'array' then p.vehicles else '[]'::jsonb end) v), '[]'::jsonb)
    else null end,
    p.created_at, p.id = auth.uid()
  from profiles p
  where auth.uid() is not null and p.display_name is not null
  order by p.display_name
  limit 3000;
$$;

-- Private Nachrichten ------------------------------------------------------------------------
create table public.direct_messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender <> recipient)
);
create index direct_messages_pair on public.direct_messages (least(sender, recipient), greatest(sender, recipient), created_at);
create index direct_messages_unread on public.direct_messages (recipient) where read_at is null;
alter table public.direct_messages enable row level security;

-- Anschreiben erlaubt, wenn der andere es zulässt oder selbst schon geschrieben hat (Antworten gehen immer)
create function public.can_message(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select auth.uid() is not null and r <> auth.uid()
    and exists (select 1 from profiles p where p.id = r and p.display_name is not null)
    and (
      exists (select 1 from profiles p where p.id = r and p.allow_messages)
      or exists (select 1 from direct_messages m where m.sender = r and m.recipient = auth.uid())
    );
$$;

create policy "Eigene Nachrichten lesen" on public.direct_messages for select to authenticated
  using (sender = auth.uid() or recipient = auth.uid());
create policy "Nachricht schreiben" on public.direct_messages for insert to authenticated
  with check (sender = auth.uid() and public.can_message(recipient));
create policy "Eigene Nachricht löschen" on public.direct_messages for delete to authenticated using (sender = auth.uid());
grant select, delete on public.direct_messages to authenticated;
grant insert (recipient, body) on public.direct_messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when others then
  null;
end $$;

-- Gelesen markieren (alle Nachrichten von partner an mich)
create function public.mark_read(partner uuid) returns void
language sql security definer set search_path = public as $$
  update direct_messages m set read_at = now()
  where m.recipient = auth.uid() and m.sender = partner and m.read_at is null;
$$;

-- Unterhaltungen: je Partner die letzte Nachricht und ungelesene
create function public.my_conversations()
returns table (partner uuid, display_name text, car text, last_body text, last_at timestamptz, last_from_me boolean, unread integer, can_reply boolean)
language sql security definer set search_path = public stable as $$
  with mine as (
    select case when m.sender = auth.uid() then m.recipient else m.sender end as partner, m.*
    from direct_messages m
    where auth.uid() is not null and (m.sender = auth.uid() or m.recipient = auth.uid())
  ), last as (
    select distinct on (partner) partner, body, created_at, sender = auth.uid() as from_me
    from mine order by partner, created_at desc
  )
  select l.partner, p.display_name, p.car, l.body, l.created_at, l.from_me,
    (select count(*)::integer from mine x where x.partner = l.partner and x.recipient = auth.uid() and x.read_at is null),
    public.can_message(l.partner)
  from last l
  left join profiles p on p.id = l.partner
  order by l.created_at desc
  limit 200;
$$;

create function public.unread_messages() returns integer
language sql security definer set search_path = public stable as $$
  select count(*)::integer from direct_messages m where m.recipient = auth.uid() and m.read_at is null;
$$;

-- Rechte -----------------------------------------------------------------------------------
revoke all on function public.round_home() from public, anon, authenticated;
revoke all on function public.my_vehicles() from public, anon, authenticated;
revoke all on function public.community_drivers() from public, anon, authenticated;
revoke all on function public.can_message(uuid) from public, anon, authenticated;
revoke all on function public.mark_read(uuid) from public, anon, authenticated;
revoke all on function public.my_conversations() from public, anon, authenticated;
revoke all on function public.unread_messages() from public, anon, authenticated;
grant execute on function public.my_vehicles() to authenticated;
grant execute on function public.community_drivers() to authenticated;
grant execute on function public.can_message(uuid) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.unread_messages() to authenticated;
