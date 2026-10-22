-- Tests for the electronic voting rules (migration 015).
-- Run with scripts/test-db.sh. Any failed ASSERT or unexpected error stops the run.

\set ON_ERROR_STOP on

create schema if not exists tests;

create or replace function tests.expect_error(p_sql text, p_fragment text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_fragment in sqlerrm) = 0 then
      raise exception 'Expected an error containing "%", got "%"', p_fragment, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected an error containing "%", but it succeeded: %', p_fragment, p_sql;
end;
$$;

create or replace function tests.chair()
returns uuid
language sql
as $$ select id from public.members where role = 'chair' and is_active $$;

create or replace function tests.v(n int)
returns uuid
language sql
as $$ select ('00000000-0000-0000-0000-0000000000a' || n)::uuid $$;

create or replace function tests.new_draft(p_number text, p_days int default 5)
returns uuid
language sql
as $$
  insert into public.motions (motion_number, title, description, created_by, voting_period_days)
  values (p_number, 'Motion ' || p_number, 'Text of ' || p_number, tests.chair(), p_days)
  returning id
$$;

-- Publishes, moves (voter 1) and seconds (voter 2); returns the motion id.
create or replace function tests.new_vote(p_number text, p_days int default 5)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := tests.new_draft(p_number, p_days);
begin
  perform public.vote_publish_motion(v_id, tests.chair());
  perform public.vote_move_motion(v_id, tests.v(1));
  perform public.vote_second_motion(v_id, tests.v(2));
  return v_id;
end;
$$;

-- ─── 1. Migration: legacy motions ────────────────────────────────────────────
do $$
declare m public.motions;
begin
  select * into m from public.motions where id = '00000000-0000-0000-0000-0000000000b1';
  assert m.rules = 'legacy' and m.status = 'decided_passed', 'decided legacy motion untouched';
  assert (select count(*) from public.votes where motion_id = m.id) = 2, 'legacy ballots kept';

  select * into m from public.motions where id = '00000000-0000-0000-0000-0000000000b2';
  assert m.rules = 'unanimous_v1', 'in-progress vote moved to new rules';
  assert m.electorate_size = 5, 'electorate frozen at 5';
  assert m.voting_deadline >= now() + interval '23 hours', 'at least a day left';

  select * into m from public.motions where id = '00000000-0000-0000-0000-0000000000b3';
  assert m.status = 'voting', 'seconded legacy motion opened for voting';
  assert m.motion_text_hash is not null and m.electorate_size = 5, 'opened with hash and electorate';

  select * into m from public.motions where id = '00000000-0000-0000-0000-0000000000b4';
  assert m.rules = 'unanimous_v1' and m.status = 'open', 'open legacy motion on new rules';
end $$;

-- ─── 2. Hash matches the JavaScript formula ─────────────────────────────────
do $$
declare v_id uuid := tests.new_draft('HFC-T-HASH');
begin
  insert into public.motion_attachments (motion_id, storage_path, file_name, file_size, content_type, file_hash, uploaded_by)
  values (v_id, 'p/b', 'b.pdf', 1, 'application/pdf', 'bbb', tests.chair()),
         (v_id, 'p/a', 'a.pdf', 1, 'application/pdf', 'aaa', tests.chair());
  assert private.motion_text_hash(v_id) =
    encode(sha256(convert_to('Motion HFC-T-HASH' || E'\n' || 'Text of HFC-T-HASH' || E'\n' || 'aaabbb', 'UTF8')), 'hex'),
    'hash formula: title \n description \n sorted attachment hashes';
end $$;

-- ─── 3. Who may do what ─────────────────────────────────────────────────────
do $$
declare v_id uuid := tests.new_draft('HFC-T-ROLES');
begin
  perform tests.expect_error(format('select public.vote_publish_motion(%L, %L)', v_id, tests.v(1)),
    'Only the chair can publish');
  perform public.vote_publish_motion(v_id, tests.chair());
  perform tests.expect_error(format('select public.vote_move_motion(%L, %L)', v_id, tests.chair()),
    'Only a voting member can move');
  -- The secretary is a voting member.
  perform public.vote_move_motion(v_id, tests.v(2));
  perform tests.expect_error(format('select public.vote_second_motion(%L, %L)', v_id, tests.v(2)),
    'cannot also second');
  perform tests.expect_error(format('select public.vote_second_motion(%L, %L)', v_id, tests.chair()),
    'Only a voting member can second');
  perform tests.expect_error(format('select public.vote_withdraw_motion(%L, %L)', v_id, tests.v(3)),
    'Only the member who moved');
  perform public.vote_second_motion(v_id, tests.v(3));
  assert (select status from public.motions where id = v_id) = 'voting', 'seconding opens voting';
  perform tests.expect_error(format('select public.vote_cast_ballot(%L, %L, %L)', v_id, tests.chair(), 'aye'),
    'Only voting members can vote');
  perform tests.expect_error(format('select public.vote_cast_ballot(%L, %L, %L)', v_id, tests.v(1), 'nay'),
    'Choose Aye or Discuss in person');
end $$;

-- ─── 4. Voting opens on the second with a frozen electorate and deadline ────
do $$
declare v_id uuid := tests.new_vote('HFC-T-OPEN', 3); m public.motions;
begin
  select * into m from public.motions where id = v_id;
  assert m.status = 'voting' and m.electorate_size = 5, 'voting with 5 members';
  assert m.voting_deadline between now() + interval '3 days' - interval '1 minute'
                               and now() + interval '3 days' + interval '1 minute', 'deadline = period';
  assert m.motion_text_hash = private.motion_text_hash(v_id), 'text fingerprinted';
  assert (select count(*) from public.motion_electorate where motion_id = v_id) = 5, 'electorate saved';
end $$;

-- ─── 5. Unanimity: the fifth Aye approves immediately ───────────────────────
do $$
declare v_id uuid := tests.new_vote('HFC-T-UNANIMOUS'); r jsonb; i int;
begin
  for i in 1..4 loop
    r := public.vote_cast_ballot(v_id, tests.v(i), 'aye');
    assert r->>'status' = 'voting', 'not approved before the last Aye';
  end loop;
  r := public.vote_cast_ballot(v_id, tests.v(5), 'aye');
  assert r->>'status' = 'approved', 'fifth Aye approves';
  assert (select status from public.motions where id = v_id) = 'approved', 'status approved';
  perform tests.expect_error(format('select public.vote_cast_ballot(%L, %L, %L)', v_id, tests.v(5), 'discuss'),
    'Voting is closed');
end $$;

-- ─── 6. Changing votes; Discuss in person blocks approval until changed ─────
do $$
declare v_id uuid := tests.new_vote('HFC-T-CHANGE'); r jsonb; i int; b public.votes;
begin
  r := public.vote_cast_ballot(v_id, tests.v(1), 'discuss', 'question', 'Is this in the budget?');
  for i in 2..5 loop
    r := public.vote_cast_ballot(v_id, tests.v(i), 'aye');
  end loop;
  assert r->>'status' = 'voting', 'one Discuss in person keeps the vote open';
  select * into b from public.votes where motion_id = v_id and member_id = tests.v(1);
  assert b.reason = 'question' and b.note = 'Is this in the budget?', 'reason and note stored';

  r := public.vote_cast_ballot(v_id, tests.v(1), 'aye');
  assert r->>'status' = 'approved', 'changing to Aye completes approval';
  select * into b from public.votes where motion_id = v_id and member_id = tests.v(1);
  assert b.change_count = 1 and b.reason is null and b.note is null, 'change recorded; Aye clears reason';
  assert (select count(*) from public.audit_log where motion_id = v_id and event_type = 'vote_changed') = 1,
    'change audited';
end $$;

-- ─── 7. Deadline: Discuss in person or silence refers the motion ────────────
do $$
declare v_discuss uuid := tests.new_vote('HFC-T-DL-DISCUSS');
        v_silent uuid := tests.new_vote('HFC-T-DL-SILENT');
        v_all uuid := tests.new_vote('HFC-T-DL-ALL');
        i int; m public.motions;
begin
  perform public.vote_cast_ballot(v_discuss, tests.v(1), 'discuss');
  for i in 1..4 loop perform public.vote_cast_ballot(v_silent, tests.v(i), 'aye'); end loop;
  update public.motions set voting_deadline = now() - interval '1 minute'
   where id in (v_discuss, v_silent, v_all);

  perform tests.expect_error(format('select public.vote_cast_ballot(%L, %L, %L)', v_silent, tests.v(5), 'aye'),
    'deadline has passed');

  perform public.vote_close_expired();
  select * into m from public.motions where id = v_discuss;
  assert m.status = 'referred' and m.referral_reason = 'discuss_in_person', 'discuss → referred';
  select * into m from public.motions where id = v_silent;
  assert m.status = 'referred' and m.referral_reason = 'no_response', 'silence → referred';
  select * into m from public.motions where id = v_all;
  assert m.status = 'referred' and m.referral_reason = 'no_response', 'no ballots → referred';
end $$;

-- ─── 8. Chair referral needs a note and closes voting ───────────────────────
do $$
declare v_id uuid := tests.new_vote('HFC-T-REFER'); m public.motions;
begin
  perform public.vote_cast_ballot(v_id, tests.v(1), 'aye');
  perform tests.expect_error(format('select public.vote_refer_motion(%L, %L, %L)', v_id, tests.chair(), ' '),
    'Add a note');
  perform tests.expect_error(format('select public.vote_refer_motion(%L, %L, %L)', v_id, tests.v(1), 'note'),
    'Only the chair');
  perform public.vote_refer_motion(v_id, tests.chair(), 'Needs the full board.');
  select * into m from public.motions where id = v_id;
  assert m.status = 'referred' and m.referral_reason = 'chair' and m.referral_note = 'Needs the full board.',
    'referred by the chair with note';
  assert (select vote from public.votes where motion_id = v_id and member_id = tests.v(1)) = 'aye',
    'ballots cast before referral stay';
  perform tests.expect_error(format('select public.vote_cast_ballot(%L, %L, %L)', v_id, tests.v(2), 'aye'),
    'Voting is closed');
end $$;

-- ─── 9. Extensions: once, with a note; reminders reset ──────────────────────
do $$
declare v_id uuid := tests.new_vote('HFC-T-EXTEND'); v_before timestamptz; m public.motions;
begin
  update public.motions set reminder_24h_sent_at = now() where id = v_id;
  select voting_deadline into v_before from public.motions where id = v_id;
  perform tests.expect_error(format('select public.vote_extend_deadline(%L, %L, 2, %L)', v_id, tests.chair(), ''),
    'Add a note');
  perform tests.expect_error(format('select public.vote_extend_deadline(%L, %L, 9, %L)', v_id, tests.chair(), 'Travel'),
    '1 to 7 days');
  perform public.vote_extend_deadline(v_id, tests.chair(), 2, 'Two members travelling');
  select * into m from public.motions where id = v_id;
  assert m.voting_deadline = v_before + interval '2 days', 'deadline extended';
  assert m.reminder_24h_sent_at is null, 'reminders reset';
  perform tests.expect_error(format('select public.vote_extend_deadline(%L, %L, 1, %L)', v_id, tests.chair(), 'Again'),
    'already been extended');
end $$;

-- ─── 10. Reminders are claimed exactly once ─────────────────────────────────
do $$
declare v_id uuid := tests.new_vote('HFC-T-REMIND'); n int;
begin
  update public.motions
     set voting_opened_at = now() - interval '4 days',
         voting_deadline = now() + interval '20 hours'
   where id = v_id;
  select count(*) into n from public.vote_claim_reminders() where r_motion_id = v_id and r_kind = '24h';
  assert n = 1, '24h reminder claimed';
  select count(*) into n from public.vote_claim_reminders() where r_motion_id = v_id;
  assert n = 0, 'not claimed twice';
  update public.motions set voting_deadline = now() + interval '3 hours' where id = v_id;
  select count(*) into n from public.vote_claim_reminders() where r_motion_id = v_id and r_kind = 'final';
  assert n = 1, 'final reminder claimed';
  select count(*) into n from public.vote_claim_reminders() where r_motion_id = v_id;
  assert n = 0, 'final not claimed twice';
end $$;

-- ─── 11. Not moved / not seconded within the period → referred ─────────────
do $$
declare v_open uuid := tests.new_draft('HFC-T-NOMOVE', 3); v_moved uuid := tests.new_draft('HFC-T-NOSECOND', 3);
begin
  perform public.vote_publish_motion(v_open, tests.chair());
  perform public.vote_publish_motion(v_moved, tests.chair());
  perform public.vote_move_motion(v_moved, tests.v(1));
  update public.motions set published_at = now() - interval '4 days' where id = v_open;
  update public.motions set moved_at = now() - interval '4 days' where id = v_moved;
  perform public.vote_close_expired();
  assert (select referral_reason from public.motions where id = v_open) = 'not_moved', 'not moved → referred';
  assert (select referral_reason from public.motions where id = v_moved) = 'not_seconded', 'not seconded → referred';
end $$;

-- ─── 12. Quorum: fewer than 3 voting members → referred on the second ───────
do $$
declare v_id uuid := tests.new_draft('HFC-T-QUORUM'); m public.motions;
begin
  update public.members set is_active = false where id in (tests.v(3), tests.v(4), tests.v(5));
  perform public.vote_publish_motion(v_id, tests.chair());
  perform public.vote_move_motion(v_id, tests.v(1));
  perform public.vote_second_motion(v_id, tests.v(2));
  select * into m from public.motions where id = v_id;
  assert m.status = 'referred' and m.referral_reason = 'no_quorum', 'no quorum → referred';
  update public.members set is_active = true where id in (tests.v(3), tests.v(4), tests.v(5));
end $$;

-- ─── 13. Vacancy: unanimity of the seated members (4 of 4) ──────────────────
do $$
declare v_id uuid; r jsonb; i int;
begin
  update public.members set is_active = false where id = tests.v(5);
  v_id := tests.new_vote('HFC-T-VACANCY');
  assert (select electorate_size from public.motions where id = v_id) = 4, 'electorate of 4';
  for i in 1..4 loop r := public.vote_cast_ballot(v_id, tests.v(i), 'aye'); end loop;
  assert r->>'status' = 'approved', '4 of 4 approves';
  update public.members set is_active = true where id = tests.v(5);
  -- Seated after voting opened: not on this motion's list.
end $$;

-- ─── 14. In-person meeting: ratify and record outcomes ──────────────────────
do $$
declare v_ok uuid := tests.new_vote('HFC-T-RATIFY'); v_ref uuid := tests.new_vote('HFC-T-INPERSON');
        v_post uuid := tests.new_vote('HFC-T-POSTPONE'); i int; n int;
begin
  for i in 1..5 loop perform public.vote_cast_ballot(v_ok, tests.v(i), 'aye'); end loop;
  perform tests.expect_error(format('select public.vote_ratify(array[%L]::uuid[], %L, current_date)', v_ok, tests.v(1)),
    'Only the chair or secretary');
  -- The secretary records ratification; legacy passed motions can be ratified too.
  n := public.vote_ratify(array[v_ok, '00000000-0000-0000-0000-0000000000b1']::uuid[], tests.v(2), current_date);
  assert n = 2, 'two motions ratified';
  assert (select status from public.motions where id = v_ok) = 'ratified', 'approved → ratified';

  perform public.vote_refer_motion(v_ref, tests.chair(), 'Discuss at the meeting');
  perform public.vote_refer_motion(v_post, tests.chair(), 'Discuss at the meeting');
  perform public.vote_record_in_person(v_ref, tests.chair(), 'adopted', current_date, 'Adopted 5–0');
  assert (select status || '/' || in_person_result from public.motions where id = v_ref) = 'decided_in_person/adopted',
    'in-person outcome recorded';
  perform public.vote_record_in_person(v_post, tests.v(2), 'postponed', current_date, 'Next month');
  assert (select status from public.motions where id = v_post) = 'referred', 'postponed stays on the agenda';
end $$;

-- ─── 15. Guards: the record is permanent ────────────────────────────────────
do $$
declare v_id uuid := tests.new_vote('HFC-T-GUARD'); v_draft uuid := tests.new_draft('HFC-T-DRAFT');
begin
  perform public.vote_cast_ballot(v_id, tests.v(1), 'aye');
  perform tests.expect_error(format('delete from public.motions where id = %L', v_id), 'Only drafts can be deleted');
  perform tests.expect_error(format('delete from public.votes where motion_id = %L', v_id), 'permanent record');
  perform tests.expect_error(format('update public.motions set title = %L where id = %L', 'Changed', v_id),
    'cannot change after it is published');
  perform tests.expect_error(format('update public.motions set status = %L where id = %L', 'ratified', v_id),
    'cannot go from voting to ratified');
  perform tests.expect_error('update public.audit_log set event_type = ''x''', 'append-only');
  perform tests.expect_error('delete from public.audit_log', 'append-only');
  perform tests.expect_error(format('delete from public.motion_electorate where motion_id = %L', v_id), 'append-only');
  perform tests.expect_error(format(
    'insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values (%L, %L, %L, %L)',
    '00000000-0000-0000-0000-0000000000b1', tests.v(3), 'aye', 'x'), 'Voting is closed');
  -- A member with history cannot be deleted (their audit entries and ballots
  -- are permanent); the app retires members instead.
  perform tests.expect_error(format('delete from public.members where id = %L', tests.v(1)), 'append-only');

  -- A draft (with audit history) can still be deleted.
  perform private.audit(v_draft, tests.chair(), 'created', '{}'::jsonb);
  delete from public.motions where id = v_draft;
  assert not exists (select 1 from public.motions where id = v_draft), 'draft deleted';
  assert exists (select 1 from public.audit_log where motion_id = v_draft), 'its audit history remains';
end $$;

-- ─── 16. Chair hand-over and the single-chair rule ──────────────────────────
do $$
declare v_old uuid := tests.chair();
begin
  perform tests.expect_error(format('update public.members set role = %L where id = %L', 'chair', tests.v(3)),
    'members_one_active_chair');
  perform public.admin_transfer_chair(v_old, tests.v(3));
  assert tests.chair() = tests.v(3), 'new chair';
  assert (select role from public.members where id = v_old) = 'member', 'old chair is a member';
  perform public.admin_transfer_chair(tests.v(3), v_old);
  update public.members set role = 'member' where id = tests.v(3);
  assert tests.chair() = v_old, 'chair restored';
end $$;

-- ─── 17. Archiving hides a finished motion without changing its outcome ─────
do $$
declare
  m public.motions;
  v_id uuid;
begin
  select * into m from public.motions where id = '00000000-0000-0000-0000-0000000000b5';
  assert m.status = 'decided_failed', 'archived motion gets its outcome back from the audit log';
  assert m.archived_at is not null and m.archived_by = tests.chair(), 'archive kept as a marker';

  v_id := tests.new_vote('HFC-T17');
  perform tests.expect_error(format('update public.motions set archived_at = now() where id = %L', v_id),
    'Only finished motions');
  update public.motions set archived_at = null where id = m.id;
  update public.motions set archived_at = now() where id = m.id;
  assert (select status from public.motions where id = m.id) = 'decided_failed', 'outcome unchanged';
end $$;

-- ─── 18. Direct access from a member's session (Data API) ───────────────────
reset role;
grant usage on schema tests to authenticated;
set role authenticated;
set request.jwt.claims = '{"email": "v1@example.org"}';
do $$
begin
  assert (select count(*) from public.votes) > 0, 'members can read every ballot (votes are not secret)';
  perform tests.expect_error(format(
    'insert into public.votes (motion_id, member_id, vote, motion_hash_at_vote) values (%L, %L, %L, %L)',
    '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'aye', 'x'),
    'permission denied');
  perform tests.expect_error(format('select public.vote_cast_ballot(%L, %L, %L)',
    '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'aye'),
    'permission denied');
  perform tests.expect_error('select public.vote_close_expired()', 'permission denied');
end $$;
reset role;
reset request.jwt.claims;

select 'All voting engine tests passed' as result;
