-- Minimal stand-ins for the parts of a Supabase project the migrations touch,
-- so the migrations and the voting-engine tests can run against a plain local
-- PostgreSQL (see scripts/test-db.sh). Never apply this to a real project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- auth.jwt() reads the claims the same way Supabase does.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;

grant usage on schema auth, storage, extensions, public to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
