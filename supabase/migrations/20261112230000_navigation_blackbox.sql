-- Koray 12.11.: Blackbox je Fahrt und "Problem melden" in der Navigation.
-- nav_log: Protokoll der Navigation (Positionen ausgedünnt, Ansagen, Neuberechnungen, Tempolimits), nur für den Fahrer.
alter table public.drives add column if not exists nav_log jsonb;

-- Meldungen aus der Navigation: Ort, Zeit, was gerade angezeigt wurde, die letzten Minuten der Blackbox.
-- Lesen dürfen der Fahrer selbst und die Admins (zum Nachstellen des Fehlers).
create table public.nav_reports (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  lat double precision,
  lon double precision,
  -- was die App in dem Moment zeigte: Manöver, Tempolimit, Tour, Version
  context jsonb,
  log jsonb,
  note text check (note is null or char_length(note) <= 500)
);
create index nav_reports_created on public.nav_reports (created_at desc);
alter table public.nav_reports enable row level security;
create policy "Eigene Meldungen anlegen" on public.nav_reports for insert to authenticated with check (owner = auth.uid());
create policy "Eigene Meldungen lesen" on public.nav_reports for select to authenticated using (owner = auth.uid() or public.is_admin());
create policy "Eigene Meldungen löschen" on public.nav_reports for delete to authenticated using (owner = auth.uid());
grant select, insert, delete on public.nav_reports to authenticated;
