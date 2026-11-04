-- Passstatus alle 4 Stunden aktualisieren (Edge Function pass-status, fragt TomTom ab).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;

select cron.schedule(
  'passstatus-aktualisieren',
  '17 */4 * * *',
  $$
  select net.http_post(
    url := 'https://onfxnfkhajxvjmmvmzda.supabase.co/functions/v1/pass-status',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
