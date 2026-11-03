-- RLS hardening pass

-- 1. motion-pdfs storage: chair + secretary read only (no public access)
create policy "chair and secretary can read motion pdfs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'motion-pdfs'
    and private.current_member_role() in ('chair', 'secretary')
  );

-- 2. votes_insert: enforce non-voting roles at DB level (was app-only)
drop policy votes_insert on public.votes;

create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    member_id = private.current_member_id()
    and private.current_member_role() = 'member'
    and exists (
      select 1 from public.motions m
      where m.id = motion_id and m.status = 'voting'
    )
  );

-- 3. motions_select: secretary can see drafts (same as chair)
drop policy motions_select on public.motions;

create policy motions_select on public.motions
  for select to authenticated
  using (
    private.current_member_id() is not null
    and (
      status != 'draft'
      or created_by = private.current_member_id()
      or private.current_member_role() in ('chair', 'secretary')
    )
  );

-- 4. audit_log: secretary sees all entries (same as chair)
drop policy audit_log_chair_select on public.audit_log;

create policy audit_log_privileged_select on public.audit_log
  for select to authenticated
  using (private.current_member_role() in ('chair', 'secretary'));

-- 5. motion_attachments_insert: restrict to chair only
drop policy motion_attachments_insert on public.motion_attachments;

create policy motion_attachments_insert on public.motion_attachments
  for insert to authenticated
  with check (
    uploaded_by = private.current_member_id()
    and private.current_member_role() = 'chair'
    and exists (
      select 1 from public.motions m
      where m.id = motion_id
        and m.status in ('draft', 'open', 'moved', 'seconded')
    )
  );
