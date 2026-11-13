-- Kontakte unter Drivers (TestFlight Review, Koray 13.11.: Kontakte mit Bestätigung)
--
-- Wer jemanden als Kontakt hinzufügt, schickt eine Anfrage. Erst wenn die andere Person annimmt,
-- seid ihr gegenseitig Kontakte. Kontakte stehen beim Einladen zu Gruppenfahrten oben.
-- Wer möchte, nimmt Einladungen zu Gruppenfahrten nur noch von Kontakten an (Einstellung im Profil).
-- Blockieren beendet einen Kontakt und verhindert neue Anfragen in beide Richtungen.

create table public.contacts (
  requester uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- je Paar nur eine Zeile, egal wer gefragt hat
create unique index contacts_pair on public.contacts (least(requester, addressee), greatest(requester, addressee));
create index contacts_addressee on public.contacts (addressee);

alter table public.contacts enable row level security;
create policy "Eigene Kontakte sehen" on public.contacts for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
grant select on public.contacts to authenticated;
-- Schreiben nur über die Funktionen unten

alter table public.profiles add column if not exists invites_contacts_only boolean not null default false;
grant update (invites_contacts_only) on public.profiles to authenticated;

create function public.is_contact(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from contacts c where c.status = 'accepted'
      and ((c.requester = a and c.addressee = b) or (c.requester = b and c.addressee = a))
  );
$$;
revoke all on function public.is_contact(uuid, uuid) from public, anon, authenticated;

-- Anfrage schicken. Hat die andere Person schon gefragt, seid ihr damit sofort Kontakte.
create function public.contact_request(other uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  row contacts%rowtype;
  today integer;
begin
  if me is null then
    raise exception 'Bitte anmelden.' using errcode = 'P0001';
  end if;
  if other is null or other = me then
    raise exception 'Das bist du selbst.' using errcode = 'P0001';
  end if;
  if public.is_banned(me) then
    raise exception 'Dein Konto ist gesperrt.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles p where p.id = other and p.display_name is not null and p.banned_at is null) then
    raise exception 'Diesen Fahrer gibt es nicht.' using errcode = 'P0001';
  end if;
  if exists (select 1 from blocks b where (b.blocker = me and b.blocked = other) or (b.blocker = other and b.blocked = me)) then
    raise exception 'Das geht gerade nicht.' using errcode = 'P0001';
  end if;
  select * into row from contacts c
    where (c.requester = me and c.addressee = other) or (c.requester = other and c.addressee = me);
  if row.requester is not null then
    if row.status = 'accepted' then
      return 'kontakt';
    end if;
    if row.requester = other then
      update contacts set status = 'accepted', answered_at = now() where requester = other and addressee = me;
      return 'kontakt';
    end if;
    return 'angefragt';
  end if;
  -- Schutz vor Massenanfragen: höchstens 30 offene neue Anfragen am Tag
  select count(*) into today from contacts c where c.requester = me and c.created_at > now() - interval '24 hours';
  if today >= 30 then
    perform public.auto_flag(me, 'Viele Kontaktanfragen an einem Tag', null);
    raise exception 'Du hast heute schon viele Anfragen geschickt. Morgen geht es weiter.' using errcode = 'P0001';
  end if;
  insert into contacts (requester, addressee) values (me, other);
  return 'angefragt';
end $$;

-- Anfrage annehmen oder ablehnen (ablehnen löscht still, die andere Person sieht weiter "Angefragt" nicht mehr)
create function public.contact_answer(other uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden.' using errcode = 'P0001';
  end if;
  if accept then
    update contacts set status = 'accepted', answered_at = now()
      where requester = other and addressee = auth.uid() and status = 'pending';
  else
    delete from contacts where requester = other and addressee = auth.uid() and status = 'pending';
  end if;
end $$;

-- Kontakt entfernen oder eigene Anfrage zurückziehen
create function public.contact_remove(other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from contacts
    where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
end $$;

-- Meine Kontakte und offenen Anfragen mit Name und Auto.
-- status: kontakt, angefragt (ich habe gefragt), anfrage (die andere Person fragt mich)
create function public.my_contacts()
returns table (id uuid, display_name text, car text, status text, since timestamptz)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.car,
    case when c.status = 'accepted' then 'kontakt' when c.requester = auth.uid() then 'angefragt' else 'anfrage' end,
    coalesce(c.answered_at, c.created_at)
  from contacts c
  join profiles p on p.id = case when c.requester = auth.uid() then c.addressee else c.requester end
  where (c.requester = auth.uid() or c.addressee = auth.uid())
    and p.display_name is not null and p.banned_at is null
    and not exists (select 1 from blocks b where (b.blocker = auth.uid() and b.blocked = p.id) or (b.blocker = p.id and b.blocked = auth.uid()))
  order by p.display_name;
$$;

revoke all on function public.contact_request(uuid) from public, anon;
revoke all on function public.contact_answer(uuid, boolean) from public, anon;
revoke all on function public.contact_remove(uuid) from public, anon;
revoke all on function public.my_contacts() from public, anon;
grant execute on function public.contact_request(uuid) to authenticated;
grant execute on function public.contact_answer(uuid, boolean) to authenticated;
grant execute on function public.contact_remove(uuid) to authenticated;
grant execute on function public.my_contacts() to authenticated;

-- Blockieren beendet den Kontakt
create function public.block_ends_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from contacts
    where (requester = new.blocker and addressee = new.blocked) or (requester = new.blocked and addressee = new.blocker);
  return new;
end $$;
create trigger blocks_end_contact after insert on public.blocks for each row execute function public.block_ends_contact();

-- Einladungen nur von Kontakten: gilt für jede neue oder erneuerte Einladung zu einer Gruppenfahrt
create function public.invite_contacts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if new.status <> 'eingeladen' or (tg_op = 'UPDATE' and old.status = 'eingeladen') then
    return new;
  end if;
  select owner into v_owner from rides where id = new.ride_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  if exists (select 1 from profiles p where p.id = new.user_id and p.invites_contacts_only)
     and not public.is_contact(v_owner, new.user_id) then
    raise exception '% nimmt Einladungen nur von Kontakten an.', coalesce((select display_name from profiles where id = new.user_id), 'Dieser Fahrer') using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger ride_members_contacts_guard before insert or update of status on public.ride_members
  for each row execute function public.invite_contacts_guard();

-- Push an die angefragte Person (Edge Function notify kennt die Art contact)
create function public.contact_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.push_notify(jsonb_build_object('type', 'contact', 'to', new.addressee, 'actor', new.requester, 'state', 'pending'));
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform public.push_notify(jsonb_build_object('type', 'contact', 'to', new.requester, 'actor', new.addressee, 'state', 'accepted'));
  end if;
  return new;
end $$;
create trigger contacts_push after insert or update of status on public.contacts
  for each row execute function public.contact_push();
