-- Move SECURITY DEFINER helpers out of the API-exposed public schema.
-- Reason: Supabase security advisor flags SECURITY DEFINER functions in
-- `public` because PostgREST exposes them at /rest/v1/rpc/<name>, allowing
-- any authenticated client to invoke them directly. Putting them in a
-- non-exposed `private` schema keeps RLS policies working while removing
-- the REST surface.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members
  where lower(email) = lower(auth.jwt() ->> 'email')
    and is_active = true
  limit 1;
$$;

create or replace function private.current_member_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.members
  where lower(email) = lower(auth.jwt() ->> 'email')
    and is_active = true
  limit 1;
$$;

revoke all on function private.current_member_id() from public;
revoke all on function private.current_member_role() from public;
grant execute on function private.current_member_id() to authenticated, service_role;
grant execute on function private.current_member_role() to authenticated, service_role;

-- Drop policies that reference the public-schema helpers, then drop the helpers
drop policy members_select on public.members;
drop policy motions_select on public.motions;
drop policy motion_attachments_select on public.motion_attachments;
drop policy motion_attachments_insert on public.motion_attachments;
drop policy votes_select on public.votes;
drop policy votes_insert on public.votes;
drop policy comments_select on public.comments;
drop policy comments_insert on public.comments;
drop policy audit_log_chair_select on public.audit_log;
drop policy audit_log_member_select on public.audit_log;

drop function public.current_member_id();
drop function public.current_member_role();

-- Recreate policies referencing private.* helpers
create policy members_select on public.members
  for select to authenticated
  using (private.current_member_id() is not null);

create policy motions_select on public.motions
  for select to authenticated
  using (private.current_member_id() is not null);

create policy motion_attachments_select on public.motion_attachments
  for select to authenticated
  using (private.current_member_id() is not null);

create policy motion_attachments_insert on public.motion_attachments
  for insert to authenticated
  with check (
    uploaded_by = private.current_member_id()
    and exists (
      select 1 from public.motions m
      where m.id = motion_id
        and m.status in ('draft','open','moved','seconded')
    )
  );

create policy votes_select on public.votes
  for select to authenticated
  using (private.current_member_id() is not null);

create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    member_id = private.current_member_id()
    and exists (
      select 1 from public.motions m
      where m.id = motion_id and m.status = 'voting'
    )
  );

create policy comments_select on public.comments
  for select to authenticated
  using (private.current_member_id() is not null);

create policy comments_insert on public.comments
  for insert to authenticated
  with check (member_id = private.current_member_id());

create policy audit_log_chair_select on public.audit_log
  for select to authenticated
  using (private.current_member_role() = 'chair');

create policy audit_log_member_select on public.audit_log
  for select to authenticated
  using (member_id = private.current_member_id());
