-- Grenze für neue Konten (Koray 17.11., Sicherheitskonzept Maßnahme 7, Teil 1). Wer massenhaft Konten anlegt, um die
-- Kontingente je Konto zu umgehen, scheitert hier: höchstens 10 neue Konten je Netzwerk (IP) pro Stunde und 30 pro Tag,
-- dazu keine Wegwerf Adressen. Die IP wird nur als Hash gespeichert und nach 2 Tagen gelöscht.
-- Greift erst, wenn Koray den Hook einschaltet: Supabase, Authentication, Hooks, "Before User Created",
-- Postgres Funktion public.before_user_created. Captcha folgt mit dem nächsten TestFlight Build (Teil 2).

create table if not exists public.signup_attempts (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists signup_attempts_ip on public.signup_attempts (ip_hash, created_at desc);
alter table public.signup_attempts enable row level security;

create or replace function public.before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  email text := lower(coalesce(event->'user'->>'email', ''));
  domain text := split_part(lower(coalesce(event->'user'->>'email', '')), '@', 2);
  ip text := coalesce(event->'metadata'->>'ip_address', '');
  h text;
begin
  if domain in ('mailinator.com', 'guerrillamail.com', 'guerrillamail.de', 'sharklasers.com', '10minutemail.com',
                'temp-mail.org', 'tempmail.com', 'tempmail.net', 'trashmail.com', 'trashmail.de', 'yopmail.com',
                'yopmail.fr', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com',
                'throwawaymail.com', 'fakeinbox.com', 'emailondeck.com', 'mohmal.com', 'tempail.com',
                'spamgourmet.com', 'wegwerfmail.de', 'wegwerfmail.net', 'einrot.com', 'byom.de', 'trash-mail.com',
                'discard.email', 'mailcatch.com', 'moakt.com', 'tmail.ws', 'tmpmail.org', 'burnermail.io') then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Bitte nutze eine dauerhafte E Mail Adresse.'));
  end if;
  if ip = '' then
    return '{}'::jsonb;
  end if;
  h := encode(sha256(convert_to('cumo-signup:' || ip, 'UTF8')), 'hex');
  delete from signup_attempts where created_at < now() - interval '2 days';
  if (select count(*) from signup_attempts where ip_hash = h and created_at > now() - interval '1 hour') >= 10
     or (select count(*) from signup_attempts where ip_hash = h and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429,
      'message', 'Gerade zu viele neue Konten aus diesem Netz. Bitte versuch es später noch einmal.'));
  end if;
  insert into signup_attempts (ip_hash) values (h);
  return '{}'::jsonb;
end $$;

revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant all on table public.signup_attempts to supabase_auth_admin;
