-- Koray 17.11.: Zum Start haben alle neuen Konten 30 Tage frei, wer sich bis zum 31.12.2026 registriert. Danach
-- wieder 14 Tage (so steht es auch auf der Landingpage). Maßgeblich ist das Anlegen des Kontos (auth.users).

create or replace function public.trial_length(created timestamptz) returns interval
language sql immutable as $$
  select case when created < timestamptz '2027-01-01 00:00:00 Europe/Berlin' then interval '30 days' else interval '14 days' end
$$;
grant execute on function public.trial_length(timestamptz) to anon, authenticated;

-- Profile, die ohne App Sitzung entstehen, bekommen die Länge über den Standardwert
alter table public.profiles alter column trial_ends_at set default now() + public.trial_length(now());

-- Schutz der Abo Spalten wie bisher, nur mit der neuen Länge beim Anlegen
create or replace function public.protect_profile_entitlement() returns trigger
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
    new.trial_ends_at := coalesce(account_created, now()) + public.trial_length(coalesce(account_created, now()));
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.plan_until is distinct from old.plan_until
     or new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'Mitgliedschaft kann nicht aus der App geändert werden.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Bestehende Konten aus der Startphase: auf 30 Tage ab Anlegen verlängern, nie verkürzen
update public.profiles p
   set trial_ends_at = u.created_at + interval '30 days'
  from auth.users u
 where u.id = p.id
   and u.created_at < timestamptz '2027-01-01 00:00:00 Europe/Berlin'
   and p.trial_ends_at < u.created_at + interval '30 days';
