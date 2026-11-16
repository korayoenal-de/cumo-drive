-- Koray 16.11.: Ein Eingang für alle Rückmeldungen. Jede Quelle schreibt automatisch hinein, Claude prüft jede Meldung
-- im Betrieb und stellt eine Lösung bereit. Quellen: Problem melden (nav_reports), schwache Bewertung nach der Fahrt
-- (drives, Note unter 40), Feedback aus den Einstellungen (send_feedback).
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner uuid references auth.users (id) on delete set null,
  -- melden | bewertung | app
  source text not null check (source in ('melden', 'bewertung', 'app')),
  -- Zeile in der Quelle (nav_reports.id, drives.id); bei app leer
  ref uuid,
  -- planen | navigation | karte | community | sonstiges (app), sonst aus der Quelle
  area text,
  note text check (note is null or char_length(note) <= 1000),
  reasons text[],
  score smallint,
  lat double precision,
  lon double precision,
  version text,
  context jsonb,
  -- neu | geprueft | loesung | wartet | erledigt | informiert
  status text not null default 'neu' check (status in ('neu', 'geprueft', 'loesung', 'wartet', 'erledigt', 'informiert')),
  -- Befund und Lösung, geschrieben bei der Prüfung
  finding text,
  solution text,
  unique (source, ref)
);
create index feedback_status on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;
create policy "Eigene Rückmeldungen lesen" on public.feedback for select to authenticated using (owner = auth.uid() or public.is_admin());
create policy "Rückmeldungen bearbeiten (Admin)" on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.feedback to authenticated;

-- Problem melden: jede Meldung landet im Eingang
create or replace function public.feedback_from_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into feedback (owner, source, ref, area, note, lat, lon, version, context)
  values (new.owner, 'melden', new.id, 'navigation', new.note, new.lat, new.lon, new.context ->> 'version', new.context)
  on conflict (source, ref) do nothing;
  return new;
end $$;
create trigger feedback_from_report after insert on public.nav_reports
  for each row execute function public.feedback_from_report();

-- Schwache Bewertung (unter 40) mit Gründen und Notiz; Änderungen an Gründen oder Notiz ziehen nach
create or replace function public.feedback_from_drive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rating_score is null or new.rating_score >= 40 then
    return new;
  end if;
  insert into feedback (owner, source, ref, area, note, reasons, score)
  values (new.owner, 'bewertung', new.id, 'fahrt', new.rating_note, new.rating_reasons, new.rating_score)
  on conflict (source, ref) do update
    set note = excluded.note, reasons = excluded.reasons, score = excluded.score, updated_at = now();
  return new;
end $$;
create trigger feedback_from_drive after update of rating_score, rating_reasons, rating_note on public.drives
  for each row execute function public.feedback_from_drive();

-- Feedback aus der App (Einstellungen), auch ohne Fahrt
create or replace function public.send_feedback(p_area text, p_note text, p_context jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if auth.uid() is null then
    raise exception 'Bitte melde dich an.' using errcode = 'P0001';
  end if;
  if p_note is null or char_length(trim(p_note)) < 3 then
    raise exception 'Schreib kurz, was dir aufgefallen ist.' using errcode = 'P0001';
  end if;
  if p_area is null or p_area not in ('planen', 'navigation', 'karte', 'community', 'sonstiges') then
    p_area := 'sonstiges';
  end if;
  -- höchstens 20 je Stunde und Person
  if (select count(*) from feedback where owner = auth.uid() and source = 'app' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Danke! Für den Moment ist genug angekommen.' using errcode = 'P0001';
  end if;
  insert into feedback (owner, source, area, note, version, context)
  values (auth.uid(), 'app', p_area, left(trim(p_note), 1000), p_context ->> 'version',
          case when p_context is null or pg_column_size(p_context) > 20000 then null else p_context end)
  returning id into fid;
  return fid;
end $$;
revoke all on function public.send_feedback(text, text, jsonb) from public, anon;
grant execute on function public.send_feedback(text, text, jsonb) to authenticated;
