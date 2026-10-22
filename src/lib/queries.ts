import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

// Reads use the member's own session, so the database's row-level security
// still applies (drafts stay hidden from members, and so on). Queries run in
// parallel; signed document links are created in a single request.

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

async function supabase() {
  return createClient();
}

export async function getRoster(): Promise<RosterEntry[]> {
  const db = await supabase();
  const { data } = await db
    .from('members')
    .select('id, full_name, role, is_active')
    .order('full_name');
  return data ?? [];
}

/** Ballots and voting lists for a set of motions, keyed by motion id. */
export async function getVoteSnapshots(
  motionIds: readonly string[],
  viewer: CurrentMember,
): Promise<Map<string, VoteSnapshot>> {
  const map = new Map<string, VoteSnapshot>();
  if (motionIds.length === 0) return map;
  const db = await supabase();
  const [{ data: electorate }, { data: votes }] = await Promise.all([
    db
      .from('motion_electorate')
      .select('motion_id, member_id')
      .in('motion_id', [...motionIds]),
    db
      .from('votes')
      .select('motion_id, member_id, vote, reason, note, cast_at, updated_at, change_count')
      .in('motion_id', [...motionIds]),
  ]);

  for (const id of motionIds) {
    const list = (electorate ?? []).filter((e) => e.motion_id === id).map((e) => e.member_id);
    const ballots = (votes ?? []).filter((v) => v.motion_id === id);
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
  const db = await supabase();
  const { data } = await db
    .from('board_settings')
    .select('next_meeting_at, next_meeting_location')
    .maybeSingle();
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
  const db = await supabase();
  const [{ data: motions }, roster, settings, { count: agendaCount }, { count: toRatifyCount }] =
    await Promise.all([
      db
        .from('motions')
        .select(SUMMARY_COLUMNS)
        .in('status', [...IN_PROGRESS_STATUSES, 'draft'])
        .order('created_at', { ascending: false }),
      getRoster(),
      getBoardSettings(),
      db
        .from('motions')
        .select('id', { count: 'exact', head: true })
        .in('status', [...AGENDA_STATUSES])
        .is('archived_at', null),
      db
        .from('motions')
        .select('id', { count: 'exact', head: true })
        .in('status', [...TO_RATIFY_STATUSES])
        .is('archived_at', null),
    ]);

  const all = motions ?? [];
  const inProgress = all.filter((m) => m.status !== 'draft');
  const drafts = all.filter((m) => m.status === 'draft');
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
    agendaCount: agendaCount ?? 0,
    toRatifyCount: toRatifyCount ?? 0,
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
  query: string,
  viewer: CurrentMember,
): Promise<{ motions: MotionSummary[]; snapshots: Map<string, VoteSnapshot> }> {
  const db = await supabase();
  let q = db.from('motions').select(SUMMARY_COLUMNS);

  if (filter === 'open') q = q.in('status', [...IN_PROGRESS_STATUSES]);
  else if (filter === 'approved') q = q.in('status', [...APPROVED_STATUSES]);
  else if (filter === 'referred') q = q.in('status', [...REFERRED_STATUSES]);
  else if (filter === 'drafts') q = q.eq('status', 'draft');
  else q = q.neq('status', 'draft');

  const term = query
    .trim()
    .replace(/[%_,()"\\*:]/g, ' ')
    .trim();
  if (term) q = q.or(`title.ilike.%${term}%,motion_number.ilike.%${term}%`);

  const { data } = await q.order('created_at', { ascending: false }).limit(200);
  const motions = data ?? [];
  const snapshots = await getVoteSnapshots(
    motions.filter((m) => m.status === 'voting').map((m) => m.id),
    viewer,
  );
  return { motions, snapshots };
}

// ─── Motion detail ────────────────────────────────────────────────────────────

export async function getMotionDetail(id: string, viewer: CurrentMember) {
  const db = await supabase();
  const { data: motion } = await db.from('motions').select('*').eq('id', id).maybeSingle();
  if (!motion) return null;

  const [roster, { data: attachments }, { data: comments }, snapshots] = await Promise.all([
    getRoster(),
    db
      .from('motion_attachments')
      .select('id, file_name, file_size, content_type, storage_path, uploaded_at')
      .eq('motion_id', id)
      .order('uploaded_at'),
    db
      .from('comments')
      .select('id, body, created_at, member_id')
      .eq('motion_id', id)
      .order('created_at'),
    getVoteSnapshots([id], viewer),
  ]);

  // Signed, short-lived links, created in one request.
  const admin = createAdminClient();
  const links = new Map<string, string>();
  if (attachments?.length) {
    const { data } = await admin.storage.from('motion-attachments').createSignedUrls(
      attachments.map((a) => a.storage_path),
      3600,
    );
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) links.set(row.path, row.signedUrl);
    }
  }

  return {
    motion,
    roster,
    attachments: (attachments ?? []).map((a) => ({ ...a, url: links.get(a.storage_path) ?? null })),
    comments: comments ?? [],
    snapshot: snapshots.get(id)!,
  };
}

// ─── Meeting ──────────────────────────────────────────────────────────────────

export async function getMeetingData(viewer: CurrentMember) {
  const db = await supabase();
  const [settings, roster, { data: agenda }, { data: toRatify }, { data: voting }] =
    await Promise.all([
      getBoardSettings(),
      getRoster(),
      db
        .from('motions')
        .select(`${SUMMARY_COLUMNS}, referral_note, referred_by, in_person_note, meeting_date`)
        .in('status', [...AGENDA_STATUSES])
        .is('archived_at', null)
        .order('referred_at', { ascending: true }),
      db
        .from('motions')
        .select(`${SUMMARY_COLUMNS}, electorate_size`)
        .in('status', [...TO_RATIFY_STATUSES])
        .is('archived_at', null)
        .order('decided_at', { ascending: true }),
      db.from('motions').select(SUMMARY_COLUMNS).eq('status', 'voting'),
    ]);

  const snapshots = await getVoteSnapshots(
    [...(agenda ?? []).map((m) => m.id), ...(voting ?? []).map((m) => m.id)],
    viewer,
  );
  const mayBeAdded = (voting ?? []).filter((m) => (snapshots.get(m.id)?.progress.others ?? 0) > 0);

  return {
    settings,
    roster,
    agenda: agenda ?? [],
    toRatify: toRatify ?? [],
    mayBeAdded,
    snapshots,
  };
}
