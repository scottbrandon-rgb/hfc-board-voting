-- Add withdrawn_at timestamp so the activity timeline can show when a motion was withdrawn.
-- The moved_at/seconded_at columns already exist; this fills the gap for the
-- withdrawn terminal state introduced in Step 6.
alter table public.motions
  add column if not exists withdrawn_at timestamptz;
