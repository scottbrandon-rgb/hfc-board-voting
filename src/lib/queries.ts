import 'server-only';
import { one, query } from '@/lib/db';
import type { AttachmentRow, CommentRow, MotionRow } from '@/lib/db-types';
import type { CurrentMember } from '@/lib/dal';
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

// Every page reads through here. Who may see what is decided here (on
// Supabase it was the database's row-level security): any active member sees
// the board's record, except that a draft is visible only to the member who
// wrote it, the chair and the secretary. Queries run in parallel.

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

/**
 * SQL condition: a draft only for its author, the chair and the secretary.
 * `$1` must be the viewer's id and `$2` their role.
 */
const VISIBLE = `(status <> 'draft' or created_by = $1 or $2 in ('chair', 'secretary'))`;

/** May this viewer see this motion? (The same rule as VISIBLE.) */
export function canSeeMotion(
  motion: { status: string; created_by: string | null },
  viewer: CurrentMember,
): boolean {
  return (
    motion.status !== 'draft' ||
    motion.created_by === viewer.id ||
    viewer.role === 'chair' ||
    viewer.role === 'secretary'
  );
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
    const list = electorate.filter((e) => e.motion_id === id).map((e) => e.member_id);
    const ballots: Ballot[] = votes
      .filter((v) => v.motion_id === id)
      .map((v) => ({
        member_id: v.member_id,
        vote: v.vote,
        reason: v.reason,
        note: v.note,
        cast_at: v.cast_at,
        updated_at: v.updated_at,
        change_count: v.change_count,
      }));
    const mine = ballots.find((b) => b.member_id === viewer.id) ?? null;
    map.set(id, {
      progress: computeProgress(list, ballots),
      electorate: list,
      ballots,
      mine,
      viewerNeedsToVote: list.includes(viewer.id) && !mine && isVotingRole(viewer.role),
    });
  }
  return map;
}

export interface BoardSettings {
  next_meeting_at: string | null;
  next_meeting_location: string | null;
}

export async function getBoardSettings(): Promise<BoardSettings> {
  const data = await one<BoardSettings>(
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

export async function getHomeData(viewer: CurrentMember): Promise<HomeData> {
  const [motions, roster, settings, counts] = await Promise.all([
    query<MotionSummary>(
      `select ${SUMMARY_COLUMNS} from public.motions
        where status = any($3::text[]) and ${VISIBLE}
        order by created_at desc`,
      [viewer.id, viewer.role, [...IN_PROGRESS_STATUSES, 'draft']],
    ),
    getRoster(),
    getBoardSettings(),
    one<{ agenda: number; to_ratify: number }>(
      `select count(*) filter (where status = any($1::text[])) as agenda,
              count(*) filter (where status = any($2::text[])) as to_ratify
         from public.motions where archived_at is null`,
      [[...AGENDA_STATUSES], [...TO_RATIFY_STATUSES]],
    ),
  ]);

  const inProgress = motions.filter((m) => m.status !== 'draft');
  const drafts = motions.filter((m) => m.status === 'draft');
  const snapshots = await getVoteSnapshots(
    inProgress.filter((m) => m.status === 'voting').map((m) => m.id),
    viewer,
  );

  return {
    inProgress,
    drafts,
    snapshots,
    roster,
    settings,
    agendaCount: counts?.agenda ?? 0,
    toRatifyCount: counts?.to_ratify ?? 0,
  };
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
  const conditions: string[] = [VISIBLE];
  const params: unknown[] = [viewer.id, viewer.role];
  const where = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (filter === 'open') where('status = any(?::text[])', [...IN_PROGRESS_STATUSES]);
  else if (filter === 'approved') where('status = any(?::text[])', [...APPROVED_STATUSES]);
  else if (filter === 'referred') where('status = any(?::text[])', [...REFERRED_STATUSES]);
  else if (filter === 'drafts') where('status = ?', 'draft');
  else where('status <> ?', 'draft');

  // Plain words only: wildcards and punctuation are treated as spaces.
  const term = search
    .trim()
    .replace(/[%_,()"\\*:]/g, ' ')
    .trim();
  if (term) where('(title ilike ? or motion_number ilike ?)', `%${term}%`);

  const motions = await query<MotionSummary>(
    `select ${SUMMARY_COLUMNS} from public.motions
      where ${conditions.join(' and ')}
      order by created_at desc limit 200`,
    params,
  );
  const snapshots = await getVoteSnapshots(
    motions.filter((m) => m.status === 'voting').map((m) => m.id),
    viewer,
  );
  return { motions, snapshots };
}

// ─── Motion detail ────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export async function getMotionDetail(id: string, viewer: CurrentMember) {
  if (!isUuid(id)) return null;
  const motion = await one<MotionRow>('select * from public.motions where id = $1', [id]);
  if (!motion || !canSeeMotion(motion, viewer)) return null;

  type AttachmentSummary = Pick<
    AttachmentRow,
    'id' | 'file_name' | 'file_size' | 'content_type' | 'storage_path' | 'uploaded_at'
  >;
  const [roster, attachments, comments, snapshots] = await Promise.all([
    getRoster(),
    query<AttachmentSummary>(
      `select id, file_name, file_size, content_type, storage_path, uploaded_at
         from public.motion_attachments where motion_id = $1 order by uploaded_at`,
      [id],
    ),
    query<Pick<CommentRow, 'id' | 'body' | 'created_at' | 'member_id'>>(
      `select id, body, created_at, member_id
         from public.comments where motion_id = $1 order by created_at`,
      [id],
    ),
    getVoteSnapshots([id], viewer),
  ]);

  return {
    motion,
    roster,
    // Served by src/app/api/files/attachment/[id], which checks the viewer.
    attachments: attachments.map((a) => ({ ...a, url: `/api/files/attachment/${a.id}` })),
    comments,
    snapshot: snapshots.get(id)!,
  };
}

// ─── Meeting ──────────────────────────────────────────────────────────────────

export async function getMeetingData(viewer: CurrentMember) {
  type AgendaRow = MotionSummary &
    Pick<MotionRow, 'referral_note' | 'referred_by' | 'in_person_note' | 'meeting_date'>;
  const [settings, roster, agenda, toRatify, voting] = await Promise.all([
    getBoardSettings(),
    getRoster(),
    query<AgendaRow>(
      `select ${SUMMARY_COLUMNS}, referral_note, referred_by, in_person_note, meeting_date
         from public.motions
        where status = any($1::text[]) and archived_at is null
        order by referred_at asc nulls last`,
      [[...AGENDA_STATUSES]],
    ),
    query<MotionSummary & Pick<MotionRow, 'electorate_size'>>(
      `select ${SUMMARY_COLUMNS}, electorate_size
         from public.motions
        where status = any($1::text[]) and archived_at is null
        order by decided_at asc nulls last`,
      [[...TO_RATIFY_STATUSES]],
    ),
    query<MotionSummary>(`select ${SUMMARY_COLUMNS} from public.motions where status = 'voting'`),
  ]);

  const snapshots = await getVoteSnapshots(
    [...agenda.map((m) => m.id), ...voting.map((m) => m.id)],
    viewer,
  );
  const mayBeAdded = voting.filter((m) => (snapshots.get(m.id)?.progress.others ?? 0) > 0);

  return {
    settings,
    roster,
    agenda,
    toRatify,
    mayBeAdded,
    snapshots,
  };
}
