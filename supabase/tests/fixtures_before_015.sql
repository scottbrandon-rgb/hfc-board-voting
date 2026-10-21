-- Data that exists before migration 015 runs, so the tests can check how the
-- migration treats motions decided or in progress under the previous rules.

-- A clean board: the seeded chair plus five fixture voting members, one of
-- whom is the secretary.
update public.members set is_active = false where role <> 'chair';

insert into public.members (id, email, full_name, role, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'v1@example.org', 'Voter One',   'member',    true),
  ('00000000-0000-0000-0000-0000000000a2', 'v2@example.org', 'Voter Two',   'secretary', true),
  ('00000000-0000-0000-0000-0000000000a3', 'v3@example.org', 'Voter Three', 'member',    true),
  ('00000000-0000-0000-0000-0000000000a4', 'v4@example.org', 'Voter Four',  'member',    true),
  ('00000000-0000-0000-0000-0000000000a5', 'v5@example.org', 'Voter Five',  'member',    true);

-- Legacy: decided under the old rules, with a mix of ballots.
insert into public.motions (id, motion_number, title, description, status, result,
  created_by, published_at, voting_opened_at, decided_at, motion_text_hash)
select '00000000-0000-0000-0000-0000000000b1', 'HFC-2026-001', 'Legacy decided', 'Old text',
  'decided_passed', 'passed', id, now() - interval '30 days', now() - interval '29 days',
  now() - interval '28 days', 'legacyhash'
from public.members where role = 'chair' and is_active;

insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'aye', 'legacyhash'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'nay', 'legacyhash');

-- Legacy: voting under way when the rules change.
insert into public.motions (id, motion_number, title, description, status,
  created_by, published_at, voting_opened_at, motion_text_hash)
select '00000000-0000-0000-0000-0000000000b2', 'HFC-2026-002', 'Legacy voting', 'Old text',
  'voting', id, now() - interval '3 days', now() - interval '2 days', 'legacyhash2'
from public.members where role = 'chair' and is_active;

insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'aye', 'legacyhash2'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a3', 'nay', 'legacyhash2');

-- Legacy: seconded and waiting for the chair to open voting.
insert into public.motions (id, motion_number, title, description, status,
  created_by, published_at, moved_by, moved_at, seconded_by, seconded_at)
select '00000000-0000-0000-0000-0000000000b3', 'HFC-2026-003', 'Legacy seconded', 'Seconded text',
  'seconded', c.id, now() - interval '1 day',
  '00000000-0000-0000-0000-0000000000a1', now() - interval '20 hours',
  '00000000-0000-0000-0000-0000000000a2', now() - interval '10 hours'
from public.members c where c.role = 'chair' and c.is_active;

-- Legacy: published, waiting for someone to move it.
insert into public.motions (id, motion_number, title, description, status, created_by, published_at)
select '00000000-0000-0000-0000-0000000000b4', 'HFC-2026-004', 'Legacy open', 'Open text',
  'open', id, now() - interval '1 hour'
from public.members where role = 'chair' and is_active;
