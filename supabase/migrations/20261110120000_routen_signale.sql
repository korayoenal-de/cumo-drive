-- Lernen aus der Nutzung (Koray 10.11.): was Fahrer mit geplanten Runden und Routen tun, als Signal je Tour.
-- Später wertet eine nächtliche Auswertung die Signale je Straßenstück aus (gelernte Strecken).
--
-- Datenschutz:
--  * Die Linie beginnt und endet nie an der Haustür: die App schneidet die ersten und letzten 2 km ab.
--  * Nur der Fahrer selbst darf schreiben, niemand darf lesen (keine select Policy). Ausgewertet wird
--    nur zusammengefasst über die Datenbank (Dienstrolle), nie als einzelne Spur oder Person.
--  * Ein Straßenstück lernt erst, wenn mindestens drei verschiedene Fahrer es gefahren sind (Auswertung).
--  * Konto gelöscht: alle Signale des Kontos fallen mit weg.

create table if not exists public.route_signals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('geplant', 'gespeichert', 'uebernommen', 'losgefahren', 'neu_gewuerfelt', 'geloescht', 'veroeffentlicht')),
  -- gleiche Linie, gleicher Schlüssel: verbindet geplant, gespeichert und losgefahren derselben Tour
  tour_key text not null check (char_length(tour_key) between 4 and 32),
  mode text check (mode in ('rundtour', 'route')),
  profile text check (char_length(profile) <= 20),
  -- vorgeschlagen (von uns gerechnete Rundtour) oder selbst gebaut (Route mit eigenen Punkten)
  suggested boolean,
  km numeric(6, 1) check (km >= 0 and km < 5000),
  fun smallint check (fun between 0 and 100),
  -- kodierte Polyline (Genauigkeit 5), ausgedünnt auf etwa 100 m, ohne die ersten und letzten 2 km
  line text check (char_length(line) <= 60000),
  created_at timestamptz not null default now()
);

create index if not exists route_signals_created on public.route_signals (created_at);
create index if not exists route_signals_key on public.route_signals (tour_key);

alter table public.route_signals enable row level security;

drop policy if exists route_signals_insert on public.route_signals;
create policy route_signals_insert on public.route_signals
  for insert to authenticated
  with check (user_id = auth.uid());

-- Kein Lesen, kein Ändern, kein Löschen für Nutzer
revoke all on public.route_signals from anon;
revoke select, update, delete on public.route_signals from authenticated;
grant insert on public.route_signals to authenticated;

-- Höchstens 24 Monate (Datenschutzerklärung, Abschnitt 5); täglich aufräumen, wenn pg_cron da ist
create or replace function public.prune_route_signals() returns void
language sql security definer set search_path = public as $$
  delete from public.route_signals where created_at < now() - interval '24 months';
$$;
revoke all on function public.prune_route_signals() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('route-signals-prune', '17 4 * * *', 'select public.prune_route_signals()');
  end if;
exception when others then
  raise notice 'pg_cron nicht verfügbar: %', sqlerrm;
end $$;
