-- Koray 17.11. (Nutzerstimmen der Wettbewerber: Abstürze und Hänger sind der häufigste Grund für schlechte Bewertungen):
-- Fehler der App landen gesammelt hier, damit wir sie sehen, bevor jemand eine Bewertung schreibt. Gleiche Fehler
-- werden je Version zusammengezählt (fingerprint), es gibt keine Zeile je Ereignis. Native Abstürze ohne JavaScript
-- meldet Apple weiter in App Store Connect (Xcode Organizer).
create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null check (char_length(fingerprint) <= 64),
  version text not null default '?' check (char_length(version) <= 64),
  message text not null check (char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 4000),
  fatal boolean not null default false,
  -- Bildschirm, Betriebssystem, Sprache
  context jsonb,
  hits integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_owner uuid references auth.users (id) on delete set null,
  -- neu | geprueft | behoben
  status text not null default 'neu' check (status in ('neu', 'geprueft', 'behoben')),
  note text,
  unique (fingerprint, version)
);
create index app_errors_recent on public.app_errors (status, last_seen desc);
alter table public.app_errors enable row level security;
create policy "App Fehler lesen (Admin)" on public.app_errors for select to authenticated using (public.is_admin());
create policy "App Fehler bearbeiten (Admin)" on public.app_errors for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.app_errors to authenticated;

-- Meldung aus der App, auch vor der Anmeldung (ein Absturz beim Start soll nicht verloren gehen)
create or replace function public.report_app_error(
  p_fingerprint text,
  p_message text,
  p_stack text default null,
  p_fatal boolean default false,
  p_version text default '?',
  p_context jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_fingerprint is null or char_length(p_fingerprint) not between 4 and 64 or p_message is null then
    return;
  end if;
  update app_errors
     set hits = hits + 1,
         last_seen = now(),
         last_owner = coalesce(auth.uid(), last_owner),
         fatal = fatal or coalesce(p_fatal, false),
         context = coalesce(p_context, context),
         -- ein behobener Fehler, der in derselben Version wieder auftaucht, ist wieder offen
         status = case when status = 'behoben' then 'neu' else status end
   where fingerprint = p_fingerprint and version = left(coalesce(p_version, '?'), 64);
  if found then
    return;
  end if;
  -- Schutz vor Flut: höchstens 200 neue Fehlerarten je Stunde
  if (select count(*) from app_errors where first_seen > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into app_errors (fingerprint, version, message, stack, fatal, context, last_owner)
  values (p_fingerprint, left(coalesce(p_version, '?'), 64), left(p_message, 500), left(p_stack, 4000), coalesce(p_fatal, false), p_context, auth.uid())
  on conflict (fingerprint, version) do update set hits = app_errors.hits + 1, last_seen = now();
end $$;
revoke all on function public.report_app_error(text, text, text, boolean, text, jsonb) from public;
grant execute on function public.report_app_error(text, text, text, boolean, text, jsonb) to anon, authenticated;
