-- Abstürze und Fehler der App landen automatisch im Eingang der Rückmeldungen (Koray 20.11.2026: „Sobald eine
-- Error Message kommt, sollte diese dich erreichen“). Die geplante Prüfung „Rückmeldungen prüfen“ holt sie dort ab,
-- sucht die Ursache, legt eine Lösung auf einem Zweig an und meldet sich bei Koray.
--
-- Eine Meldung je Fehlerart und Version (app_errors ist schon so zusammengefasst). Taucht ein behobener Fehler in
-- derselben Version wieder auf, wird die Meldung wieder neu. Ohne owner: ein Absturz bekommt keine Danke Mitteilung.

alter table public.feedback drop constraint if exists feedback_source_check;
alter table public.feedback add constraint feedback_source_check check (source in ('melden', 'bewertung', 'app', 'muster', 'absturz'));

create or replace function public.feedback_from_app_error() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not (old.status = 'behoben' and new.status = 'neu') then
    return new;
  end if;
  insert into feedback (source, ref, area, note, version, context)
  values (
    'absturz', new.id, coalesce(new.context ->> 'screen', 'app'), left(new.message, 1000), new.version,
    jsonb_build_object('fatal', new.fatal, 'hits', new.hits, 'fingerprint', new.fingerprint, 'stack', new.stack, 'app', new.context)
  )
  on conflict (source, ref) do update set status = 'neu', updated_at = now(), context = excluded.context;
  return new;
end $$;

drop trigger if exists feedback_from_app_error on public.app_errors;
create trigger feedback_from_app_error after insert or update of status on public.app_errors
  for each row execute function public.feedback_from_app_error();

-- Offene Fehler der letzten sieben Tage einmal nachtragen (darunter der Absturz im Chat vom 20.11.)
insert into public.feedback (source, ref, area, note, version, context, created_at)
select 'absturz', e.id, coalesce(e.context ->> 'screen', 'app'), left(e.message, 1000), e.version,
       jsonb_build_object('fatal', e.fatal, 'hits', e.hits, 'fingerprint', e.fingerprint, 'stack', e.stack, 'app', e.context),
       e.last_seen
  from public.app_errors e
 where e.status = 'neu' and e.last_seen > now() - interval '7 days'
on conflict (source, ref) do nothing;

-- Der Absturz im Chat ist schon gelöst (Commit 08877e3), die Prüfung muss ihn nicht noch einmal angehen
update public.feedback
   set status = 'loesung', updated_at = now(),
       finding = 'Beim Zurückkehren in den Chat lief der Realtime Effekt neu, bevor removeChannel den alten Kanal abgebaut hatte. supabase.channel() gab den schon abonnierten Kanal zurück, .on() warf.',
       solution = 'Commit 08877e3 auf main: Kanäle für Datenbank Änderungen bekommen je Aufbau einen eigenen Namen (freshChannel in lib/supabase.ts), auch für Unterhaltungen und den Zähler der ungelesenen Nachrichten.'
 where source = 'absturz' and status = 'neu' and note like 'cannot add `postgres_changes` callbacks%';
