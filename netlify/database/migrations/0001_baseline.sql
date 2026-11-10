-- Baseline: the HFC Deacon Board schema as it stood on Supabase after
-- migrations 001–015 (verified against the production project, November 2026).
--
-- Generated from those migrations with the Supabase-only parts removed:
--   * row-level-security policies and the auth.jwt() helpers they used
--     (the app now reads with its own server connection and applies the
--     drafts rule itself, in src/lib/queries.ts),
--   * grants to Supabase's anon / authenticated / service_role roles,
--   * the storage schema (files now live in Netlify Blobs).
--
-- The voting rules are unchanged: the vote_* functions, guards and triggers
-- are byte-for-byte the production definitions. Netlify applies this file
-- once, before the first deploy that uses Netlify Database is published.

-- SQL functions below refer to tables created further down.
set check_function_bodies = false;

CREATE SCHEMA private;

CREATE FUNCTION private.active_role(p_member_id uuid) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select role from public.members where id = p_member_id and is_active = true
$$;

CREATE FUNCTION private.audit(p_motion_id uuid, p_member_id uuid, p_event text, p_data jsonb, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public'
    AS $$
  insert into public.audit_log (motion_id, member_id, event_type, event_data, ip_address, user_agent)
  values (p_motion_id, p_member_id, p_event, p_data, p_ip, p_user_agent)
$$;

CREATE FUNCTION private.ballot_counts(p_motion_id uuid) RETURNS TABLE(ayes integer, others integer, cast_count integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    count(*) filter (where v.vote = 'aye')::int,
    count(*) filter (where v.vote <> 'aye')::int,
    count(*)::int
  from public.votes v
  join public.motion_electorate e
    on e.motion_id = v.motion_id and e.member_id = v.member_id
  where v.motion_id = p_motion_id
$$;

CREATE FUNCTION private.guard_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception '% is append-only.', tg_table_name;
end;
$$;

CREATE FUNCTION private.guard_motion_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status <> 'draft' then
    raise exception 'Only drafts can be deleted. Published motions are part of the permanent record.';
  end if;
  return old;
end;
$$;

CREATE FUNCTION private.guard_motion_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if old.status <> 'draft' and (
       new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.background is distinct from old.background
    or new.motion_number is distinct from old.motion_number
  ) then
    raise exception 'A motion''s text cannot change after it is published.';
  end if;
  if old.motion_text_hash is not null
     and new.motion_text_hash is distinct from old.motion_text_hash then
    raise exception 'A motion''s fingerprint cannot change once voting has opened.';
  end if;
  if new.archived_at is not null and old.archived_at is null and new.status not in (
    'ratified', 'decided_in_person', 'withdrawn',
    'decided_passed', 'decided_failed', 'decided_deferred', 'died_no_motion', 'died_no_second'
  ) then
    raise exception 'Only finished motions can be archived.';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if (old.status, new.status) not in (
    ('draft', 'open'),
    ('open', 'moved'), ('open', 'referred'),
    ('moved', 'seconded'), ('moved', 'withdrawn'), ('moved', 'referred'),
    ('seconded', 'voting'), ('seconded', 'referred'),
    ('voting', 'approved'), ('voting', 'referred'),
    ('approved', 'ratified'),
    ('referred', 'decided_in_person'),
    ('decided_passed', 'ratified'),
    ('decided_deferred', 'decided_in_person')
  ) then
    raise exception 'A motion cannot go from % to %.', old.status, new.status;
  end if;
  return new;
end;
$$;

CREATE FUNCTION private.guard_votes() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ballots are part of the permanent record and cannot be deleted.';
  end if;
  if tg_op = 'UPDATE' and (new.motion_id <> old.motion_id or new.member_id <> old.member_id) then
    raise exception 'A ballot cannot be moved to another motion or member.';
  end if;
  select status into v_status from public.motions where id = new.motion_id;
  if v_status is distinct from 'voting' then
    raise exception 'Voting is closed for this motion.';
  end if;
  return new;
end;
$$;

CREATE FUNCTION private.motion_text_hash(p_motion_id uuid) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select encode(sha256(convert_to(
    m.title || E'\n' || m.description || E'\n' ||
    coalesce((
      select string_agg(a.file_hash, '' order by a.file_hash collate "C")
      from public.motion_attachments a
      where a.motion_id = m.id
    ), ''),
    'UTF8')), 'hex')
  from public.motions m
  where m.id = p_motion_id
$$;

CREATE FUNCTION private.open_voting(p_motion_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
  v_size int;
  v_hash text;
  v_deadline timestamptz;
begin
  select * into m from public.motions where id = p_motion_id for update;
  if m.status <> 'seconded' then
    raise exception 'The motion must be seconded before voting opens.';
  end if;

  insert into public.motion_electorate (motion_id, member_id)
  select p_motion_id, id
    from public.members
   where is_active and role in ('member', 'secretary');
  get diagnostics v_size = row_count;

  if v_size < 3 then
    update public.motions set electorate_size = v_size where id = p_motion_id;
    perform private.refer(p_motion_id, 'no_quorum');
    return 'referred';
  end if;

  v_hash := private.motion_text_hash(p_motion_id);
  v_deadline := now() + make_interval(days => m.voting_period_days);

  update public.motions
     set status = 'voting',
         voting_opened_at = now(),
         voting_deadline = v_deadline,
         electorate_size = v_size,
         motion_text_hash = v_hash
   where id = p_motion_id;

  perform private.audit(
    p_motion_id, null, 'voting_opened',
    jsonb_build_object(
      'motion_number', m.motion_number,
      'motion_text_hash', v_hash,
      'electorate_size', v_size,
      'voting_deadline', v_deadline
    )
  );
  return 'voting';
end;
$$;

CREATE FUNCTION private.refer(p_motion_id uuid, p_reason text, p_actor uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_counts record;
begin
  update public.motions
     set status = 'referred',
         result = 'referred',
         referral_reason = p_reason,
         referral_note = p_note,
         referred_at = now(),
         referred_by = p_actor,
         decided_at = now()
   where id = p_motion_id;

  select * into v_counts from private.ballot_counts(p_motion_id);
  perform private.audit(
    p_motion_id, p_actor, 'referred',
    jsonb_build_object(
      'reason', p_reason,
      'note', p_note,
      'ayes', v_counts.ayes,
      'other_ballots', v_counts.others
    ),
    p_ip, p_user_agent
  );
end;
$$;

CREATE FUNCTION public.admin_transfer_chair(p_from_member_id uuid, p_to_member_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if private.active_role(p_from_member_id) is distinct from 'chair' then
    raise exception 'Only the current chair can hand over the chair.';
  end if;
  if p_from_member_id = p_to_member_id then
    raise exception 'Choose another member.';
  end if;
  if private.active_role(p_to_member_id) is null then
    raise exception 'The new chair must be an active member.';
  end if;

  update public.members set role = 'member' where id = p_from_member_id;
  update public.members set role = 'chair' where id = p_to_member_id;
  perform private.audit(null, p_from_member_id, 'chair_transferred',
    jsonb_build_object('from', p_from_member_id, 'to', p_to_member_id));
end;
$$;

CREATE FUNCTION public.vote_cast_ballot(p_motion_id uuid, p_member_id uuid, p_choice text, p_reason text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
  v_prev public.votes;
  v_had_prev boolean;
  v_reason text := p_reason;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_role text;
  v_counts record;
begin
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status <> 'voting' then raise exception 'Voting is closed for this motion.'; end if;
  if m.voting_deadline is not null and now() >= m.voting_deadline then
    raise exception 'The voting deadline has passed.';
  end if;
  if p_choice is null or p_choice not in ('aye', 'discuss') then
    raise exception 'Choose Aye or Discuss in person.';
  end if;

  v_role := private.active_role(p_member_id);
  if v_role is null or v_role not in ('member', 'secretary') then
    raise exception 'Only voting members can vote.';
  end if;
  if not exists (
    select 1 from public.motion_electorate
     where motion_id = p_motion_id and member_id = p_member_id
  ) then
    raise exception 'You were not on the board when voting opened on this motion.';
  end if;

  if p_choice = 'aye' then
    v_reason := null;
    v_note := null;
  elsif v_reason is not null and v_reason not in ('question', 'concern', 'conflict', 'other') then
    raise exception 'Unknown reason.';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.';
  end if;

  select * into v_prev from public.votes
   where motion_id = p_motion_id and member_id = p_member_id;
  v_had_prev := found;

  if v_had_prev then
    if v_prev.vote = p_choice
       and v_prev.reason is not distinct from v_reason
       and v_prev.note is not distinct from v_note then
      select * into v_counts from private.ballot_counts(p_motion_id);
      return jsonb_build_object('status', 'voting', 'ayes', v_counts.ayes,
        'electorate', m.electorate_size, 'changed', false);
    end if;
    update public.votes
       set vote = p_choice,
           reason = v_reason,
           note = v_note,
           updated_at = now(),
           change_count = change_count + 1,
           motion_hash_at_vote = m.motion_text_hash,
           ip_address = p_ip,
           user_agent = p_user_agent
     where id = v_prev.id;
  else
    insert into public.votes
      (motion_id, member_id, vote, reason, note, motion_hash_at_vote, ip_address, user_agent)
    values
      (p_motion_id, p_member_id, p_choice, v_reason, v_note, m.motion_text_hash, p_ip, p_user_agent);
  end if;

  perform private.audit(
    p_motion_id, p_member_id,
    case when v_had_prev then 'vote_changed' else 'vote_cast' end,
    jsonb_build_object(
      'motion_number', m.motion_number,
      'vote', p_choice,
      'reason', v_reason,
      'previous_vote', case when v_had_prev then v_prev.vote end
    ),
    p_ip, p_user_agent
  );

  select * into v_counts from private.ballot_counts(p_motion_id);
  if v_counts.ayes >= m.electorate_size and m.electorate_size > 0 then
    update public.motions
       set status = 'approved', result = 'approved', decided_at = now()
     where id = p_motion_id;
    perform private.audit(p_motion_id, null, 'approved',
      jsonb_build_object('motion_number', m.motion_number, 'ayes', v_counts.ayes));
    return jsonb_build_object('status', 'approved', 'ayes', v_counts.ayes,
      'electorate', m.electorate_size, 'changed', v_had_prev);
  end if;

  return jsonb_build_object('status', 'voting', 'ayes', v_counts.ayes,
    'electorate', m.electorate_size, 'changed', v_had_prev);
end;
$$;

CREATE FUNCTION public.vote_claim_reminders() RETURNS TABLE(r_motion_id uuid, r_kind text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
begin
  for m in
    select * from public.motions
     where status = 'voting'
       and voting_deadline > now()
       and voting_deadline <= now() + interval '4 hours'
       and reminder_final_sent_at is null
     for update skip locked
  loop
    update public.motions
       set reminder_final_sent_at = now(),
           reminder_24h_sent_at = coalesce(reminder_24h_sent_at, now())
     where id = m.id;
    r_motion_id := m.id; r_kind := 'final';
    return next;
  end loop;

  for m in
    select * from public.motions
     where status = 'voting'
       and voting_deadline > now() + interval '4 hours'
       and voting_deadline <= now() + interval '24 hours'
       and voting_opened_at <= now() - interval '2 hours'
       and reminder_24h_sent_at is null
     for update skip locked
  loop
    update public.motions set reminder_24h_sent_at = now() where id = m.id;
    r_motion_id := m.id; r_kind := '24h';
    return next;
  end loop;
end;
$$;

CREATE FUNCTION public.vote_close_expired() RETURNS TABLE(r_motion_id uuid, r_outcome text, r_reason text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
  v_counts record;
  v_reason text;
begin
  for m in
    select * from public.motions
     where status = 'voting' and voting_deadline <= now()
     for update skip locked
  loop
    select * into v_counts from private.ballot_counts(m.id);
    if v_counts.ayes >= m.electorate_size and m.electorate_size > 0 then
      update public.motions
         set status = 'approved', result = 'approved', decided_at = now()
       where id = m.id;
      perform private.audit(m.id, null, 'approved',
        jsonb_build_object('motion_number', m.motion_number, 'ayes', v_counts.ayes));
      r_motion_id := m.id; r_outcome := 'approved'; r_reason := null;
    else
      v_reason := case when v_counts.others > 0 then 'discuss_in_person' else 'no_response' end;
      perform private.refer(m.id, v_reason);
      r_motion_id := m.id; r_outcome := 'referred'; r_reason := v_reason;
    end if;
    return next;
  end loop;

  for m in
    select * from public.motions
     where status = 'open' and rules = 'unanimous_v1'
       and published_at <= now() - make_interval(days => voting_period_days)
     for update skip locked
  loop
    perform private.refer(m.id, 'not_moved');
    r_motion_id := m.id; r_outcome := 'referred'; r_reason := 'not_moved';
    return next;
  end loop;

  for m in
    select * from public.motions
     where status = 'moved' and rules = 'unanimous_v1'
       and moved_at <= now() - make_interval(days => voting_period_days)
     for update skip locked
  loop
    perform private.refer(m.id, 'not_seconded');
    r_motion_id := m.id; r_outcome := 'referred'; r_reason := 'not_seconded';
    return next;
  end loop;
end;
$$;

CREATE FUNCTION public.vote_extend_deadline(p_motion_id uuid, p_member_id uuid, p_days integer, p_note text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS timestamp with time zone
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
  v_note text := btrim(coalesce(p_note, ''));
  v_deadline timestamptz;
begin
  if private.active_role(p_member_id) is distinct from 'chair' then
    raise exception 'Only the chair can extend a deadline.';
  end if;
  if p_days is null or p_days < 1 or p_days > 7 then
    raise exception 'Extend by 1 to 7 days.';
  end if;
  if char_length(v_note) < 3 then
    raise exception 'Add a note to the board explaining the extension.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status <> 'voting' or now() >= m.voting_deadline then
    raise exception 'Only an open vote can be extended.';
  end if;
  if m.deadline_extended_at is not null then
    raise exception 'This deadline has already been extended once.';
  end if;

  v_deadline := m.voting_deadline + make_interval(days => p_days);
  update public.motions
     set voting_deadline = v_deadline,
         deadline_extended_at = now(),
         deadline_extension_note = v_note,
         reminder_24h_sent_at = null,
         reminder_final_sent_at = null
   where id = p_motion_id;
  perform private.audit(p_motion_id, p_member_id, 'deadline_extended',
    jsonb_build_object('motion_number', m.motion_number, 'days', p_days,
      'previous_deadline', m.voting_deadline, 'new_deadline', v_deadline, 'note', v_note),
    p_ip, p_user_agent);
  return v_deadline;
end;
$$;

CREATE FUNCTION public.vote_mark_call(p_motion_id uuid, p_member_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
begin
  if private.active_role(p_member_id) is distinct from 'chair' then
    raise exception 'Only the chair can send this.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status not in ('open', 'moved', 'voting') then
    raise exception 'There is nothing to send for this motion right now.';
  end if;
  if m.last_call_sent_at is not null and m.last_call_sent_at > now() - interval '1 hour' then
    raise exception 'A notice was already sent in the last hour.';
  end if;

  update public.motions set last_call_sent_at = now() where id = p_motion_id;
  perform private.audit(p_motion_id, p_member_id,
    case m.status when 'open' then 'call_for_motion'
                  when 'moved' then 'call_for_second'
                  else 'reminder_sent' end,
    jsonb_build_object('motion_number', m.motion_number), p_ip, p_user_agent);
  return m.status;
end;
$$;

CREATE FUNCTION public.vote_move_motion(p_motion_id uuid, p_member_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
begin
  if private.active_role(p_member_id) is null
     or private.active_role(p_member_id) not in ('member', 'secretary') then
    raise exception 'Only a voting member can move a motion.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status <> 'open' then
    raise exception 'This motion is no longer waiting for someone to move it.';
  end if;

  update public.motions
     set status = 'moved', moved_by = p_member_id, moved_at = now()
   where id = p_motion_id;
  perform private.audit(p_motion_id, p_member_id, 'moved',
    jsonb_build_object('motion_number', m.motion_number), p_ip, p_user_agent);
  return 'moved';
end;
$$;

CREATE FUNCTION public.vote_publish_motion(p_motion_id uuid, p_member_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
begin
  if private.active_role(p_member_id) is distinct from 'chair' then
    raise exception 'Only the chair can publish a motion.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status <> 'draft' then raise exception 'Only a draft can be published.'; end if;

  update public.motions
     set status = 'open', published_at = now(), rules = 'unanimous_v1'
   where id = p_motion_id;
  perform private.audit(p_motion_id, p_member_id, 'published',
    jsonb_build_object('motion_number', m.motion_number), p_ip, p_user_agent);
  return 'open';
end;
$$;

CREATE FUNCTION public.vote_ratify(p_motion_ids uuid[], p_member_id uuid, p_meeting_date date, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_count int := 0;
begin
  if private.active_role(p_member_id) is null
     or private.active_role(p_member_id) not in ('chair', 'secretary') then
    raise exception 'Only the chair or secretary can record ratification.';
  end if;
  if p_meeting_date is null then
    raise exception 'Enter the meeting date.';
  end if;

  for v_id in
    update public.motions
       set status = 'ratified', ratified_by = p_member_id, ratified_at = now(),
           meeting_date = p_meeting_date
     where id = any(p_motion_ids) and status in ('approved', 'decided_passed')
    returning id
  loop
    perform private.audit(v_id, p_member_id, 'ratified',
      jsonb_build_object('meeting_date', p_meeting_date), p_ip, p_user_agent);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

CREATE FUNCTION public.vote_record_in_person(p_motion_id uuid, p_member_id uuid, p_result text, p_meeting_date date, p_note text DEFAULT NULL::text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if private.active_role(p_member_id) is null
     or private.active_role(p_member_id) not in ('chair', 'secretary') then
    raise exception 'Only the chair or secretary can record a meeting outcome.';
  end if;
  if p_result is null or p_result not in ('adopted', 'not_adopted', 'postponed') then
    raise exception 'Choose Adopted, Not adopted, or Postponed.';
  end if;
  if p_meeting_date is null then
    raise exception 'Enter the meeting date.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status not in ('referred', 'decided_deferred') then
    raise exception 'This motion is not waiting for the in-person meeting.';
  end if;

  if p_result = 'postponed' then
    update public.motions
       set in_person_note = v_note, meeting_date = p_meeting_date
     where id = p_motion_id;
  else
    update public.motions
       set status = 'decided_in_person',
           in_person_result = p_result,
           in_person_note = v_note,
           in_person_recorded_at = now(),
           in_person_recorded_by = p_member_id,
           meeting_date = p_meeting_date
     where id = p_motion_id;
  end if;

  perform private.audit(p_motion_id, p_member_id, 'in_person_outcome',
    jsonb_build_object('result', p_result, 'meeting_date', p_meeting_date, 'note', v_note),
    p_ip, p_user_agent);
  return case when p_result = 'postponed' then 'referred' else 'decided_in_person' end;
end;
$$;

CREATE FUNCTION public.vote_refer_motion(p_motion_id uuid, p_member_id uuid, p_note text, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if private.active_role(p_member_id) is distinct from 'chair' then
    raise exception 'Only the chair can refer a motion to the meeting.';
  end if;
  if char_length(v_note) < 3 then
    raise exception 'Add a note to the board explaining the referral.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note under 1,000 characters.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status not in ('open', 'moved', 'seconded', 'voting') then
    raise exception 'This motion can no longer be referred.';
  end if;

  perform private.refer(p_motion_id, 'chair', p_member_id, v_note, p_ip, p_user_agent);
  return 'referred';
end;
$$;

CREATE FUNCTION public.vote_second_motion(p_motion_id uuid, p_member_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
begin
  if private.active_role(p_member_id) is null
     or private.active_role(p_member_id) not in ('member', 'secretary') then
    raise exception 'Only a voting member can second a motion.';
  end if;
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status <> 'moved' then
    raise exception 'This motion is not waiting for a second.';
  end if;
  if m.moved_by = p_member_id then
    raise exception 'The member who moved a motion cannot also second it.';
  end if;

  update public.motions
     set status = 'seconded', seconded_by = p_member_id, seconded_at = now()
   where id = p_motion_id;
  perform private.audit(p_motion_id, p_member_id, 'seconded',
    jsonb_build_object('motion_number', m.motion_number), p_ip, p_user_agent);

  return private.open_voting(p_motion_id);
end;
$$;

CREATE FUNCTION public.vote_withdraw_motion(p_motion_id uuid, p_member_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  m public.motions;
begin
  select * into m from public.motions where id = p_motion_id for update;
  if not found then raise exception 'Motion not found.'; end if;
  if m.status <> 'moved' then
    raise exception 'A motion can only be withdrawn while it waits for a second.';
  end if;
  if m.moved_by is distinct from p_member_id then
    raise exception 'Only the member who moved this motion can withdraw it.';
  end if;

  update public.motions
     set status = 'withdrawn', withdrawn_at = now(), decided_at = now()
   where id = p_motion_id;
  perform private.audit(p_motion_id, p_member_id, 'withdrawn',
    jsonb_build_object('motion_number', m.motion_number), p_ip, p_user_agent);
  return 'withdrawn';
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motion_id uuid,
    member_id uuid,
    event_type text NOT NULL,
    event_data jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.board_settings (
    id boolean DEFAULT true NOT NULL,
    next_meeting_at timestamp with time zone,
    next_meeting_location text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT board_settings_id_check CHECK (id),
    CONSTRAINT board_settings_next_meeting_location_check CHECK (((next_meeting_location IS NULL) OR (char_length(next_meeting_location) <= 200)))
);

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motion_id uuid NOT NULL,
    member_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_new_motions boolean DEFAULT true NOT NULL,
    notify_comments boolean DEFAULT true NOT NULL,
    notify_results boolean DEFAULT true NOT NULL,
    phone text,
    CONSTRAINT members_role_check CHECK ((role = ANY (ARRAY['chair'::text, 'secretary'::text, 'member'::text])))
);

CREATE TABLE public.motion_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motion_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    content_type text NOT NULL,
    file_hash text NOT NULL,
    uploaded_by uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.motion_electorate (
    motion_id uuid NOT NULL,
    member_id uuid NOT NULL
);

CREATE TABLE public.motions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motion_number text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid NOT NULL,
    moved_by uuid,
    seconded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    moved_at timestamp with time zone,
    seconded_at timestamp with time zone,
    voting_opened_at timestamp with time zone,
    decided_at timestamp with time zone,
    ratified_at timestamp with time zone,
    ratified_by uuid,
    result text,
    motion_text_hash text,
    withdrawn_at timestamp with time zone,
    archived_at timestamp with time zone,
    archived_by uuid,
    rules text DEFAULT 'unanimous_v1'::text NOT NULL,
    background text,
    voting_period_days integer DEFAULT 5 NOT NULL,
    voting_deadline timestamp with time zone,
    electorate_size integer,
    deadline_extended_at timestamp with time zone,
    deadline_extension_note text,
    referred_at timestamp with time zone,
    referred_by uuid,
    referral_reason text,
    referral_note text,
    reminder_24h_sent_at timestamp with time zone,
    reminder_final_sent_at timestamp with time zone,
    last_call_sent_at timestamp with time zone,
    meeting_date date,
    in_person_result text,
    in_person_note text,
    in_person_recorded_at timestamp with time zone,
    in_person_recorded_by uuid,
    CONSTRAINT motions_in_person_result_check CHECK (((in_person_result IS NULL) OR (in_person_result = ANY (ARRAY['adopted'::text, 'not_adopted'::text, 'postponed'::text])))),
    CONSTRAINT motions_referral_reason_check CHECK (((referral_reason IS NULL) OR (referral_reason = ANY (ARRAY['discuss_in_person'::text, 'no_response'::text, 'chair'::text, 'not_moved'::text, 'not_seconded'::text, 'no_quorum'::text])))),
    CONSTRAINT motions_result_check CHECK (((result IS NULL) OR (result = ANY (ARRAY['passed'::text, 'failed'::text, 'deferred'::text, 'died'::text, 'approved'::text, 'referred'::text])))),
    CONSTRAINT motions_rules_check CHECK ((rules = ANY (ARRAY['legacy'::text, 'unanimous_v1'::text]))),
    CONSTRAINT motions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'moved'::text, 'seconded'::text, 'voting'::text, 'approved'::text, 'referred'::text, 'ratified'::text, 'decided_in_person'::text, 'withdrawn'::text, 'decided_passed'::text, 'decided_failed'::text, 'decided_deferred'::text, 'died_no_motion'::text, 'died_no_second'::text]))),
    CONSTRAINT motions_voting_period_days_check CHECK (((voting_period_days >= 1) AND (voting_period_days <= 14)))
);

CREATE TABLE public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motion_id uuid NOT NULL,
    member_id uuid NOT NULL,
    vote text NOT NULL,
    cast_at timestamp with time zone DEFAULT now() NOT NULL,
    motion_hash_at_vote text NOT NULL,
    ip_address inet,
    user_agent text,
    reason text,
    note text,
    updated_at timestamp with time zone,
    change_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT votes_note_check CHECK (((note IS NULL) OR (char_length(note) <= 1000))),
    CONSTRAINT votes_reason_check CHECK (((reason IS NULL) OR (reason = ANY (ARRAY['question'::text, 'concern'::text, 'conflict'::text, 'other'::text])))),
    CONSTRAINT votes_vote_check CHECK ((vote = ANY (ARRAY['aye'::text, 'discuss'::text, 'nay'::text, 'abstain'::text, 'defer'::text, 'auto_abstain'::text])))
);

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.board_settings
    ADD CONSTRAINT board_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_email_key UNIQUE (email);

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.motion_attachments
    ADD CONSTRAINT motion_attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.motion_electorate
    ADD CONSTRAINT motion_electorate_pkey PRIMARY KEY (motion_id, member_id);

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_motion_number_key UNIQUE (motion_number);

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_motion_id_member_id_key UNIQUE (motion_id, member_id);

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);

CREATE INDEX audit_log_event_type_idx ON public.audit_log USING btree (event_type);

CREATE INDEX audit_log_motion_idx ON public.audit_log USING btree (motion_id);

CREATE INDEX comments_motion_idx ON public.comments USING btree (motion_id);

CREATE INDEX members_email_lower_idx ON public.members USING btree (lower(email));

CREATE UNIQUE INDEX members_one_active_chair ON public.members USING btree (role) WHERE ((role = 'chair'::text) AND is_active);

CREATE INDEX motion_attachments_motion_idx ON public.motion_attachments USING btree (motion_id);

CREATE INDEX motions_created_by_idx ON public.motions USING btree (created_by);

CREATE INDEX motions_decided_at_idx ON public.motions USING btree (decided_at DESC);

CREATE INDEX motions_status_deadline_idx ON public.motions USING btree (status, voting_deadline);

CREATE INDEX motions_status_idx ON public.motions USING btree (status);

CREATE INDEX votes_motion_cast_at_idx ON public.votes USING btree (motion_id, cast_at);

CREATE INDEX votes_motion_idx ON public.votes USING btree (motion_id);

CREATE TRIGGER audit_log_append_only BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION private.guard_append_only();

CREATE TRIGGER motion_electorate_append_only BEFORE DELETE OR UPDATE ON public.motion_electorate FOR EACH ROW EXECUTE FUNCTION private.guard_append_only();

CREATE TRIGGER motions_guard_delete BEFORE DELETE ON public.motions FOR EACH ROW EXECUTE FUNCTION private.guard_motion_delete();

CREATE TRIGGER motions_guard_update BEFORE UPDATE ON public.motions FOR EACH ROW EXECUTE FUNCTION private.guard_motion_update();

CREATE TRIGGER votes_guard BEFORE INSERT OR DELETE OR UPDATE ON public.votes FOR EACH ROW EXECUTE FUNCTION private.guard_votes();

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.board_settings
    ADD CONSTRAINT board_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_motion_id_fkey FOREIGN KEY (motion_id) REFERENCES public.motions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.motion_attachments
    ADD CONSTRAINT motion_attachments_motion_id_fkey FOREIGN KEY (motion_id) REFERENCES public.motions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.motion_attachments
    ADD CONSTRAINT motion_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.motion_electorate
    ADD CONSTRAINT motion_electorate_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.motion_electorate
    ADD CONSTRAINT motion_electorate_motion_id_fkey FOREIGN KEY (motion_id) REFERENCES public.motions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.members(id);

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_in_person_recorded_by_fkey FOREIGN KEY (in_person_recorded_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_ratified_by_fkey FOREIGN KEY (ratified_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.motions
    ADD CONSTRAINT motions_seconded_by_fkey FOREIGN KEY (seconded_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_motion_id_fkey FOREIGN KEY (motion_id) REFERENCES public.motions(id) ON DELETE CASCADE;


-- The single settings row the meeting page updates.
insert into public.board_settings (id) values (true) on conflict (id) do nothing;
