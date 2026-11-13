-- Ergänzung zum Profilfoto (13.11.), eigene Datei, weil 20261113080000 schon eingespielt sein kann.
-- Supabase erlaubt kein direktes Löschen in storage.objects per SQL: Admins nehmen das Foto aus der Anzeige
-- (avatar_v = null), die Datei selbst löscht der Besitzer über die App oder später ein Aufräumjob über die Storage API.
create or replace function public.admin_remove_avatar(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins';
  end if;
  update public.profiles set avatar_v = null where id = target;
end;
$$;

-- Melden: Profil entfernen oder Konto sperren nimmt auch das Foto weg (gleiche Funktion wie 12.11., ergänzt)
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
    when 'belaestigung' then 'Belästigung' when 'betrug' then 'Betrug' else 'Verstoß gegen die Nutzungsbedingungen' end;

  if action in ('entfernt', 'gesperrt') then
    if r.kind = 'direct_message' then
      delete from direct_messages where id = r.ref::bigint;
    elsif r.kind = 'ride_message' then
      delete from ride_messages where id = r.ref::bigint;
    elsif r.kind = 'profile' then
      -- Profil entfernen heißt auch das Foto (13.11.)
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

  -- alle offenen Meldungen zum selben Inhalt gleich mit erledigen
  update reports set status = 'erledigt', resolution = action, resolved_note = why, resolved_by = auth.uid(), resolved_at = now()
    where status = 'offen' and kind = r.kind and ref = r.ref;
end $$;

