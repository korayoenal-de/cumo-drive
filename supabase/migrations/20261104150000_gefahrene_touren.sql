-- Gefahrene Touren mit Fahrtstatistik (aus der Navigation), nur für den Fahrer selbst sichtbar.
create table public.drives (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  started_at timestamptz not null,
  km numeric(7, 1) not null,
  moving_min integer not null,
  avg_kmh numeric(5, 1),
  max_kmh numeric(5, 1),
  max_lat_g numeric(4, 2),
  max_brake_g numeric(4, 2),
  max_accel_g numeric(4, 2),
  curves integer,
  -- gefahrene Spur als Polyline (Faktor 1e5), ausgedünnt
  track text,
  created_at timestamptz not null default now()
);
create index drives_owner_started on public.drives (owner, started_at desc);
alter table public.drives enable row level security;
create policy "Eigene Fahrten lesen" on public.drives for select to authenticated using (owner = auth.uid());
create policy "Eigene Fahrten anlegen" on public.drives for insert to authenticated with check (owner = auth.uid());
create policy "Eigene Fahrten löschen" on public.drives for delete to authenticated using (owner = auth.uid());
grant select, insert, delete on public.drives to authenticated;
grant all on public.drives to service_role;
