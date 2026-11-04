-- CUMO DRIVE Grundlage: Profile, Touren, Passstatus, Übergabe Codes, Gruppenfahrten.
-- Jede Tabelle hat Row Level Security; freigegeben wird gezielt pro Rolle.

-- Profile -------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  car text check (char_length(car) <= 80),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Profil lesen, eingeloggt" on public.profiles for select to authenticated using (true);
create policy "Eigenes Profil anlegen" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "Eigenes Profil ändern" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select, insert, update on public.profiles to authenticated;

-- Touren --------------------------------------------------------------------
create table public.tours (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  folder text not null default '' check (char_length(folder) <= 80),
  profile text not null default 'kurvig' check (profile in ('kurvig', 'paesse', 'entspannt', 'schnell')),
  avoid jsonb not null default '{}'::jsonb,
  km numeric(7, 1) not null default 0,
  minutes integer,
  curves integer,
  -- komplette Tour (Wegpunkte, Linie mit Klassen, Warnungen), wie in src/lib/tour.ts
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tours_owner_updated on public.tours (owner, updated_at desc);
alter table public.tours enable row level security;
create policy "Eigene Touren lesen" on public.tours for select to authenticated using (owner = auth.uid());
create policy "Eigene Touren anlegen" on public.tours for insert to authenticated with check (owner = auth.uid());
create policy "Eigene Touren ändern" on public.tours for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Eigene Touren löschen" on public.tours for delete to authenticated using (owner = auth.uid());
grant select, insert, update, delete on public.tours to authenticated;

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger tours_touch before update on public.tours for each row execute function public.touch_updated_at();

-- Passstatus (wird von der Edge Function pass-status geschrieben) ----------
create table public.pass_status (
  pass_id text primary key,
  state text not null check (state in ('offen', 'gesperrt')),
  until timestamptz,
  since timestamptz,
  info text,
  checked_at timestamptz not null default now()
);
alter table public.pass_status enable row level security;
create policy "Passstatus lesen, alle" on public.pass_status for select to anon, authenticated using (true);
grant select on public.pass_status to anon, authenticated;

-- Übergabe Codes: Tour vom Web Planer per kurzem Code in die App ----------
-- Kein direkter Tabellenzugriff; nur über die zwei Funktionen unten.
create table public.handoffs (
  code text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table public.handoffs enable row level security;

create function public.create_handoff(payload jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  c text;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
begin
  if pg_column_size(payload) > 200000 then
    raise exception 'Tour zu groß';
  end if;
  delete from handoffs where expires_at < now();
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into handoffs (code, payload) values (c, payload);
      return c;
    exception when unique_violation then
      -- sehr selten, neuer Versuch
    end;
  end loop;
end $$;

create function public.get_handoff(code text) returns jsonb
language sql security definer set search_path = public stable as $$
  select h.payload from handoffs h where h.code = get_handoff.code and h.expires_at > now();
$$;

revoke all on function public.create_handoff(jsonb) from public;
revoke all on function public.get_handoff(text) from public;
grant execute on function public.create_handoff(jsonb) to anon, authenticated;
grant execute on function public.get_handoff(text) to anon, authenticated;

-- Gruppenfahrten -------------------------------------------------------------
-- Live Positionen laufen über Supabase Realtime (Broadcast im Kanal ride:<id>), nicht über Tabellen.
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default substr(md5(gen_random_uuid()::text), 1, 6),
  name text not null check (char_length(name) between 1 and 120),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tour_id uuid references public.tours (id) on delete set null,
  tour jsonb,
  starts_at timestamptz,
  meeting_point jsonb,
  status text not null default 'geplant' check (status in ('geplant', 'laeuft', 'beendet')),
  created_at timestamptz not null default now()
);
create table public.ride_members (
  ride_id uuid not null references public.rides (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null default 'mitfahrer' check (role in ('lead', 'schluss', 'mitfahrer')),
  joined_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);
alter table public.rides enable row level security;
alter table public.ride_members enable row level security;

create function public.is_ride_member(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from ride_members m where m.ride_id = r and m.user_id = auth.uid());
$$;
revoke all on function public.is_ride_member(uuid) from public;
grant execute on function public.is_ride_member(uuid) to authenticated;

create policy "Fahrt sehen als Mitglied oder Owner" on public.rides for select to authenticated
  using (owner = auth.uid() or public.is_ride_member(id));
create policy "Fahrt anlegen" on public.rides for insert to authenticated with check (owner = auth.uid());
create policy "Fahrt ändern als Owner" on public.rides for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Fahrt löschen als Owner" on public.rides for delete to authenticated using (owner = auth.uid());
grant select, insert, update, delete on public.rides to authenticated;

create policy "Mitglieder sehen" on public.ride_members for select to authenticated using (public.is_ride_member(ride_id));
create policy "Selbst austreten" on public.ride_members for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.ride_members to authenticated;

-- Beitreten nur mit Code
create function public.join_ride(join_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r uuid;
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  select id into r from rides where code = lower(join_code) and status <> 'beendet';
  if r is null then
    raise exception 'Fahrt nicht gefunden';
  end if;
  insert into ride_members (ride_id, user_id) values (r, auth.uid()) on conflict do nothing;
  return r;
end $$;
revoke all on function public.join_ride(text) from public;
grant execute on function public.join_ride(text) to authenticated;

-- Wer eine Fahrt anlegt, ist automatisch Lead
create function public.add_ride_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into ride_members (ride_id, user_id, role) values (new.id, new.owner, 'lead') on conflict do nothing;
  return new;
end $$;
create trigger rides_owner_member after insert on public.rides for each row execute function public.add_ride_owner();
