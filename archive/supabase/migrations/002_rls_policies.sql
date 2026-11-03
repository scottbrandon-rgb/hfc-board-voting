-- Helper: current member id from JWT email (case-insensitive match)
-- Note: superseded by migration 004 which moves these into the `private` schema
-- so the REST API does not expose them. Kept here for historical fidelity.
create or replace function public.current_member_id()
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

create or replace function public.current_member_role()
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

grant execute on function public.current_member_id() to authenticated;
grant execute on function public.current_member_role() to authenticated;

-- Enable RLS on all tables
alter table public.members enable row level security;
alter table public.motions enable row level security;
alter table public.motion_attachments enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;
alter table public.audit_log enable row level security;

-- Members: any active board member can read the roster
create policy members_select on public.members
  for select to authenticated
  using (public.current_member_id() is not null);

-- Motions: any active board member can read all motions
create policy motions_select on public.motions
  for select to authenticated
  using (public.current_member_id() is not null);

-- Motion attachments
create policy motion_attachments_select on public.motion_attachments
  for select to authenticated
  using (public.current_member_id() is not null);

create policy motion_attachments_insert on public.motion_attachments
  for insert to authenticated
  with check (
    uploaded_by = public.current_member_id()
    and exists (
      select 1 from public.motions m
      where m.id = motion_id
        and m.status in ('draft','open','moved','seconded')
    )
  );

-- Votes
create policy votes_select on public.votes
  for select to authenticated
  using (public.current_member_id() is not null);

create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    member_id = public.current_member_id()
    and exists (
      select 1 from public.motions m
      where m.id = motion_id and m.status = 'voting'
    )
  );

-- Comments
create policy comments_select on public.comments
  for select to authenticated
  using (public.current_member_id() is not null);

create policy comments_insert on public.comments
  for insert to authenticated
  with check (member_id = public.current_member_id());

-- Audit log
create policy audit_log_chair_select on public.audit_log
  for select to authenticated
  using (public.current_member_role() = 'chair');

create policy audit_log_member_select on public.audit_log
  for select to authenticated
  using (member_id = public.current_member_id());

-- All UPDATE/DELETE on every table is denied by absence of policies.
-- Server-side API routes use the service role key for state transitions
-- and enforce business rules in code (state machine, role gates).
