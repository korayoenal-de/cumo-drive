-- Chats der Ausfahrten unter Nachrichten (Koray 18.11.)
--
-- Bisher war der Chat einer Ausfahrt nur über die Ausfahrt erreichbar. Jetzt stehen diese Chats in der Liste der
-- Nachrichten neben den Unterhaltungen mit einzelnen Fahrern, neueste oben, mit Zahl der ungelesenen.
--  * ride_chat_seen merkt je Konto und Ausfahrt, bis wann gelesen wurde. Direkt liest und schreibt niemand.
--  * my_ride_chats liefert die Chats, die ich lesen darf (can_chat) und in denen schon etwas steht.
--  * unread_ride_messages zählt für die Plakette am Community Tab. Eigene Funktion, damit ältere Apps und der
--    Web Planer, die Chats noch nicht als gelesen melden, keine Plakette bekommen, die nie verschwindet.
--  * Zum Start gilt alles Bisherige als gelesen, sonst hätten alle auf einmal alte Chats als neu.

create table public.ride_chat_seen (
  ride_id uuid not null references public.rides (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);
alter table public.ride_chat_seen enable row level security;
-- keine Policy: nur die Funktionen unten kommen heran
revoke all on public.ride_chat_seen from anon, authenticated;

insert into public.ride_chat_seen (ride_id, user_id)
select x.id, x.owner from public.rides x
  where x.owner is not null and exists (select 1 from public.ride_messages m where m.ride_id = x.id)
union
select m.ride_id, m.user_id from public.ride_members m
  where m.status = 'zugesagt' and exists (select 1 from public.ride_messages c where c.ride_id = m.ride_id)
on conflict do nothing;

create function public.ride_chat_mark_seen(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_chat(ride) then
    return;
  end if;
  insert into ride_chat_seen (ride_id, user_id, seen_at) values (ride, auth.uid(), now())
  on conflict (ride_id, user_id) do update set seen_at = excluded.seen_at;
end $$;
revoke all on function public.ride_chat_mark_seen(uuid) from public, anon;
grant execute on function public.ride_chat_mark_seen(uuid) to authenticated;

create function public.my_ride_chats()
returns table (ride uuid, name text, starts_at timestamptz, last_body text, last_at timestamptz, last_from_me boolean, last_name text, unread integer)
language sql security definer set search_path = public stable as $$
  with mine as (
    select x.id, x.name, x.starts_at from rides x
    where auth.uid() is not null
      and (x.owner = auth.uid()
        or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = auth.uid() and m.status = 'zugesagt'))
  ), last as (
    select distinct on (c.ride_id) c.ride_id, c.body, c.created_at, c.user_id
    from ride_messages c join mine on mine.id = c.ride_id
    order by c.ride_id, c.created_at desc
  )
  select mine.id, mine.name, mine.starts_at, l.body, l.created_at, l.user_id = auth.uid(), p.display_name,
    (select count(*)::integer from ride_messages c
      where c.ride_id = mine.id and c.user_id <> auth.uid()
        and c.created_at > coalesce((select s.seen_at from ride_chat_seen s where s.ride_id = mine.id and s.user_id = auth.uid()), '-infinity'))
  from mine
  join last l on l.ride_id = mine.id
  left join profiles p on p.id = l.user_id
  order by l.created_at desc
  limit 100;
$$;
revoke all on function public.my_ride_chats() from public, anon;
grant execute on function public.my_ride_chats() to authenticated;

create function public.unread_ride_messages() returns integer
language sql security definer set search_path = public stable as $$
  select count(*)::integer
  from ride_messages c
  join rides x on x.id = c.ride_id
  where auth.uid() is not null
    and c.user_id <> auth.uid()
    and (x.owner = auth.uid()
      or exists (select 1 from ride_members m where m.ride_id = x.id and m.user_id = auth.uid() and m.status = 'zugesagt'))
    and c.created_at > coalesce((select s.seen_at from ride_chat_seen s where s.ride_id = c.ride_id and s.user_id = auth.uid()), '-infinity');
$$;
revoke all on function public.unread_ride_messages() from public, anon;
grant execute on function public.unread_ride_messages() to authenticated;
