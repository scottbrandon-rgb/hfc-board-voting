-- A board for the voting-engine tests: a chair and five voting members (one
-- the secretary), plus two motions decided before the tests start, loaded the
-- way the Supabase import loads history (the ballot guard is switched off
-- while past ballots are written, as src/lib/import-supabase.ts does).

insert into public.members (id, email, full_name, role, is_active) values
  ('00000000-0000-0000-0000-0000000000c0', 'chair@example.org', 'The Chair', 'chair', true),
  ('00000000-0000-0000-0000-0000000000a1', 'v1@example.org', 'Voter One',   'member',    true),
  ('00000000-0000-0000-0000-0000000000a2', 'v2@example.org', 'Voter Two',   'secretary', true),
  ('00000000-0000-0000-0000-0000000000a3', 'v3@example.org', 'Voter Three', 'member',    true),
  ('00000000-0000-0000-0000-0000000000a4', 'v4@example.org', 'Voter Four',  'member',    true),
  ('00000000-0000-0000-0000-0000000000a5', 'v5@example.org', 'Voter Five',  'member',    true);

-- Decided under the previous rules, with a mix of ballots.
insert into public.motions (id, motion_number, title, description, status, result, rules,
  created_by, published_at, voting_opened_at, decided_at, motion_text_hash)
values ('00000000-0000-0000-0000-0000000000b1', 'HFC-2026-001', 'Legacy decided', 'Old text',
  'decided_passed', 'passed', 'legacy', '00000000-0000-0000-0000-0000000000c0',
  now() - interval '30 days', now() - interval '29 days', now() - interval '28 days', 'legacyhash');

-- Finished and archived (hidden from the meeting lists).
insert into public.motions (id, motion_number, title, description, status, result, rules,
  created_by, published_at, decided_at, archived_at, archived_by)
values ('00000000-0000-0000-0000-0000000000b5', 'HFC-2026-005', 'Archived', 'Old text',
  'decided_failed', 'failed', 'legacy', '00000000-0000-0000-0000-0000000000c0',
  now() - interval '20 days', now() - interval '19 days', now() - interval '18 days',
  '00000000-0000-0000-0000-0000000000c0');

alter table public.votes disable trigger votes_guard;
insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'aye', 'legacyhash'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'nay', 'legacyhash');
alter table public.votes enable trigger votes_guard;
