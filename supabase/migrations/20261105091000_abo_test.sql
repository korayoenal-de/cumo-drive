-- CUMO DRIVE Mitgliedschaft: Testphase, private Pläne und Clubs.
-- Jeder hat ab Kontoanlage 14 Tage alles frei. Danach braucht jeder einen Plan oder einen aktiven Club.
-- Pläne setzt später der Kaufabgleich (RevenueCat Webhook mit service role), Clubs und Event Pässe
-- trägt der Betreiber von Hand ein. Aus der App heraus kann niemand diese Werte selbst ändern.

-- Profile: Plan und Testphase ------------------------------------------------------------
alter table public.profiles
  add column plan text check (plan in ('woche', 'monat', 'jahr', 'saison')),
  add column plan_until timestamptz,
  add column trial_ends_at timestamptz default now() + interval '14 days';

-- Bisher gab es nur dann ein Profil, wenn die App etwas gespeichert hat. Für alle bestehenden
-- Konten jetzt eines anlegen, damit die Testphase überall sauber eingetragen ist.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- Testphase ab Kontoanlage, für die jetzigen Tester aber mindestens noch 7 Tage.
update public.profiles p
set trial_ends_at = greatest(coalesce(u.created_at, p.created_at) + interval '14 days', now() + interval '7 days')
from auth.users u
where u.id = p.id;

update public.profiles
set trial_ends_at = greatest(created_at + interval '14 days', now() + interval '7 days')
where trial_ends_at is null;

alter table public.profiles alter column trial_ends_at set not null;

-- Schutz der Abo Spalten. Bewusst als Trigger und nicht über Spaltenrechte: so bleiben alle
-- bestehenden und künftigen Profilspalten (display_name, car, vehicles und was noch kommt)
-- ohne weitere Freigaben aus der App beschreibbar.
-- Eingeloggte Nutzer (Rolle authenticated oder anon laut JWT) dürfen plan, plan_until und
-- trial_ends_at weder beim Anlegen setzen noch später ändern. service role und direkte SQL
-- Sitzungen des Betreibers (ohne JWT) dürfen alles.
create function public.protect_profile_entitlement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caller text := coalesce(auth.role(), '');
  account_created timestamptz;
begin
  if caller not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Die Testphase hängt am Konto, nicht am Zeitpunkt, an dem das Profil zuerst gespeichert wird
    select u.created_at into account_created from auth.users u where u.id = new.id;
    new.plan := null;
    new.plan_until := null;
    new.trial_ends_at := coalesce(account_created, now()) + interval '14 days';
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.plan_until is distinct from old.plan_until
     or new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'Mitgliedschaft kann nicht aus der App geändert werden.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.protect_profile_entitlement() from public, anon, authenticated;

create trigger profiles_protect_entitlement
  before insert or update on public.profiles
  for each row execute function public.protect_profile_entitlement();

-- Clubs und Event Pässe ------------------------------------------------------------------
-- club_s: bis 12 Fahrzeuge, club_l: bis 20, event: eine Tour, bis 20 Fahrzeuge, 7 Tage.
-- Abrechnung per Rechnung, Eintrag durch den Betreiber, zum Beispiel:
--   insert into public.clubs (name, tier, max_vehicles, valid_until)
--   values ('Beispiel Club', 'club_s', 12, now() + interval '1 year') returning id;
--   insert into public.club_members (club_id, user_id, role) values ('<club id>', '<user id>', 'admin');
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  tier text not null check (tier in ('club_s', 'club_l', 'event')),
  max_vehicles int not null check (max_vehicles between 1 and 50),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'mitglied' check (role in ('admin', 'mitglied')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

-- Hilfsfunktionen ohne Rekursion in den Regeln
create function public.is_club_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members m where m.club_id = cid and m.user_id = auth.uid());
$$;
create function public.is_club_admin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members m where m.club_id = cid and m.user_id = auth.uid() and m.role = 'admin');
$$;
revoke all on function public.is_club_member(uuid) from public, anon;
revoke all on function public.is_club_admin(uuid) from public, anon;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.is_club_admin(uuid) to authenticated;

-- Lesen: den eigenen Club, die eigene Mitgliedschaft; Club Admins sehen alle Mitglieder ihres Clubs.
-- Schreiben: nur service role (keine Regeln und keine Rechte für authenticated).
create policy "Eigenen Club sehen" on public.clubs for select to authenticated
  using (public.is_club_member(id));
create policy "Eigene Mitgliedschaft sehen" on public.club_members for select to authenticated
  using (user_id = auth.uid() or public.is_club_admin(club_id));

revoke all on public.clubs from anon, authenticated;
revoke all on public.club_members from anon, authenticated;
grant select on public.clubs to authenticated;
grant select on public.club_members to authenticated;
grant all on public.clubs to service_role;
grant all on public.club_members to service_role;

-- Berechtigung für den angemeldeten Nutzer ----------------------------------------------
-- Reihenfolge: aktiver Club, dann aktiver Plan, dann Testphase.
-- Ist nichts aktiv, kommt die zuletzt abgelaufene Quelle mit ihrem Datum zurück (active false).
create function public.my_entitlement() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  club_name text;
  club_max int;
  club_until timestamptz;
  p_plan text;
  p_until timestamptz;
  trial_end timestamptz;
begin
  if uid is null then
    return json_build_object('active', false, 'source', 'test', 'until', null, 'max_vehicles', 0, 'club_name', null);
  end if;

  select cl.name, cl.max_vehicles, cl.valid_until into club_name, club_max, club_until
  from public.club_members m
  join public.clubs cl on cl.id = m.club_id
  where m.user_id = uid and cl.valid_until > now()
  order by cl.max_vehicles desc, cl.valid_until desc
  limit 1;

  if club_until is not null then
    return json_build_object('active', true, 'source', 'club', 'until', club_until,
      'max_vehicles', club_max, 'club_name', club_name);
  end if;

  select pr.plan, pr.plan_until, pr.trial_ends_at into p_plan, p_until, trial_end
  from public.profiles pr where pr.id = uid;

  if p_plan is not null and p_until > now() then
    return json_build_object('active', true, 'source', 'plan', 'until', p_until,
      'max_vehicles', 6, 'club_name', null);
  end if;

  -- Ohne Profilzeile gilt die Testphase ab Kontoanlage
  if trial_end is null then
    select u.created_at + interval '14 days' into trial_end from auth.users u where u.id = uid;
  end if;

  if trial_end > now() then
    return json_build_object('active', true, 'source', 'test', 'until', trial_end,
      'max_vehicles', 6, 'club_name', null);
  end if;

  if p_plan is not null and p_until is not null then
    return json_build_object('active', false, 'source', 'plan', 'until', p_until,
      'max_vehicles', 0, 'club_name', null);
  end if;

  return json_build_object('active', false, 'source', 'test', 'until', trial_end,
    'max_vehicles', 0, 'club_name', null);
end $$;

revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated;
