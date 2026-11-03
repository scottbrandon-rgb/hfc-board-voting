-- Migration 010 changed comments.member_id FK to ON DELETE SET NULL,
-- but the column was still NOT NULL — contradictory constraints.
-- Make member_id nullable so SET NULL works correctly when a member is deleted.
-- Comments posted by active members will always have a member_id; this only
-- affects the edge case where a member is later removed.

alter table public.comments
  alter column member_id drop not null;
