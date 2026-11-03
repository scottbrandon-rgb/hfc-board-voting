-- 0001_baseline.sql
--
-- The board's database as it stood on Supabase in November 2026 (migrations
-- 001–015 in archive/supabase/migrations), rebuilt for Netlify Database.
--
-- Left out, because they belonged to Supabase and nothing here needs them:
--   * row-level security policies and the Data API grants (anon /
--     authenticated / service_role). The app's server is now the only thing
--     that connects; who may see what is checked in src/lib/queries.ts and
--     src/lib/dal.ts.
--   * private.current_member_id() / current_member_role(), which read the
--     Supabase sign-in token.
--   * the storage buckets (files now live in Netlify Blobs).
--
-- Kept exactly: the tables, constraints and indexes, and the voting engine
-- (every vote_* function and the guard triggers). The one change is in
-- private.guard_votes: the one-time import of the Supabase records may set
-- `hfc.importing` for its own transaction so past ballots can be copied in
-- (see src/lib/import-supabase.ts). Nothing else sets it.
--
-- Written so it can safely run again on a half-built database.

create schema if not exists private;
revoke all on schema private from public;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  email text not null constraint members_email_key unique,
  full_name text not null,
  role text not null constraint members_role_check check (role in ('chair', 'secretary', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  phone text,
  notify_new_motions boolean not null default true,
  notify_comments boolean not null default true,
  notify_results boolean not null default true
);

create index if not exists members_email_lower_idx on public.members (lower(email));
create unique index if not exists members_one_active_chair
  on public.members (role) where role = 'chair' and is_active;

create table if not exists public.motions (
  id uuid primary key default gen_random_uuid(),
  motion_number text not null constraint motions_motion_number_key unique,
  title text not null,
  description text not null,
  status text not null default 'draft' constraint motions_status_check check (status in (
    'draft', 'open', 'moved', 'seconded', 'voting',
    'approved', 'referred', 'ratified', 'decided_in_person', 'withdrawn',
    -- Previous rules. No new motion enters these statuses.
    'decided_passed', 'decided_failed', 'decided_deferred', 'died_no_motion', 'died_no_second'
  )),
  created_by uuid not null constraint motions_created_by_fkey references public.members(id) on delete set null,
  moved_by uuid constraint motions_moved_by_fkey references public.members(id) on delete set null,
  seconded_by uuid constraint motions_seconded_by_fkey references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  moved_at timestamptz,
  seconded_at timestamptz,
  voting_opened_at timestamptz,
  decided_at timestamptz,
  ratified_at timestamptz,
  ratified_by uuid constraint motions_ratified_by_fkey references public.members(id) on delete set null,
  result text constraint motions_result_check check (
    result is null or result in ('passed', 'failed', 'deferred', 'died', 'approved', 'referred')
  ),
  motion_text_hash text,
  withdrawn_at timestamptz,
  archived_at timestamptz,
  archived_by uuid constraint motions_archived_by_fkey references public.members(id),
  rules text not null default 'unanimous_v1' constraint motions_rules_check check (rules in ('legacy', 'unanimous_v1')),
  background text,
  voting_period_days int not null default 5 constraint motions_voting_period_days_check check (voting_period_days between 1 and 14),
  voting_deadline timestamptz,
  electorate_size int,
  deadline_extended_at timestamptz,
  deadline_extension_note text,
  referred_at timestamptz,
  referred_by uuid constraint motions_referred_by_fkey references public.members(id) on delete set null,
  referral_reason text constraint motions_referral_reason_check check (referral_reason is null or referral_reason in (
    'discuss_in_person', 'no_response', 'chair', 'not_moved', 'not_seconded', 'no_quorum'
  )),
  referral_note text,
  reminder_24h_sent_at timestamptz,
  reminder_final_sent_at timestamptz,
  last_call_sent_at timestamptz,
  meeting_date date,
  in_person_result text constraint motions_in_person_result_check check (
    in_person_result is null or in_person_result in ('adopted', 'not_adopted', 'postponed')
  ),
  in_person_note text,
  in_person_recorded_at timestamptz,
  in_person_recorded_by uuid constraint motions_in_person_recorded_by_fkey references public.members(id) on delete set null
);

create index if not exists motions_status_idx on public.motions (status);
create index if not exists motions_created_by_idx on public.motions (created_by);
create index if not exists motions_decided_at_idx on public.motions (decided_at desc);
create index if not exists motions_status_deadline_idx on public.motions (status, voting_deadline);

create table if not exists public.motion_attachments (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null constraint motion_attachments_motion_id_fkey references public.motions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint not null,
  content_type text not null,
  file_hash text not null,
  uploaded_by uuid not null constraint motion_attachments_uploaded_by_fkey references public.members(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists motion_attachments_motion_idx on public.motion_attachments (motion_id);

-- The voting members when voting opened on a motion (frozen).
create table if not exists public.motion_electorate (
  motion_id uuid not null constraint motion_electorate_motion_id_fkey references public.motions(id) on delete cascade,
  member_id uuid not null constraint motion_electorate_member_id_fkey references public.members(id) on delete restrict,
  primary key (motion_id, member_id)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null constraint votes_motion_id_fkey references public.motions(id) on delete cascade,
  -- A ballot belongs to the permanent record: removing a member must not remove it.
  member_id uuid not null constraint votes_member_id_fkey references public.members(id) on delete restrict,
  vote text not null constraint votes_vote_check check (vote in (
    'aye', 'discuss',
    -- Previous rules.
    'nay', 'abstain', 'defer', 'auto_abstain'
  )),
  cast_at timestamptz not null default now(),
  motion_hash_at_vote text not null,
  ip_address inet,
  user_agent text,
  reason text constraint votes_reason_check check (reason is null or reason in ('question', 'concern', 'conflict', 'other')),
  note text constraint votes_note_check check (note is null or char_length(note) <= 1000),
  updated_at timestamptz,
  change_count int not null default 0,
  constraint votes_motion_id_member_id_key unique (motion_id, member_id)
);

create index if not exists votes_motion_idx on public.votes (motion_id);
create index if not exists votes_motion_cast_at_idx on public.votes (motion_id, cast_at);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null constraint comments_motion_id_fkey references public.motions(id) on delete cascade,
  member_id uuid constraint comments_member_id_fkey references public.members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_motion_idx on public.comments (motion_id);

-- Append-only. Entries outlive the rows they describe (a deleted draft keeps
-- its history), so motions are referenced by value, not by foreign key.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid,
  member_id uuid constraint audit_log_member_id_fkey references public.members(id) on delete set null,
  event_type text not null,
  event_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_motion_idx on public.audit_log (motion_id);
create index if not exists audit_log_event_type_idx on public.audit_log (event_type);
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

create table if not exists public.board_settings (
  id boolean primary key default true constraint board_settings_id_check check (id),
  next_meeting_at timestamptz,
  next_meeting_location text constraint board_settings_next_meeting_location_check check (
    next_meeting_location is null or char_length(next_meeting_location) <= 200
  ),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint board_settings_updated_by_fkey references public.members(id) on delete set null
);
insert into public.board_settings (id) values (true) on conflict (id) do nothing;

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function private.active_role(p_member_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select role from public.members where id = p_member_id and is_active = true
$$;

create or replace function private.audit(
  p_motion_id uuid,
  p_member_id uuid,
  p_event text,
  p_data jsonb,
  p_ip inet default null,
  p_user_agent text default null
)
returns void
language sql
set search_path = public
as $$
  insert into public.audit_log (motion_id, member_id, event_type, event_data, ip_address, user_agent)
  values (p_motion_id, p_member_id, p_event, p_data, p_ip, p_user_agent)
$$;

create or replace function private.ballot_counts(p_motion_id uuid)
returns table (ayes int, others int, cast_count int)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where v.vote = 'aye')::int,
    count(*) filter (where v.vote <> 'aye')::int,
    count(*)::int
  from public.votes v
  join public.motion_electorate e
    on e.motion_id = v.motion_id and e.member_id = v.member_id
  where v.motion_id = p_motion_id
$$;

-- sha256(title + "\n" + description + "\n" + sorted attachment hashes), the
-- same formula as computeMotionTextHash in src/lib/motions.ts.
create or replace function private.motion_text_hash(p_motion_id uuid)
returns text
language sql
stable
set search_path = public
as $$
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

create or replace function private.refer(
  p_motion_id uuid,
  p_reason text,
  p_actor uuid default null,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
set search_path = public
as $$
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

-- Opens voting on a seconded motion: freezes the electorate, fingerprints the
-- motion text and sets the deadline. Fewer than 3 seated voting members means
-- no quorum, so the motion goes to the in-person meeting instead.
create or replace function private.open_voting(p_motion_id uuid)
returns text
language plpgsql
set search_path = public
as $$
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


-- ─── Motion lifecycle ────────────────────────────────────────────────────────

create or replace function public.vote_publish_motion(
  p_motion_id uuid,
  p_member_id uuid,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

create or replace function public.vote_move_motion(
  p_motion_id uuid,
  p_member_id uuid,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

-- Seconding opens voting in the same transaction.
create or replace function public.vote_second_motion(
  p_motion_id uuid,
  p_member_id uuid,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

create or replace function public.vote_withdraw_motion(
  p_motion_id uuid,
  p_member_id uuid,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

-- Records or changes a ballot. The last Aye approves the motion immediately.
create or replace function public.vote_cast_ballot(
  p_motion_id uuid,
  p_member_id uuid,
  p_choice text,
  p_reason text default null,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
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

create or replace function public.vote_refer_motion(
  p_motion_id uuid,
  p_member_id uuid,
  p_note text,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

create or replace function public.vote_extend_deadline(
  p_motion_id uuid,
  p_member_id uuid,
  p_days int,
  p_note text,
  p_ip inet default null,
  p_user_agent text default null
)
returns timestamptz
language plpgsql
set search_path = public
as $$
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

-- Records that the chair sent a call for a motion, a call for a second, or a
-- reminder to members who have not voted. Limited to once an hour per motion.
create or replace function public.vote_mark_call(
  p_motion_id uuid,
  p_member_id uuid,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

-- Run by the scheduled job. Closes votes whose deadline has passed and refers
-- motions that were never moved or seconded within the voting period.
create or replace function public.vote_close_expired()
returns table (r_motion_id uuid, r_outcome text, r_reason text)
language plpgsql
set search_path = public
as $$
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

-- Run by the scheduled job. Returns each open vote that is due a reminder and
-- marks it sent in the same statement, so a reminder goes out exactly once:
-- one about 24 hours before the deadline and a final one about 4 hours before.
create or replace function public.vote_claim_reminders()
returns table (r_motion_id uuid, r_kind text)
language plpgsql
set search_path = public
as $$
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

-- ─── In-person meeting ───────────────────────────────────────────────────────

create or replace function public.vote_ratify(
  p_motion_ids uuid[],
  p_member_id uuid,
  p_meeting_date date,
  p_ip inet default null,
  p_user_agent text default null
)
returns int
language plpgsql
set search_path = public
as $$
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

create or replace function public.vote_record_in_person(
  p_motion_id uuid,
  p_member_id uuid,
  p_result text,
  p_meeting_date date,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
set search_path = public
as $$
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

-- ─── Board administration ────────────────────────────────────────────────────

create or replace function public.admin_transfer_chair(
  p_from_member_id uuid,
  p_to_member_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
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

-- ─── Guards ──────────────────────────────────────────────────────────────────

create or replace function private.guard_motion_update()
returns trigger
language plpgsql
set search_path = public
as $$
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

create or replace function private.guard_motion_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Only drafts can be deleted. Published motions are part of the permanent record.';
  end if;
  return old;
end;
$$;

create or replace function private.guard_votes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  -- The one-time import of past records copies ballots of motions that are
  -- already decided. It marks its own transaction; nothing else does.
  if tg_op = 'INSERT' and current_setting('hfc.importing', true) = 'on' then
    return new;
  end if;
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

create or replace function private.guard_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only.', tg_table_name;
end;
$$;

drop trigger if exists motions_guard_update on public.motions;
create trigger motions_guard_update
  before update on public.motions
  for each row execute function private.guard_motion_update();

drop trigger if exists motions_guard_delete on public.motions;
create trigger motions_guard_delete
  before delete on public.motions
  for each row execute function private.guard_motion_delete();

drop trigger if exists votes_guard on public.votes;
create trigger votes_guard
  before insert or update or delete on public.votes
  for each row execute function private.guard_votes();

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function private.guard_append_only();

drop trigger if exists motion_electorate_append_only on public.motion_electorate;
create trigger motion_electorate_append_only
  before update or delete on public.motion_electorate
  for each row execute function private.guard_append_only();
