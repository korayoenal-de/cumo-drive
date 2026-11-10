-- Zwischenspeicher der TomTom Verkehrsmeldungen je 1 Grad Kachel (10.11.): Die Edge Function
-- road-closures merkte sich die Antworten nur im Speicher der laufenden Instanz. Nach jedem Kaltstart
-- fragte sie TomTom für alle Kacheln neu, fast jede Planung kostete so mehrere Abfragen des Kontingents.
-- Jetzt liegen die Antworten hier und gelten 30 Minuten für alle Instanzen.
-- Nur die Edge Function (service role) liest und schreibt; für die App gibt es keine Freigabe.
create table public.closure_tiles (
  key text primary key,
  fetched_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb
);
alter table public.closure_tiles enable row level security;
revoke all on public.closure_tiles from anon, authenticated;
