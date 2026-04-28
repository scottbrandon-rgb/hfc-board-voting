-- Private storage bucket for motion attachments. Service-role server code
-- is the only writer; reads are gated by RLS on storage.objects below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'motion-attachments',
  'motion-attachments',
  false,
  26214400,  -- 25 MB per spec section 19 suggested cap
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read policy: any active board member can download attachments.
-- Writes are intentionally locked down — only service_role (used by our
-- server-side route handlers and server actions) can upload or modify.
create policy "members can read motion attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'motion-attachments'
    and private.current_member_id() is not null
  );

-- Tighten draft visibility: drafts are visible only to their creator and
-- to the chair. Once a motion is published (status != 'draft'), all active
-- members can see it.
drop policy motions_select on public.motions;

create policy motions_select on public.motions
  for select to authenticated
  using (
    private.current_member_id() is not null
    and (
      status != 'draft'
      or created_by = private.current_member_id()
      or private.current_member_role() = 'chair'
    )
  );
