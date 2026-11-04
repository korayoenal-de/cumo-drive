-- Community: Touren veröffentlichen. Veröffentlichte Touren kann jeder lesen und fahren.
alter table public.tours
  add column published boolean not null default false,
  add column published_at timestamptz,
  add column author text check (author is null or char_length(author) <= 60),
  add column description text check (description is null or char_length(description) <= 500);
create index tours_published on public.tours (published_at desc) where published;
create policy "Veröffentlichte Touren lesen" on public.tours for select to anon, authenticated using (published);
grant select on public.tours to anon;

-- Garage: mehrere Fahrzeuge je Fahrer (Liste im Profil)
alter table public.profiles add column vehicles jsonb not null default '[]'::jsonb;

-- Gefahrene Touren einem Fahrzeug zuordnen (Name mitspeichern, falls das Fahrzeug später gelöscht wird)
alter table public.drives
  add column vehicle_id text check (vehicle_id is null or char_length(vehicle_id) <= 40),
  add column vehicle_name text check (vehicle_name is null or char_length(vehicle_name) <= 80);
