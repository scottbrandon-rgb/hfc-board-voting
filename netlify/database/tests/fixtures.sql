-- Test data for voting_engine.test.sql: a board of a chair and five voting
-- members (one is the secretary), and five motions as the Supabase records
-- would arrive through the import (see src/lib/import-supabase.ts):
--
--   b1  decided under the previous rules, with ballots
--   b2  voting, carried over to the current rules (ballots from before)
--   b3  voting, opened when the current rules began
--   b4  published, waiting for someone to move it
--   b5  decided under the previous rules and archived

insert into public.members (id, email, full_name, role, is_active) values
  ('00000000-0000-0000-0000-0000000000c0', 'chair@example.org', 'The Chair',   'chair',     true),
  ('00000000-0000-0000-0000-0000000000a1', 'v1@example.org',    'Voter One',   'member',    true),
  ('00000000-0000-0000-0000-0000000000a2', 'v2@example.org',    'Voter Two',   'secretary', true),
  ('00000000-0000-0000-0000-0000000000a3', 'v3@example.org',    'Voter Three', 'member',    true),
  ('00000000-0000-0000-0000-0000000000a4', 'v4@example.org',    'Voter Four',  'member',    true),
  ('00000000-0000-0000-0000-0000000000a5', 'v5@example.org',    'Voter Five',  'member',    true),
  ('00000000-0000-0000-0000-0000000000a9', 'old@example.org',   'Former',      'member',    false);

begin;
-- Past ballots on decided motions arrive only through the import.
select set_config('hfc.importing', 'on', true);

insert into public.motions (id, motion_number, title, description, status, result, rules,
  created_by, published_at, voting_opened_at, decided_at, motion_text_hash)
values ('00000000-0000-0000-0000-0000000000b1', 'HFC-2026-001', 'Legacy decided', 'Old text',
  'decided_passed', 'passed', 'legacy', '00000000-0000-0000-0000-0000000000c0',
  now() - interval '30 days', now() - interval '29 days', now() - interval '28 days', 'legacyhash');

insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'aye', 'legacyhash'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'nay', 'legacyhash');
commit;

insert into public.motions (id, motion_number, title, description, status, rules,
  created_by, published_at, voting_opened_at, voting_deadline, electorate_size, motion_text_hash)
values ('00000000-0000-0000-0000-0000000000b2', 'HFC-2026-002', 'Legacy voting', 'Old text',
  'voting', 'unanimous_v1', '00000000-0000-0000-0000-0000000000c0',
  now() - interval '3 days', now() - interval '2 days', now() + interval '3 days', 5, 'legacyhash2');

insert into public.motion_electorate (motion_id, member_id)
select '00000000-0000-0000-0000-0000000000b2', id from public.members
 where is_active and role in ('member', 'secretary');

insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'aye', 'legacyhash2'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a3', 'nay', 'legacyhash2');

insert into public.motions (id, motion_number, title, description, status, rules,
  created_by, published_at, moved_by, moved_at, seconded_by, seconded_at)
values ('00000000-0000-0000-0000-0000000000b3', 'HFC-2026-003', 'Legacy seconded', 'Seconded text',
  'seconded', 'unanimous_v1', '00000000-0000-0000-0000-0000000000c0', now() - interval '1 day',
  '00000000-0000-0000-0000-0000000000a1', now() - interval '20 hours',
  '00000000-0000-0000-0000-0000000000a2', now() - interval '10 hours');
select private.open_voting('00000000-0000-0000-0000-0000000000b3');

insert into public.motions (id, motion_number, title, description, status, rules, created_by, published_at)
values ('00000000-0000-0000-0000-0000000000b4', 'HFC-2026-004', 'Legacy open', 'Open text',
  'open', 'unanimous_v1', '00000000-0000-0000-0000-0000000000c0', now() - interval '1 hour');

insert into public.motions (id, motion_number, title, description, status, result, rules,
  created_by, published_at, decided_at, archived_at, archived_by)
values ('00000000-0000-0000-0000-0000000000b5', 'HFC-2026-005', 'Legacy archived', 'Archived text',
  'decided_failed', 'failed', 'legacy', '00000000-0000-0000-0000-0000000000c0',
  now() - interval '60 days', now() - interval '55 days', now() - interval '50 days',
  '00000000-0000-0000-0000-0000000000c0');
