-- Allow members to be deleted even if they moved or seconded a motion.
-- The reference is set to NULL so the historical record is preserved.

alter table public.motions
  drop constraint if exists motion_moved_by_fk,
  drop constraint if exists motions_moved_by_fkey,
  drop constraint if exists motions_seconded_by_fkey;

alter table public.motions
  add constraint motions_moved_by_fkey
    foreign key (moved_by) references public.members(id) on delete set null,
  add constraint motions_seconded_by_fkey
    foreign key (seconded_by) references public.members(id) on delete set null;
