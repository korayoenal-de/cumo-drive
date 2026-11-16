-- Koray 16.11., Rückmeldungen Schritt 2:
-- 1. Muster: was niemand meldet, erkennt die Datenbank selbst (nachts) und legt es als Rückmeldung an.
-- 2. Den Kreis schließen: wird eine Meldung erledigt (Lösung live), bekommt der Fahrer eine Mitteilung.
-- 3. Löschfrist: Rückmeldungen und Fahrtprotokolle aus Problem melden höchstens 12 Monate.

alter table public.feedback drop constraint if exists feedback_source_check;
alter table public.feedback add constraint feedback_source_check check (source in ('melden', 'bewertung', 'app', 'muster'));
-- Schlüssel eines Musters (zum Beispiel hl:<Strecke> oder ort:<Kachel>), damit es nur einmal offen ist
alter table public.feedback add column if not exists pattern text;
create unique index if not exists feedback_pattern on public.feedback (pattern) where pattern is not null;

-- 1. Muster ---------------------------------------------------------------------------------------
-- a) Highlight, das in den letzten 60 Tagen mindestens drei Fahrer schwach fanden (Daumen runter überwiegt oder
--    Gesamtnote der Fahrten unter 40). b) Ort, an dem mindestens drei Fahrer in 30 Tagen Problem melden gedrückt
--    haben (Kachel etwa 300 m). Ein Muster wird nur neu angelegt, wenn es nicht schon offen ist; ist es erledigt und
--    tritt wieder auf, kommt es nach 30 Tagen erneut.
create or replace function public.feedback_patterns() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select h.hl_key, max(h.hl_name) as name, count(distinct h.owner) as drivers,
           count(*) filter (where h.vote = -1) as down, count(*) filter (where h.vote = 1) as up,
           round(avg(d.rating_score), 0) as score
    from drive_highlights h join drives d on d.id = h.drive_id
    where h.created_at > now() - interval '60 days'
    group by h.hl_key
    having count(distinct h.owner) >= 3
       and (count(*) filter (where h.vote = -1) > count(*) filter (where h.vote = 1) or avg(d.rating_score) < 40)
  loop
    insert into feedback (source, area, note, score, pattern, context)
    select 'muster', 'strecke',
           format('%s: %s Fahrer, %s Daumen runter, %s hoch, Note im Schnitt %s', coalesce(r.name, r.hl_key), r.drivers, r.down, r.up, coalesce(r.score::text, 'offen')),
           r.score, 'hl:' || r.hl_key, jsonb_build_object('hl_key', r.hl_key, 'drivers', r.drivers, 'down', r.down, 'up', r.up)
    where not exists (
      select 1 from feedback f where f.pattern = 'hl:' || r.hl_key
        and (f.status not in ('erledigt', 'informiert') or f.updated_at > now() - interval '30 days'))
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;

  for r in
    select round(lat::numeric, 3) as la, round(lon::numeric, 3) as lo, count(distinct owner) as drivers, count(*) as reports
    from nav_reports
    where created_at > now() - interval '30 days' and lat is not null and lon is not null
    group by 1, 2
    having count(distinct owner) >= 3
  loop
    insert into feedback (source, area, note, lat, lon, pattern, context)
    select 'muster', 'navigation',
           format('%s Fahrer haben hier in 30 Tagen Problem melden gedrückt (%s Meldungen)', r.drivers, r.reports),
           r.la, r.lo, format('ort:%s,%s', r.la, r.lo), jsonb_build_object('drivers', r.drivers, 'reports', r.reports)
    where not exists (
      select 1 from feedback f where f.pattern = format('ort:%s,%s', r.la, r.lo)
        and (f.status not in ('erledigt', 'informiert') or f.updated_at > now() - interval '30 days'))
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.feedback_patterns() from public, anon, authenticated;

-- 2. Den Kreis schließen ---------------------------------------------------------------------------
-- Status erledigt (Lösung ist live) bei einer Meldung mit Fahrer: Mitteilung schicken und als informiert markieren.
create or replace function public.feedback_done() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'erledigt' and old.status is distinct from 'erledigt' and new.owner is not null and new.source <> 'muster' then
    perform public.push_notify(jsonb_build_object('type', 'feedback_done', 'id', new.id, 'to', new.owner));
    new.status := 'informiert';
  end if;
  return new;
end $$;
revoke all on function public.feedback_done() from public, anon, authenticated;
drop trigger if exists feedback_done on public.feedback;
create trigger feedback_done before update on public.feedback
  for each row execute function public.feedback_done();

-- 3. Löschfrist -----------------------------------------------------------------------------------
create or replace function public.prune_feedback() returns void
language sql security definer set search_path = public as $$
  delete from public.feedback where created_at < now() - interval '12 months';
  delete from public.nav_reports where created_at < now() - interval '12 months';
$$;
revoke all on function public.prune_feedback() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('feedback-patterns', '23 5 * * *', 'select public.feedback_patterns()');
    perform cron.schedule('feedback-prune', '29 4 * * *', 'select public.prune_feedback()');
  end if;
end $$;

-- Konto löschen löscht auch die Rückmeldungen (wie in der Datenschutzerklärung zugesagt), Muster haben keinen Fahrer
alter table public.feedback drop constraint if exists feedback_owner_fkey;
alter table public.feedback add constraint feedback_owner_fkey foreign key (owner) references auth.users (id) on delete cascade;
