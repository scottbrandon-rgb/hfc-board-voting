-- Add 'secretary' as a valid board role.
-- Secretary: can log in, view all motions, download PDFs, cannot vote or make/second motions.

alter table public.members
  drop constraint if exists members_role_check;

alter table public.members
  add constraint members_role_check
    check (role in ('chair', 'secretary', 'member'));
