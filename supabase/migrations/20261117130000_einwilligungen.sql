-- Einwilligungen bei der Registrierung (Koray 17.11.: Opt in). Nachweis, dass Nutzungsbedingungen und Datenschutz
-- bestätigt wurden (mit Fassung und Zeit), und das freiwillige Opt in für Neuigkeiten per E Mail.
-- Die App schickt beim Registrieren options.data.consent = { terms: true, news: bool, version, source }.
-- Ein Trigger auf auth.users schreibt daraus Zeilen; jede spätere Änderung (Neuigkeiten an oder aus) ist eine neue
-- Zeile, der jüngste Eintrag gilt. Nur das eigene Konto kann lesen, niemand kann Einträge ändern oder löschen
-- (außer über die Kaskade beim Löschen des Kontos).

create table if not exists public.consents (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('agb', 'datenschutz', 'news')),
  granted boolean not null,
  version text check (char_length(version) <= 40),
  source text check (source in ('app', 'web', 'einstellungen')),
  created_at timestamptz not null default now()
);
create index if not exists consents_user on public.consents (user_id, kind, created_at desc);
alter table public.consents enable row level security;
create policy "Eigene Einwilligungen lesen" on public.consents for select to authenticated using (user_id = auth.uid());
grant select on public.consents to authenticated;

create or replace function public.record_signup_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := new.raw_user_meta_data -> 'consent';
  v text;
  s text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then
    return new;
  end if;
  v := left(coalesce(c ->> 'version', ''), 40);
  s := case when c ->> 'source' in ('app', 'web') then c ->> 'source' else null end;
  if coalesce((c ->> 'terms')::boolean, false) then
    insert into consents (user_id, kind, granted, version, source) values
      (new.id, 'agb', true, v, s),
      (new.id, 'datenschutz', true, v, s);
  end if;
  insert into consents (user_id, kind, granted, version, source)
    values (new.id, 'news', coalesce((c ->> 'news')::boolean, false), v, s);
  return new;
exception when others then
  -- eine fehlerhafte Angabe darf die Registrierung nie verhindern
  return new;
end $$;

drop trigger if exists on_auth_user_consent on auth.users;
create trigger on_auth_user_consent after insert on auth.users
  for each row execute function public.record_signup_consent();

-- Neuigkeiten an oder aus (Einstellungen)
create or replace function public.set_news_consent(granted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden.' using errcode = 'P0001';
  end if;
  insert into consents (user_id, kind, granted, source) values (auth.uid(), 'news', granted, 'einstellungen');
end $$;

create or replace function public.my_news_consent() returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select c.granted from consents c where c.user_id = auth.uid() and c.kind = 'news'
                   order by c.created_at desc, c.id desc limit 1), false);
$$;

revoke all on function public.record_signup_consent() from public, anon, authenticated;
revoke all on function public.set_news_consent(boolean) from public, anon;
revoke all on function public.my_news_consent() from public, anon;
grant execute on function public.set_news_consent(boolean) to authenticated;
grant execute on function public.my_news_consent() to authenticated;
