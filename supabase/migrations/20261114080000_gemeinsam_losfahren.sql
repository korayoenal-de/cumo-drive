-- Gemeinsam losfahren (Konzept Koray 14.11., Canvas "Gemeinsam losfahren")
--
--  * Am Treffpunkt: die App meldet "da", sobald jemand höchstens 300 m vom Treffpunkt ist (ride_arrived).
--  * Anpingen: nur der Organisator (oder die übernommene Lead), höchstens alle 5 Minuten je Person.
--  * Standort teilen nur auf eigenen Wunsch nach dem Anpingen: Ankunft in Minuten und Punkt, bis zur Ankunft
--    oder bis die Gruppe losfährt (ride_share_eta). Niemand sieht einen Standort ungefragt.
--  * Abfahrt und Treffpunkt ändern bis zum Start, mit Mitteilung an alle (ride_change).
--  * Starten ab 2 Stunden vor der Abfahrt (ride_start), durch Organisator oder Lead.
--  * Kommt der Organisator nicht, darf 15 Minuten nach der Abfahrt ein Zugesagter die Lead übernehmen
--    (ride_take_lead); der Organisator kann sie vorher übergeben (ride_give_lead).

alter table public.rides add column if not exists lead_user uuid references auth.users (id) on delete set null;
alter table public.ride_members
  add column if not exists arrived_at timestamptz,
  add column if not exists pinged_at timestamptz,
  add column if not exists eta_min integer,
  add column if not exists eta_lat double precision,
  add column if not exists eta_lon double precision,
  add column if not exists eta_at timestamptz;

-- Darf diese Person die Ausfahrt steuern (ändern, anpingen, starten)?
create function public.ride_is_lead(r uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from rides x where x.id = r and auth.uid() is not null and (x.owner = auth.uid() or x.lead_user = auth.uid()));
$$;
revoke all on function public.ride_is_lead(uuid) from public, anon;
grant execute on function public.ride_is_lead(uuid) to authenticated;

-- Stand am Tag für alle, die dabei sind
create function public.ride_day(ride uuid)
returns table (user_id uuid, arrived boolean, eta_min integer, eta_lat double precision, eta_lon double precision, pinged_at timestamptz, is_lead boolean)
language sql security definer set search_path = public stable as $$
  select m.user_id,
    m.arrived_at is not null and m.arrived_at > x.starts_at - interval '4 hours',
    case when m.eta_at > now() - interval '15 minutes' and x.status = 'geplant' then m.eta_min end,
    case when m.eta_at > now() - interval '15 minutes' and x.status = 'geplant' then m.eta_lat end,
    case when m.eta_at > now() - interval '15 minutes' and x.status = 'geplant' then m.eta_lon end,
    m.pinged_at,
    m.user_id = coalesce(x.lead_user, x.owner)
  from ride_members m join rides x on x.id = m.ride_id
  where m.ride_id = ride_day.ride and m.status = 'zugesagt' and public.can_chat(x.id);
$$;
revoke all on function public.ride_day(uuid) from public, anon;
grant execute on function public.ride_day(uuid) to authenticated;

-- Ich bin am Treffpunkt (die App prüft die 300 m)
create function public.ride_arrived(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update ride_members set arrived_at = now(), eta_min = null, eta_lat = null, eta_lon = null, eta_at = null
    where ride_id = ride_arrived.ride and user_id = auth.uid() and status = 'zugesagt';
end $$;

-- Ankunft teilen, freiwillig nach dem Anpingen
create function public.ride_share_eta(ride uuid, minutes integer, lat double precision, lon double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rides x where x.id = ride_share_eta.ride and x.status = 'geplant') then
    return;
  end if;
  update ride_members set eta_min = greatest(0, least(minutes, 600)), eta_lat = round(lat::numeric, 4)::double precision,
      eta_lon = round(lon::numeric, 4)::double precision, eta_at = now()
    where ride_id = ride_share_eta.ride and user_id = auth.uid() and status = 'zugesagt';
end $$;

-- Teilen beenden
create function public.ride_stop_eta(ride uuid) returns void
language sql security definer set search_path = public as $$
  update ride_members set eta_min = null, eta_lat = null, eta_lon = null, eta_at = null
    where ride_id = ride_stop_eta.ride and user_id = auth.uid();
$$;

-- Anpingen: nur die Lead, je Person höchstens alle 5 Minuten
create function public.ride_ping(ride uuid, who uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  last timestamptz;
begin
  if not public.ride_is_lead(ride) then
    raise exception 'Anpingen kann nur, wer die Ausfahrt leitet.' using errcode = 'P0001';
  end if;
  select pinged_at into last from ride_members where ride_id = ride_ping.ride and user_id = who and status = 'zugesagt';
  if not found then
    raise exception 'Diese Person ist nicht dabei.' using errcode = 'P0001';
  end if;
  if last > now() - interval '5 minutes' then
    raise exception 'Gerade erst angepingt. In ein paar Minuten nochmal.' using errcode = 'P0001';
  end if;
  update ride_members set pinged_at = now() where ride_id = ride_ping.ride and user_id = who;
  perform public.push_notify(jsonb_build_object('type', 'ride_ping', 'ride', ride, 'to', who, 'actor', auth.uid()));
end $$;

-- Abfahrt und Treffpunkt ändern bis zum Start
create function public.ride_change(ride uuid, new_starts timestamptz default null, new_meeting jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  st text;
begin
  if not public.ride_is_lead(ride) then
    raise exception 'Ändern kann nur, wer die Ausfahrt leitet.' using errcode = 'P0001';
  end if;
  select status into st from rides where id = ride_change.ride for update;
  if st <> 'geplant' then
    raise exception 'Die Ausfahrt läuft schon.' using errcode = 'P0001';
  end if;
  if new_starts is not null and (new_starts < now() - interval '1 hour' or new_starts > now() + interval '120 days') then
    raise exception 'Diese Abfahrt passt nicht.' using errcode = 'P0001';
  end if;
  if new_meeting is not null and (jsonb_typeof(new_meeting -> 'lat') <> 'number' or jsonb_typeof(new_meeting -> 'lon') <> 'number') then
    raise exception 'Dieser Treffpunkt passt nicht.' using errcode = 'P0001';
  end if;
  update rides set
    starts_at = coalesce(new_starts, starts_at),
    meeting_point = case when new_meeting is null then meeting_point
      else jsonb_build_object('name', left(coalesce(new_meeting ->> 'name', 'Treffpunkt'), 80), 'lat', (new_meeting ->> 'lat')::double precision, 'lon', (new_meeting ->> 'lon')::double precision) end
  where id = ride_change.ride;
  -- wer schon "da" war, ist es am neuen Treffpunkt nicht mehr automatisch
  if new_meeting is not null then
    update ride_members set arrived_at = null where ride_id = ride_change.ride;
  end if;
  perform public.push_notify(jsonb_build_object('type', 'ride_changed', 'ride', ride, 'actor', auth.uid(),
    'what', case when new_starts is not null and new_meeting is not null then 'beides' when new_starts is not null then 'zeit' else 'ort' end));
end $$;

-- Starten: Organisator oder Lead, ab 2 Stunden vor der Abfahrt
create function public.ride_start(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  st text;
  t timestamptz;
begin
  if not public.ride_is_lead(ride) then
    raise exception 'Starten kann nur, wer die Ausfahrt leitet.' using errcode = 'P0001';
  end if;
  select status, starts_at into st, t from rides where id = ride_start.ride for update;
  if st = 'laeuft' then
    return;
  end if;
  if st <> 'geplant' then
    raise exception 'Diese Ausfahrt ist vorbei.' using errcode = 'P0001';
  end if;
  if t is not null and now() < t - interval '2 hours' then
    raise exception 'Starten geht ab % Uhr, zwei Stunden vor der Abfahrt.', to_char((t - interval '2 hours') at time zone 'Europe/Berlin', 'HH24:MI') using errcode = 'P0001';
  end if;
  update rides set status = 'laeuft' where id = ride_start.ride;
  update ride_members set eta_min = null, eta_lat = null, eta_lon = null, eta_at = null where ride_id = ride_start.ride;
end $$;

-- Lead übergeben (Organisator) und übernehmen (Zugesagte, ab 15 Minuten nach der Abfahrt)
create function public.ride_give_lead(ride uuid, who uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rides x where x.id = ride_give_lead.ride and x.owner = auth.uid() and x.status = 'geplant') then
    raise exception 'Übergeben kann nur der Organisator vor dem Start.' using errcode = 'P0001';
  end if;
  if who is not null and not exists (select 1 from ride_members m where m.ride_id = ride_give_lead.ride and m.user_id = who and m.status = 'zugesagt') then
    raise exception 'Diese Person ist nicht dabei.' using errcode = 'P0001';
  end if;
  update rides set lead_user = nullif(who, auth.uid()) where id = ride_give_lead.ride;
  if who is not null then
    perform public.push_notify(jsonb_build_object('type', 'ride_lead', 'ride', ride, 'to', who, 'actor', auth.uid()));
  end if;
end $$;

create function public.ride_take_lead(ride uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
  st text;
begin
  select starts_at, status into t, st from rides where id = ride_take_lead.ride for update;
  if st <> 'geplant' or not exists (select 1 from ride_members m where m.ride_id = ride_take_lead.ride and m.user_id = auth.uid() and m.status = 'zugesagt') then
    raise exception 'Das geht gerade nicht.' using errcode = 'P0001';
  end if;
  if t is null or now() < t + interval '15 minutes' then
    raise exception 'Übernehmen geht erst 15 Minuten nach der Abfahrt.' using errcode = 'P0001';
  end if;
  update rides set lead_user = auth.uid() where id = ride_take_lead.ride;
  perform public.push_notify(jsonb_build_object('type', 'ride_lead', 'ride', ride, 'actor', auth.uid(), 'taken', true));
end $$;

revoke all on function public.ride_arrived(uuid) from public, anon;
revoke all on function public.ride_share_eta(uuid, integer, double precision, double precision) from public, anon;
revoke all on function public.ride_stop_eta(uuid) from public, anon;
revoke all on function public.ride_ping(uuid, uuid) from public, anon;
revoke all on function public.ride_change(uuid, timestamptz, jsonb) from public, anon;
revoke all on function public.ride_start(uuid) from public, anon;
revoke all on function public.ride_give_lead(uuid, uuid) from public, anon;
revoke all on function public.ride_take_lead(uuid) from public, anon;
grant execute on function public.ride_arrived(uuid) to authenticated;
grant execute on function public.ride_share_eta(uuid, integer, double precision, double precision) to authenticated;
grant execute on function public.ride_stop_eta(uuid) to authenticated;
grant execute on function public.ride_ping(uuid, uuid) to authenticated;
grant execute on function public.ride_change(uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.ride_start(uuid) to authenticated;
grant execute on function public.ride_give_lead(uuid, uuid) to authenticated;
grant execute on function public.ride_take_lead(uuid) to authenticated;
