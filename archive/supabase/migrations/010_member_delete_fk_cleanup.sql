-- Allow members to be fully deleted without FK violations.
-- votes: cascade (vote record is meaningless without the member)
-- all others: set null (preserve historical records, lose attribution)

alter table public.votes
  drop constraint votes_member_id_fkey;
alter table public.votes
  add constraint votes_member_id_fkey
    foreign key (member_id) references public.members(id) on delete cascade;

alter table public.comments
  drop constraint comments_member_id_fkey;
alter table public.comments
  add constraint comments_member_id_fkey
    foreign key (member_id) references public.members(id) on delete set null;

alter table public.audit_log
  drop constraint audit_log_member_id_fkey;
alter table public.audit_log
  add constraint audit_log_member_id_fkey
    foreign key (member_id) references public.members(id) on delete set null;

alter table public.motion_attachments
  drop constraint motion_attachments_uploaded_by_fkey;
alter table public.motion_attachments
  add constraint motion_attachments_uploaded_by_fkey
    foreign key (uploaded_by) references public.members(id) on delete set null;

alter table public.motions
  drop constraint motions_created_by_fkey,
  drop constraint motions_ratified_by_fkey;
alter table public.motions
  add constraint motions_created_by_fkey
    foreign key (created_by) references public.members(id) on delete set null,
  add constraint motions_ratified_by_fkey
    foreign key (ratified_by) references public.members(id) on delete set null;
