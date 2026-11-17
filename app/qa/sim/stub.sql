-- Auth Stub für die lokale Simulation (nie im echten Supabase Projekt ausführen).
-- Bildet nur nach, was die Migrationen von Supabase erwarten: Rollen, Schemas auth, extensions,
-- storage und vault, auth.users, auth.uid() aus request.uid und die Publikation supabase_realtime.
-- pg_cron und pg_net fehlen bewusst; die Simulation sammelt diese Anweisungen als übersprungen.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create schema if not exists vault;

create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as
$f$ select nullif(current_setting('request.uid', true), '')::uuid $f$;

create or replace function auth.role() returns text language sql stable as
$f$ select coalesce(nullif(current_setting('request.role', true), ''), 'authenticated') $f$;

create or replace function auth.jwt() returns jsonb language sql stable as
$f$ select jsonb_build_object('sub', auth.uid(), 'role', auth.role()) $f$;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
$f$ select string_to_array(name, '/') $f$;

create table if not exists vault.secrets (id uuid primary key default extensions.gen_random_uuid(), name text unique, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(secret text, name text default null, description text default null) returns uuid
language sql as $f$ insert into vault.secrets (name, secret) values (name, secret) returning id $f$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
