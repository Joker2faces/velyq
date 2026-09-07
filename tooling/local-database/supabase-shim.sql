-- Minimal stand-ins for the Supabase-managed objects the migrations reference.
--
-- The repository's only database verification path is `supabase db reset`,
-- which needs Docker. Docker is not installed on every machine that has to
-- verify a migration, and none of the migrations actually depend on Supabase
-- beyond four things: the three PostgREST roles, `auth.users`, `auth.uid()`,
-- and pgcrypto. Everything else is plain Postgres.
--
-- This shim provides exactly those four, so `supabase/migrations/*.sql` can be
-- applied verbatim to a vanilla cluster. It is a verification aid, never a
-- description of production: the real `auth.users` has many more columns and
-- Supabase's GoTrue owns them.
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supabase resolves this from the request JWT. Locally there is no JWT, so it
-- reads a session setting instead: `set local request.jwt.claim.sub = '<uuid>'`
-- makes an RLS policy behave exactly as it would for that signed-in user.
create or replace function auth.uid() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(
    current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
