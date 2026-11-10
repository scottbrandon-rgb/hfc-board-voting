import 'server-only';
import { query, queryOne } from '@/lib/db';
import { seesDrafts, type CurrentMember } from '@/lib/dal';
import {
  AGENDA_STATUSES,
  APPROVED_STATUSES,
  IN_PROGRESS_STATUSES,
  REFERRED_STATUSES,
  TO_RATIFY_STATUSES,
  computeProgress,
  isVotingRole,
  type Progress,
} from '@/lib/rules';

// Every read here runs after requireMember() has checked the session. The one
// visibility rule (once enforced by Supabase row-level security) is applied in
// SQL: drafts are seen only by the chair, the secretary and whoever wrote them.
// Queries run in parallel.

export interface RosterEntry {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export interface Ballot {
  member_id: string;
  vote: string;
  reason: string | null;
  note: string | null;
  cast_at: string;
  updated_at: string | null;
  change_count: number;
}

export interface MotionSummary {
  id: string;
  motion_number: string;
  title: string;
  status: string;
  rules: string;
  moved_by: string | null;
  voting_deadline: string | null;
  published_at: string | null;
  moved_at: string | null;
  decided_at: string | null;
  created_at: string;
  referral_reason: string | null;
  last_call_sent_at: string | null;
  archived_at: string | null;
}

export interface VoteSnapshot {
  progress: Progress;
  electorate: string[];
  ballots: Ballot[];
  /** The viewer's ballot, if any. */
  mine: Ballot | null;
  /** True when the viewer is on this motion's voting list and has not voted. */
  viewerNeedsToVote: boolean;
}

const SUMMARY_COLUMNS =
  'id, motion_number, title, status, rules, moved_by, voting_deadline, published_at, moved_at, decided_at, created_at, referral_reason, last_call_sent_at, archived_at';

/** SQL condition: may `viewer` see this motion row (aliased as the table)? */
function visible(viewer: CurrentMember, values: unknown[]): string {
  values.push(viewer.id, seesDrafts(viewer));
  const id = values.length - 1;
  return `(status <> 'draft' or created_by = $${id} or $${id + 1}::boolean)`;
}

/** Adds a list of values to a query as one array parameter. */
function list(values: unknown[], items: readonly string[]): string {
  values.push([...items]);
  return `$${values.length}::text[]`;
}

export async function getRoster(): Promise<RosterEntry[]> {
  return query<RosterEntry>(
    'select id, full_name, role, is_active from public.members order by full_name',
  );
}

/** Ballots and voting lists for a set of motions, keyed by motion id. */
export async function getVoteSnapshots(
  motionIds: readonly string[],
  viewer: CurrentMember,
): Promise<Map<string, VoteSnapshot>> {
  const map = new Map<string, VoteSnapshot>();
  if (motionIds.length === 0) return map;
  const ids = [...motionIds];
  const [electorate, votes] = await Promise.all([
    query<{ motion_id: string; member_id: string }>(
      'select motion_id, member_id from public.motion_electorate where motion_id = any($1::uuid[])',
      [ids],
    ),
    query<Ballot & { motion_id: string }>(
      `select motion_id, member_id, vote, reason, note, cast_at, updated_at, change_count
         from public.votes where motion_id = any($1::uuid[])`,
      [ids],
    ),
  ]);

  for (const id of motionIds) {
    const voters = electorate.filter((e) => e.motion_id === id).map((e) => e.member_id);
    const ballots = votes.filter((v) => v.motion_id === id);
    const mine = ballots.find((b) => b.member_id === viewer.id) ?? null;
    map.set(id, {
      progress: computeProgress(voters, ballots),
      electorate: voters,
      ballots,
      mine,
      viewerNeedsToVote: voters.includes(viewer.id) && !mine && isVotingRole(viewer.role),
    });
  }
  return map;
}

export interface BoardSettings {
  next_meeting_at: string | null;
  next_meeting_location: string | null;
}

export async function getBoardSettings(): Promise<BoardSettings> {
  const data = await queryOne<BoardSettings>(
    'select next_meeting_at, next_meeting_location from public.board_settings limit 1',
  );
  return {
    next_meeting_at: data?.next_meeting_at ?? null,
    next_meeting_location: data?.next_meeting_location ?? null,
  };
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export interface HomeData {
  inProgress: MotionSummary[];
  drafts: MotionSummary[];
  snapshots: Map<string, VoteSnapshot>;
  roster: RosterEntry[];
  settings: BoardSettings;
  agendaCount: number;
  toRatifyCount: number;
}

async function countMotions(statuses: readonly string[], viewer: CurrentMember): Promise<number> {
  const values: unknown[] = [];
  const row = await queryOne<{ n: number }>(
    `select count(*)::int as n from public.motions
      where status = any(${list(values, statuses)}) and archived_at is null and ${visible(viewer, values)}`,
    values,
  );
  return row?.n ?? 0;
}

export async function getHomeData(viewer: CurrentMember): Promise<HomeData> {
  const values: unknown[] = [];
  const motionsSql = `select ${SUMMARY_COLUMNS} from public.motions
      where status = any(${list(values, [...IN_PROGRESS_STATUSES, 'draft'])}) and ${visible(viewer, values)}
      order by created_at desc`;
  const [all, roster, settings, agendaCount, toRatifyCount] = await Promise.all([
    query<MotionSummary>(motionsSql, values),
    getRoster(),
    getBoardSettings(),
    countMotions(AGENDA_STATUSES, viewer),
    countMotions(TO_RATIFY_STATUSES, viewer),
  ]);

  const inProgress = all.filter((m) => m.status !== 'draft');
  const drafts = all.filter((m) => m.status === 'draft');
  const snapshots = await getVoteSnapshots(
    inProgress.filter((m) => m.status === 'voting').map((m) => m.id),
    viewer,
  );

  return { inProgress, drafts, snapshots, roster, settings, agendaCount, toRatifyCount };
}

// ─── Motions list ─────────────────────────────────────────────────────────────

export type MotionFilter = 'open' | 'approved' | 'referred' | 'all' | 'drafts';

export function parseFilter(value: string | undefined): MotionFilter {
  return value === 'approved' || value === 'referred' || value === 'all' || value === 'drafts'
    ? value
    : 'open';
}

export async function listMotions(
  filter: MotionFilter,
  search: string,
  viewer: CurrentMember,
): Promise<{ motions: MotionSummary[]; snapshots: Map<string, VoteSnapshot> }> {
  const values: unknown[] = [];
  const where: string[] = [visible(viewer, values)];

  if (filter === 'open') where.push(`status = any(${list(values, IN_PROGRESS_STATUSES)})`);
  else if (filter === 'approved') where.push(`status = any(${list(values, APPROVED_STATUSES)})`);
  else if (filter === 'referred') where.push(`status = any(${list(values, REFERRED_STATUSES)})`);
  else if (filter === 'drafts') where.push(`status = 'draft'`);
  else where.push(`status <> 'draft'`);

  const term = search
    .trim()
    .replace(/[%_\\]/g, ' ')
    .trim();
  if (term) {
    values.push(`%${term}%`);
    where.push(`(title ilike $${values.length} or motion_number ilike $${values.length})`);
  }

  const motions = await query<MotionSummary>(
    `select ${SUMMARY_COLUMNS} from public.motions where ${where.join(' and ')}
      order by created_at desc limit 200`,
    values,
  );
  const snapshots = await getVoteSnapshots(
    motions.filter((m) => m.status === 'voting').map((m) => m.id),
    viewer,
  );
  return { motions, snapshots };
}

// ─── Motion detail ────────────────────────────────────────────────────────────

export interface MotionRecord {
  id: string;
  motion_number: string;
  title: string;
  description: string;
  background: string | null;
  status: string;
  rules: string;
  result: string | null;
  created_by: string | null;
  created_at: string;
  moved_by: string | null;
  moved_at: string | null;
  seconded_by: string | null;
  seconded_at: string | null;
  published_at: string | null;
  voting_opened_at: string | null;
  voting_deadline: string | null;
  voting_period_days: number;
  electorate_size: number | null;
  decided_at: string | null;
  ratified_at: string | null;
  ratified_by: string | null;
  withdrawn_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  motion_text_hash: string | null;
  deadline_extended_at: string | null;
  deadline_extension_note: string | null;
  referred_at: string | null;
  referred_by: string | null;
  referral_reason: string | null;
  referral_note: string | null;
  reminder_24h_sent_at: string | null;
  reminder_final_sent_at: string | null;
  last_call_sent_at: string | null;
  meeting_date: string | null;
  in_person_result: string | null;
  in_person_note: string | null;
  in_person_recorded_at: string | null;
  in_person_recorded_by: string | null;
}

/** Can `viewer` see this motion? (Drafts: chair, secretary, author.) */
export async function canSeeMotion(motionId: string, viewer: CurrentMember): Promise<boolean> {
  const values: unknown[] = [motionId];
  const row = await queryOne<{ id: string }>(
    `select id from public.motions where id = $1 and ${visible(viewer, values)}`,
    values,
  );
  return row !== null;
}

export async function getMotionDetail(id: string, viewer: CurrentMember) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const values: unknown[] = [id];
  const motion = await queryOne<MotionRecord>(
    `select * from public.motions where id = $1 and ${visible(viewer, values)}`,
    values,
  );
  if (!motion) return null;

  const [roster, attachments, comments, snapshots] = await Promise.all([
    getRoster(),
    query<{
      id: string;
      file_name: string;
      file_size: number;
      content_type: string;
      storage_path: string;
      uploaded_at: string;
    }>(
      `select id, file_name, file_size, content_type, storage_path, uploaded_at
         from public.motion_attachments where motion_id = $1 order by uploaded_at`,
      [id],
    ),
    query<{ id: string; body: string; created_at: string; member_id: string | null }>(
      `select id, body, created_at, member_id from public.comments
        where motion_id = $1 order by created_at`,
      [id],
    ),
    getVoteSnapshots([id], viewer),
  ]);

  return {
    motion,
    roster,
    // Documents are served through the app, which checks the session first.
    attachments: attachments.map((a) => ({ ...a, url: `/files/attachments/${a.id}` })),
    comments,
    snapshot: snapshots.get(id)!,
  };
}

// ─── Meeting ──────────────────────────────────────────────────────────────────

export async function getMeetingData(viewer: CurrentMember) {
  const agendaValues: unknown[] = [];
  const agendaSql = `select ${SUMMARY_COLUMNS}, referral_note, referred_by, in_person_note, meeting_date
      from public.motions
     where status = any(${list(agendaValues, AGENDA_STATUSES)}) and archived_at is null
     order by referred_at asc nulls last`;
  const ratifyValues: unknown[] = [];
  const ratifySql = `select ${SUMMARY_COLUMNS}, electorate_size from public.motions
     where status = any(${list(ratifyValues, TO_RATIFY_STATUSES)}) and archived_at is null
     order by decided_at asc nulls last`;

  const [settings, roster, agenda, toRatify, voting] = await Promise.all([
    getBoardSettings(),
    getRoster(),
    query<
      MotionSummary & {
        referral_note: string | null;
        referred_by: string | null;
        in_person_note: string | null;
        meeting_date: string | null;
      }
    >(agendaSql, agendaValues),
    query<MotionSummary & { electorate_size: number | null }>(ratifySql, ratifyValues),
    query<MotionSummary>(`select ${SUMMARY_COLUMNS} from public.motions where status = 'voting'`),
  ]);

  const snapshots = await getVoteSnapshots(
    [...agenda.map((m) => m.id), ...voting.map((m) => m.id)],
    viewer,
  );
  const mayBeAdded = voting.filter((m) => (snapshots.get(m.id)?.progress.others ?? 0) > 0);

  return { settings, roster, agenda, toRatify, mayBeAdded, snapshots };
}
