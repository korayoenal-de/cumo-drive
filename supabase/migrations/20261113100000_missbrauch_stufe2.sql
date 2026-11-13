-- Schutz vor Missbrauch, Stufe 2 (Backlog, Koray 13.11.)
-- 1. Links in ersten Nachrichten: Wer jemanden anschreibt, der noch nie geantwortet hat, kann keine Links schicken.
--    Gilt auch im Chat einer Ausfahrt für Konten jünger als 24 Stunden.
-- 2. Stille Hinweise: Der Server legt bei typischen Spam Mustern selbst einen Hinweis in den Prüfbereich.
--    Die betroffene Person merkt davon nichts, nichts wird automatisch gelöscht oder gesperrt.
--    Muster: dieselbe Nachricht an drei verschiedene Leute in 24 Stunden, das Tageslimit neuer Gespräche
--    erreicht, von zwei verschiedenen Leuten in sieben Tagen blockiert. Höchstens ein Hinweis je Muster und Konto am Tag.

-- Meldungen: neue Art "hinweis" (Ziel ist das Konto), Grund "automatisch", Melder leer --------------------
alter table public.reports alter column reporter drop not null;
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('direct_message', 'ride_message', 'profile', 'tour', 'ausfahrt', 'hinweis'));
alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check check (reason in ('illegal', 'spam', 'belaestigung', 'betrug', 'anderes', 'automatisch'));

-- Erkennt Links: http(s), www., bekannte Messenger Kurzlinks und nackte Domains mit gängiger Endung
create function public.has_link(t text) returns boolean
language sql immutable as $$
  select t ~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/|[a-z0-9-]+\.(com|de|net|org|info|io|me|ru|xyz|top|shop|site|online|link|app|at|ch|it|fr|eu|biz)(/|\s|$))';
$$;

-- Stiller Hinweis, höchstens einmal je Muster, Konto und Tag
create function public.auto_flag(u uuid, what text, sample text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if u is null or exists (
    select 1 from reports r where r.kind = 'hinweis' and r.target = u and r.note = what and r.created_at > now() - interval '24 hours'
  ) then
    return;
  end if;
  insert into reports (reporter, target, kind, ref, reason, note, snapshot)
    values (null, u, 'hinweis', u::text, 'automatisch', what, left(sample, 1000));
end $$;
revoke all on function public.auto_flag(uuid, text, text) from public, anon, authenticated;

-- Nachrichten: alte Hürden wie bisher, dazu Links und stille Hinweise -------------------------------------
create or replace function public.dm_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  replying boolean;
  had boolean;
  fresh integer;
  joined timestamptz;
  same integer;
begin
  if public.is_banned(new.sender) then
    raise exception 'Dein Konto ist gesperrt. Nachrichten kannst du gerade nicht senden.' using errcode = 'P0001';
  end if;
  select exists (select 1 from direct_messages m where m.sender = new.recipient and m.recipient = new.sender) into replying;
  select exists (select 1 from direct_messages m where m.sender = new.sender and m.recipient = new.recipient) into had;

  -- Links erst, wenn das Gegenüber schon einmal geschrieben hat
  if not replying and public.has_link(new.body) then
    raise exception 'Links kannst du schicken, sobald % dir geantwortet hat.', coalesce((select display_name from profiles where id = new.recipient), 'dein Gegenüber') using errcode = 'P0001';
  end if;

  -- dieselbe Nachricht an mehrere Leute (stiller Hinweis, die Nachricht geht trotzdem raus)
  select count(distinct m.recipient) into same from direct_messages m
    where m.sender = new.sender and m.recipient <> new.recipient and m.body = new.body and m.created_at > now() - interval '24 hours';
  if same >= 2 then
    perform public.auto_flag(new.sender, 'Gleiche Nachricht an mindestens drei Leute in 24 Stunden', new.body);
  end if;

  if replying or had then
    return new;
  end if;
  select created_at into joined from profiles where id = new.sender;
  if (joined is null or joined > now() - interval '24 hours') and not public.share_ride(new.sender, new.recipient) then
    raise exception 'Neue Konten können andere erst nach 24 Stunden anschreiben, außer ihr fahrt gemeinsam.' using errcode = 'P0001';
  end if;
  select count(*) into fresh from (
    select m.recipient from direct_messages m
    where m.sender = new.sender
    group by m.recipient
    having min(m.created_at) > now() - interval '24 hours'
      and not exists (select 1 from direct_messages o where o.sender = m.recipient and o.recipient = new.sender and o.created_at < min(m.created_at))
  ) x;
  if fresh >= 5 then
    perform public.auto_flag(new.sender, 'Tageslimit neuer Gespräche erreicht (fünf ohne Antwort)', new.body);
    raise exception 'Du hast heute schon fünf neue Gespräche begonnen. Morgen geht es weiter.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Chat der Ausfahrt: Konten jünger als 24 Stunden ohne Links
create or replace function public.ride_message_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  joined timestamptz;
begin
  if public.is_banned(new.user_id) then
    raise exception 'Dein Konto ist gesperrt. Nachrichten kannst du gerade nicht senden.' using errcode = 'P0001';
  end if;
  if public.has_link(new.body) then
    select created_at into joined from profiles where id = new.user_id;
    if joined is null or joined > now() - interval '24 hours' then
      raise exception 'Links gehen in der Ausfahrt ab dem zweiten Tag deines Kontos.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Blockieren: von zwei verschiedenen Leuten in sieben Tagen blockiert
create function public.block_flag() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  select count(distinct b.blocker) into n from blocks b where b.blocked = new.blocked and b.created_at > now() - interval '7 days';
  if n >= 2 then
    perform public.auto_flag(new.blocked, format('Von %s Leuten in sieben Tagen blockiert', n), (select concat_ws(E'\n', p.display_name, p.bio) from profiles p where p.id = new.blocked));
  end if;
  return new;
end $$;
create trigger blocks_flag after insert on public.blocks for each row execute function public.block_flag();

-- Prüfbereich: Hinweise erledigen ohne Inhalt zu löschen ----------------------------------------------------
-- Bei "hinweis" heißt Entfernen: Profiltext und Foto weg (wie bei einem gemeldeten Profil).
create or replace function public.admin_resolve(report bigint, action text, why text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r reports%rowtype;
  label text;
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = 'P0001';
  end if;
  if action not in ('ok', 'entfernt', 'gesperrt') then
    raise exception 'Unbekannte Aktion.' using errcode = 'P0001';
  end if;
  select * into r from reports where id = report;
  if r.id is null then
    raise exception 'Meldung nicht gefunden.' using errcode = 'P0001';
  end if;
  label := case r.reason when 'illegal' then 'mögliche illegale Inhalte' when 'spam' then 'Spam oder Werbung'
    when 'belaestigung' then 'Belästigung' when 'betrug' then 'Betrug' when 'automatisch' then 'Spam oder Werbung'
    else 'Verstoß gegen die Nutzungsbedingungen' end;

  if action in ('entfernt', 'gesperrt') then
    if r.kind = 'direct_message' then
      delete from direct_messages where id = r.ref::bigint;
    elsif r.kind = 'ride_message' then
      delete from ride_messages where id = r.ref::bigint;
    elsif r.kind in ('profile', 'hinweis') then
      update profiles set bio = null, avatar_v = null where id = r.ref::uuid;
    elsif r.kind = 'tour' then
      update tours set published = false where id = r.ref::uuid;
    elsif r.kind = 'ausfahrt' then
      update rides set public = false where id = r.ref::uuid;
    end if;
  end if;

  if action = 'gesperrt' and r.target is not null then
    update profiles set banned_at = now(), ban_reason = coalesce(nullif(btrim(coalesce(why, '')), ''), label), show_in_drivers = false, avatar_v = null
      where id = r.target;
    update tours set published = false where owner = r.target and published;
    update rides set public = false where owner = r.target and public;
    insert into moderation_notices (user_id, body) values (r.target,
      'Dein Konto ist gesperrt. Grund: ' || coalesce(nullif(btrim(coalesce(why, '')), ''), label) || '. Wenn du das für einen Fehler hältst, schreib uns an die Adresse in den Nutzungsbedingungen.');
  elsif action = 'entfernt' and r.target is not null then
    insert into moderation_notices (user_id, body) values (r.target,
      'Wir haben einen Inhalt von dir entfernt. Grund: ' || coalesce(nullif(btrim(coalesce(why, '')), ''), label) || '. Wenn du das für einen Fehler hältst, schreib uns an die Adresse in den Nutzungsbedingungen.');
  end if;

  update reports set status = 'erledigt', resolution = action, resolved_note = why, resolved_by = auth.uid(), resolved_at = now()
    where status = 'offen' and kind = r.kind and ref = r.ref;
end $$;
