-- Koray 12.11.: Schutz vor Missbrauch der Chats, Stufe 1.
-- Melden (mit Kopie des Inhalts zum Zeitpunkt der Meldung), Blockieren, Prüfbereich für Admins,
-- Sperren von Konten, Hinweise an Betroffene mit Begründung und Hürden für neue Konten.

-- Admins ------------------------------------------------------------------------------------
create table public.app_admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.app_admins enable row level security;
insert into public.app_admins (user_id)
  select id from auth.users where id = '5e981c05-a751-44b3-8506-7595e5f5d299'
  on conflict do nothing;

create function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from app_admins a where a.user_id = auth.uid());
$$;

-- Sperre am Profil (für andere nicht lesbar) ----------------------------------------------------
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_reason text check (ban_reason is null or char_length(ban_reason) <= 300);

create function public.is_banned(u uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select p.banned_at is not null from profiles p where p.id = u), false);
$$;

-- Blockieren ----------------------------------------------------------------------------------
create table public.blocks (
  blocker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy "Eigene Blockierungen lesen" on public.blocks for select to authenticated using (blocker = auth.uid());
create policy "Blockieren" on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy "Blockierung aufheben" on public.blocks for delete to authenticated using (blocker = auth.uid());
grant select, delete on public.blocks to authenticated;
grant insert (blocked) on public.blocks to authenticated;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a));
$$;

create function public.my_blocks()
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select b.blocked, p.display_name, b.created_at
  from blocks b left join profiles p on p.id = b.blocked
  where b.blocker = auth.uid()
  order by b.created_at desc;
$$;

-- Anschreiben: zusätzlich nicht blockiert und nicht gesperrt ----------------------------------------
create or replace function public.can_message(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select auth.uid() is not null and r <> auth.uid()
    and not public.is_banned(auth.uid()) and not public.is_banned(r)
    and not public.is_blocked_between(auth.uid(), r)
    and exists (select 1 from profiles p where p.id = r and p.display_name is not null)
    and (
      exists (select 1 from profiles p where p.id = r and p.allow_messages)
      or exists (select 1 from direct_messages m where m.sender = r and m.recipient = auth.uid())
    );
$$;

-- Gemeinsame Fahrt (zugesagt oder Veranstalter in derselben Fahrt)
create function public.share_ride(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  with mine as (
    select id as ride_id from rides where owner = a
    union select ride_id from ride_members where user_id = a and status = 'zugesagt'
  ), theirs as (
    select id as ride_id from rides where owner = b
    union select ride_id from ride_members where user_id = b and status = 'zugesagt'
  )
  select exists (select 1 from mine join theirs using (ride_id));
$$;

-- Hürden für neue Gespräche: Konto älter als 24 Stunden oder gemeinsame Fahrt,
-- höchstens fünf neue Gespräche in 24 Stunden. Antworten gehen immer.
create function public.dm_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  replying boolean;
  had boolean;
  fresh integer;
  joined timestamptz;
begin
  if public.is_banned(new.sender) then
    raise exception 'Dein Konto ist gesperrt. Nachrichten kannst du gerade nicht senden.' using errcode = 'P0001';
  end if;
  select exists (select 1 from direct_messages m where m.sender = new.recipient and m.recipient = new.sender) into replying;
  select exists (select 1 from direct_messages m where m.sender = new.sender and m.recipient = new.recipient) into had;
  if replying or had then
    return new;
  end if;
  select created_at into joined from profiles where id = new.sender;
  if (joined is null or joined > now() - interval '24 hours') and not public.share_ride(new.sender, new.recipient) then
    raise exception 'Neue Konten können andere erst nach 24 Stunden anschreiben, außer ihr fahrt gemeinsam.' using errcode = 'P0001';
  end if;
  select count(*) into fresh from (
    select m.recipient from direct_messages m
    where m.sender = new.sender
    group by m.recipient
    having min(m.created_at) > now() - interval '24 hours'
      and not exists (select 1 from direct_messages o where o.sender = m.recipient and o.recipient = new.sender and o.created_at < min(m.created_at))
  ) x;
  if fresh >= 5 then
    raise exception 'Du hast heute schon fünf neue Gespräche begonnen. Morgen geht es weiter.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger direct_messages_guard before insert on public.direct_messages for each row execute function public.dm_guard();

create function public.ride_message_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_banned(new.user_id) then
    raise exception 'Dein Konto ist gesperrt. Nachrichten kannst du gerade nicht senden.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ride_messages_guard before insert on public.ride_messages for each row execute function public.ride_message_guard();

-- Unterhaltungen ohne blockierte Partner -------------------------------------------------------
create or replace function public.my_conversations()
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
  where not exists (select 1 from blocks b where b.blocker = auth.uid() and b.blocked = l.partner)
  order by l.created_at desc
  limit 200;
$$;

create or replace function public.unread_messages() returns integer
language sql security definer set search_path = public stable as $$
  select count(*)::integer from direct_messages m
  where m.recipient = auth.uid() and m.read_at is null
    and not exists (select 1 from blocks b where b.blocker = auth.uid() and b.blocked = m.sender);
$$;

-- Drivers ohne gesperrte und ohne blockierte Konten (Stand Geburtstag 11.11.) -----------------------
create or replace function public.community_drivers()
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
    and (p.banned_at is null or p.id = auth.uid())
    and not public.is_blocked_between(auth.uid(), p.id)
  order by p.display_name
  limit 3000;
$$;

-- Meldungen -----------------------------------------------------------------------------------
create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references auth.users (id) on delete cascade,
  target uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('direct_message', 'ride_message', 'profile', 'tour', 'ausfahrt')),
  ref text not null check (char_length(ref) <= 80),
  reason text not null check (reason in ('illegal', 'spam', 'belaestigung', 'betrug', 'anderes')),
  note text check (note is null or char_length(note) <= 500),
  snapshot text,
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  resolution text check (resolution is null or resolution in ('ok', 'entfernt', 'gesperrt')),
  resolved_note text,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_open on public.reports (created_at) where status = 'offen';
alter table public.reports enable row level security;
-- Lesen und Schreiben nur über die Funktionen unten

-- Hinweise an Betroffene (Begründung bei Entfernen oder Sperren)
create table public.moderation_notices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
alter table public.moderation_notices enable row level security;
create policy "Eigene Hinweise lesen" on public.moderation_notices for select to authenticated using (user_id = auth.uid());
grant select on public.moderation_notices to authenticated;

-- Melden: der Inhalt wird zum Zeitpunkt der Meldung kopiert, wenn du ihn sehen darfst
create function public.report_content(kind text, ref text, reason text, note text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  snap text;
  n integer;
  new_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden.' using errcode = 'P0001';
  end if;
  select count(*) into n from reports r where r.reporter = auth.uid() and r.created_at > now() - interval '24 hours';
  if n >= 20 then
    raise exception 'Du hast heute schon viele Meldungen geschickt. Wir schauen sie uns an.' using errcode = 'P0001';
  end if;
  if kind = 'direct_message' then
    select m.sender, m.body into t, snap from direct_messages m
      where m.id = ref::bigint and (m.sender = auth.uid() or m.recipient = auth.uid());
  elsif kind = 'ride_message' then
    select m.user_id, m.body into t, snap from ride_messages m
      where m.id = ref::bigint and public.can_chat(m.ride_id);
  elsif kind = 'profile' then
    select p.id, concat_ws(E'\n', p.display_name, p.bio) into t, snap from profiles p where p.id = ref::uuid;
  elsif kind = 'tour' then
    select x.owner, concat_ws(E'\n', x.name, x.description) into t, snap from tours x where x.id = ref::uuid and x.published;
  elsif kind = 'ausfahrt' then
    select x.owner, concat_ws(E'\n', x.name, x.note) into t, snap from rides x where x.id = ref::uuid and x.public;
  else
    raise exception 'Unbekannte Art.' using errcode = 'P0001';
  end if;
  if t is null then
    raise exception 'Diesen Inhalt gibt es nicht mehr.' using errcode = 'P0001';
  end if;
  if t = auth.uid() then
    raise exception 'Eigene Inhalte kannst du nicht melden.' using errcode = 'P0001';
  end if;
  insert into reports (reporter, target, kind, ref, reason, note, snapshot)
    values (auth.uid(), t, kind, ref, reason, nullif(btrim(coalesce(note, '')), ''), snap)
    returning id into new_id;
  return new_id;
end $$;

-- Prüfbereich -----------------------------------------------------------------------------------
create function public.admin_reports()
returns table (id bigint, kind text, ref text, reason text, note text, snapshot text, created_at timestamptz,
  reporter uuid, reporter_name text, target uuid, target_name text, target_reports integer, target_banned boolean)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = 'P0001';
  end if;
  return query
  select r.id, r.kind, r.ref, r.reason, r.note, r.snapshot, r.created_at,
    r.reporter, rp.display_name, r.target, tp.display_name,
    (select count(*)::integer from reports x where x.target = r.target),
    tp.banned_at is not null
  from reports r
  left join profiles rp on rp.id = r.reporter
  left join profiles tp on tp.id = r.target
  where r.status = 'offen'
  order by r.created_at
  limit 200;
end $$;

create function public.admin_resolve(report bigint, action text, why text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r reports%rowtype;
  label text;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = 'P0001';
  end if;
  if action not in ('ok', 'entfernt', 'gesperrt') then
    raise exception 'Unbekannte Aktion.' using errcode = 'P0001';
  end if;
  select * into r from reports where id = report;
  if r.id is null then
    raise exception 'Meldung nicht gefunden.' using errcode = 'P0001';
  end if;
  label := case r.reason when 'illegal' then 'mögliche illegale Inhalte' when 'spam' then 'Spam oder Werbung'
    when 'belaestigung' then 'Belästigung' when 'betrug' then 'Betrug' else 'Verstoß gegen die Nutzungsbedingungen' end;

  if action in ('entfernt', 'gesperrt') then
    if r.kind = 'direct_message' then
      delete from direct_messages where id = r.ref::bigint;
    elsif r.kind = 'ride_message' then
      delete from ride_messages where id = r.ref::bigint;
    elsif r.kind = 'profile' then
      update profiles set bio = null where id = r.ref::uuid;
    elsif r.kind = 'tour' then
      update tours set published = false where id = r.ref::uuid;
    elsif r.kind = 'ausfahrt' then
      update rides set public = false where id = r.ref::uuid;
    end if;
  end if;

  if action = 'gesperrt' and r.target is not null then
    update profiles set banned_at = now(), ban_reason = coalesce(nullif(btrim(coalesce(why, '')), ''), label), show_in_drivers = false
      where id = r.target;
    update tours set published = false where owner = r.target and published;
    update rides set public = false where owner = r.target and public;
    insert into moderation_notices (user_id, body) values (r.target,
      'Dein Konto ist gesperrt. Grund: ' || coalesce(nullif(btrim(coalesce(why, '')), ''), label) || '. Wenn du das für einen Fehler hältst, schreib uns an die Adresse in den Nutzungsbedingungen.');
  elsif action = 'entfernt' and r.target is not null then
    insert into moderation_notices (user_id, body) values (r.target,
      'Wir haben einen Inhalt von dir entfernt. Grund: ' || coalesce(nullif(btrim(coalesce(why, '')), ''), label) || '. Wenn du das für einen Fehler hältst, schreib uns an die Adresse in den Nutzungsbedingungen.');
  end if;

  -- alle offenen Meldungen zum selben Inhalt gleich mit erledigen
  update reports set status = 'erledigt', resolution = action, resolved_note = why, resolved_by = auth.uid(), resolved_at = now()
    where status = 'offen' and kind = r.kind and ref = r.ref;
end $$;

create function public.admin_unban(u uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = 'P0001';
  end if;
  update profiles set banned_at = null, ban_reason = null where id = u;
  insert into moderation_notices (user_id, body) values (u, 'Deine Sperre ist aufgehoben.');
end $$;

-- Eigener Stand: gesperrt, Hinweise, Admin
create function public.my_moderation()
returns table (banned boolean, ban_reason text, admin boolean, open_reports integer)
language sql security definer set search_path = public stable as $$
  select coalesce(p.banned_at is not null, false), p.ban_reason, public.is_admin(),
    case when public.is_admin() then (select count(*)::integer from reports r where r.status = 'offen') else 0 end
  from (select 1) one left join profiles p on p.id = auth.uid();
$$;

create function public.notice_seen(n bigint) returns void
language sql security definer set search_path = public as $$
  update moderation_notices set seen_at = now() where id = n and user_id = auth.uid();
$$;

-- Rechte --------------------------------------------------------------------------------------
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_banned(uuid) from public, anon, authenticated;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.share_ride(uuid, uuid) from public, anon, authenticated;
revoke all on function public.my_blocks() from public, anon, authenticated;
revoke all on function public.report_content(text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_reports() from public, anon, authenticated;
revoke all on function public.admin_resolve(bigint, text, text) from public, anon, authenticated;
revoke all on function public.admin_unban(uuid) from public, anon, authenticated;
revoke all on function public.my_moderation() from public, anon, authenticated;
revoke all on function public.notice_seen(bigint) from public, anon, authenticated;
revoke all on function public.dm_guard() from public, anon, authenticated;
revoke all on function public.ride_message_guard() from public, anon, authenticated;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.report_content(text, text, text, text) to authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_resolve(bigint, text, text) to authenticated;
grant execute on function public.admin_unban(uuid) to authenticated;
grant execute on function public.my_moderation() to authenticated;
grant execute on function public.notice_seen(bigint) to authenticated;
