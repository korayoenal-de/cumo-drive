-- Push Benachrichtigungen (Koray 10.11.): neue private Nachricht, neue Nachricht im Chat einer Ausfahrt,
-- Einladung, Anfrage und Antwort darauf. Die App speichert ihren Expo Push Token in push_tokens,
-- Trigger rufen per pg_net die Edge Function notify auf, die über die Expo Push API verschickt.
--
-- Absicherung: notify nimmt nur Aufrufe mit dem Header x-notify-secret an. Der Wert liegt zweimal:
--   1. als Edge Function Secret NOTIFY_SECRET
--   2. im Supabase Vault unter dem Namen notify_secret (einmalig per SQL Editor, siehe unten)
-- Fehlt das Vault Secret, schicken die Trigger nichts. Ein Fehler beim Versand blockiert nie das Speichern.
--
--   select vault.create_secret('<derselbe Wert wie NOTIFY_SECRET>', 'notify_secret', 'Header für die Edge Function notify');

create extension if not exists pg_net with schema extensions;

-- Tokens je Gerät ------------------------------------------------------------------------------
create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;

create policy "Eigene Tokens lesen" on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy "Eigene Tokens anlegen" on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "Eigene Tokens ändern" on public.push_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Eigene Tokens löschen" on public.push_tokens for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;
grant insert (token, platform), update (platform, updated_at) on public.push_tokens to authenticated;

-- Token anmelden: wer den Token hat, hält das Gerät. Wechselt auf einem Gerät das Konto, geht der Token
-- an das neue Konto über (sonst bekäme das alte Konto weiter die Mitteilungen). Höchstens 10 Geräte je Konto.
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,180}\]$' then
    raise exception 'Ungültiger Push Token';
  end if;
  insert into push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(nullif(p_platform, ''), 'ios'), now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  delete from push_tokens t
  where t.user_id = auth.uid()
    and t.token not in (select x.token from push_tokens x where x.user_id = auth.uid() order by x.updated_at desc limit 10);
end $$;

-- Aufruf der Edge Function -------------------------------------------------------------------
create function public.push_notify(payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'notify_secret' limit 1;
  if v_secret is null or v_secret = '' then
    return;
  end if;
  perform net.http_post(
    url := 'https://onfxnfkhajxvjmmvmzda.supabase.co/functions/v1/notify',
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  -- ohne pg_net oder Vault (lokale Test DB) und bei jedem Fehler: Nachricht trotzdem speichern
  raise warning 'push_notify: %', sqlerrm;
end $$;

-- Private Nachricht --------------------------------------------------------------------------
create function public.push_direct_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify(jsonb_build_object('type', 'dm', 'id', new.id, 'actor', auth.uid()));
  return null;
end $$;
create trigger direct_messages_push after insert on public.direct_messages
  for each row execute function public.push_direct_message();

-- Chat einer Ausfahrt ------------------------------------------------------------------------
create function public.push_ride_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify(jsonb_build_object('type', 'ride_message', 'id', new.id, 'actor', auth.uid()));
  return null;
end $$;
create trigger ride_messages_push after insert on public.ride_messages
  for each row execute function public.push_ride_message();

-- Einladung, Anfrage und Antworten -----------------------------------------------------------
-- eingeladen: an den Eingeladenen; angefragt: an den Organisator;
-- angefragt zu zugesagt oder abgelehnt: an den Anfragenden; eingeladen zu zugesagt oder abgesagt: an den Organisator.
create function public.push_ride_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.status end;
begin
  if v_old is not distinct from new.status then
    return null;
  end if;
  if new.status in ('eingeladen', 'angefragt')
    or (v_old = 'angefragt' and new.status in ('zugesagt', 'abgelehnt'))
    or (v_old = 'eingeladen' and new.status in ('zugesagt', 'abgesagt')) then
    perform public.push_notify(jsonb_build_object('type', 'ride_member', 'ride', new.ride_id, 'user', new.user_id,
      'status', new.status, 'old', v_old, 'actor', auth.uid()));
  end if;
  return null;
end $$;
create trigger ride_members_push after insert or update of status on public.ride_members
  for each row execute function public.push_ride_member();

-- Rechte -----------------------------------------------------------------------------------
revoke all on function public.register_push_token(text, text) from public, anon, authenticated;
revoke all on function public.push_notify(jsonb) from public, anon, authenticated;
revoke all on function public.push_direct_message() from public, anon, authenticated;
revoke all on function public.push_ride_message() from public, anon, authenticated;
revoke all on function public.push_ride_member() from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
