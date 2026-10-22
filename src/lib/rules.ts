// Shared vocabulary for the board's voting rules. Pure functions only, so the
// same labels and calculations are used by server pages, client components,
// emails and tests. The rules themselves are enforced in the database
// (supabase/migrations/015_unanimous_voting.sql); this file describes them.

export type Role = 'chair' | 'secretary' | 'member';

/** Members who vote online. The chair does not. */
export const VOTING_ROLES: readonly Role[] = ['member', 'secretary'];

export function isVotingRole(role: string): boolean {
  return (VOTING_ROLES as readonly string[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  chair: 'Chair',
  secretary: 'Secretary',
  member: 'Member',
};

export type MotionStatus =
  | 'draft'
  | 'open'
  | 'moved'
  | 'seconded'
  | 'voting'
  | 'approved'
  | 'referred'
  | 'ratified'
  | 'decided_in_person'
  | 'withdrawn'
  | 'decided_passed'
  | 'decided_failed'
  | 'decided_deferred'
  | 'died_no_motion'
  | 'died_no_second';

/** Statuses only motions decided under the previous rules can have. */
export const LEGACY_STATUSES: readonly string[] = [
  'decided_passed',
  'decided_failed',
  'decided_deferred',
  'died_no_motion',
  'died_no_second',
];

export const IN_PROGRESS_STATUSES: readonly string[] = ['open', 'moved', 'seconded', 'voting'];
export const APPROVED_STATUSES: readonly string[] = ['approved', 'ratified', 'decided_passed'];
export const REFERRED_STATUSES: readonly string[] = [
  'referred',
  'decided_in_person',
  'decided_deferred',
];
/** Waiting for the in-person meeting. */
export const AGENDA_STATUSES: readonly string[] = ['referred', 'decided_deferred'];
/** Waiting for ratification at the in-person meeting. */
export const TO_RATIFY_STATUSES: readonly string[] = ['approved', 'decided_passed'];

export type Tone = 'neutral' | 'brand' | 'brand-solid' | 'good' | 'warn' | 'dashed';
export type ChipIcon = 'check' | 'message' | 'clock' | 'calendar' | null;

export interface StatusChipInfo {
  label: string;
  tone: Tone;
  icon: ChipIcon;
}

const STATUS_CHIPS: Record<string, StatusChipInfo> = {
  draft: { label: 'Draft', tone: 'neutral', icon: null },
  open: { label: 'Waiting for a motion', tone: 'brand', icon: null },
  moved: { label: 'Waiting for a second', tone: 'brand', icon: null },
  seconded: { label: 'Seconded', tone: 'brand', icon: null },
  voting: { label: 'Voting open', tone: 'brand', icon: null },
  approved: { label: 'Approved', tone: 'good', icon: 'check' },
  referred: { label: 'Referred to meeting', tone: 'warn', icon: 'calendar' },
  ratified: { label: 'Ratified', tone: 'good', icon: 'check' },
  decided_in_person: { label: 'Decided in person', tone: 'neutral', icon: null },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', icon: null },
  decided_passed: { label: 'Passed (previous rules)', tone: 'neutral', icon: null },
  decided_failed: { label: 'Failed (previous rules)', tone: 'neutral', icon: null },
  decided_deferred: { label: 'Deferred (previous rules)', tone: 'neutral', icon: null },
  died_no_motion: { label: 'Not moved (previous rules)', tone: 'neutral', icon: null },
  died_no_second: { label: 'Not seconded (previous rules)', tone: 'neutral', icon: null },
};

export function statusChip(status: string): StatusChipInfo {
  return STATUS_CHIPS[status] ?? { label: status, tone: 'neutral', icon: null };
}

/**
 * The chip for an open vote, from the viewer's point of view: whether the
 * viewer still needs to vote, and whether the motion is on track for
 * approval or headed to the meeting.
 */
export function votingChip(progress: Progress, viewerNeedsToVote: boolean): StatusChipInfo {
  if (viewerNeedsToVote) return { label: 'Your vote needed', tone: 'brand-solid', icon: null };
  if (progress.others > 0) return { label: 'Headed to meeting', tone: 'warn', icon: 'message' };
  return { label: 'On track', tone: 'good', icon: 'check' };
}

export type BallotChoice = 'aye' | 'discuss';
export type BallotReason = 'question' | 'concern' | 'conflict' | 'other';

export const BALLOT_REASONS: readonly { value: BallotReason; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'concern', label: 'Concern' },
  { value: 'conflict', label: 'Conflict of interest' },
  { value: 'other', label: 'Other' },
];

export function reasonLabel(reason: string | null | undefined): string | null {
  return BALLOT_REASONS.find((r) => r.value === reason)?.label ?? null;
}

const VOTE_LABELS: Record<string, string> = {
  aye: 'Aye',
  discuss: 'Discuss in person',
  nay: 'Nay',
  abstain: 'Abstain',
  defer: 'Defer to in-person',
  auto_abstain: 'No response',
};

export function voteLabel(vote: string): string {
  return VOTE_LABELS[vote] ?? vote;
}

const REFERRAL_REASONS: Record<string, string> = {
  discuss_in_person: 'A member asked to discuss it in person',
  no_response: 'Not every member voted by the deadline',
  chair: 'Referred by the chair',
  not_moved: 'No one moved it within the voting period',
  not_seconded: 'No one seconded it within the voting period',
  no_quorum: 'Fewer than 3 voting members were seated',
};

export function referralReasonLabel(reason: string | null | undefined): string {
  return (reason && REFERRAL_REASONS[reason]) || 'Referred to the in-person meeting';
}

const IN_PERSON_RESULTS: Record<string, string> = {
  adopted: 'Adopted at the meeting',
  not_adopted: 'Not adopted at the meeting',
  postponed: 'Postponed',
};

export function inPersonResultLabel(result: string | null | undefined): string | null {
  return (result && IN_PERSON_RESULTS[result]) || null;
}

export type Segment = 'aye' | 'other' | 'waiting';

export interface Progress {
  ayes: number;
  others: number;
  waiting: number;
  electorate: number;
  /** Ayes first, then other ballots, then members still to vote. */
  segments: Segment[];
}

/**
 * Where an open vote stands. Only ballots from the electorate (the voting
 * members when voting opened) count, matching the database.
 */
export function computeProgress(
  electorateIds: readonly string[],
  ballots: readonly { member_id: string; vote: string }[],
): Progress {
  const electorate = new Set(electorateIds);
  let ayes = 0;
  let others = 0;
  for (const b of ballots) {
    if (!electorate.has(b.member_id)) continue;
    if (b.vote === 'aye') ayes++;
    else others++;
  }
  const waiting = Math.max(0, electorate.size - ayes - others);
  return {
    ayes,
    others,
    waiting,
    electorate: electorate.size,
    segments: [
      ...Array<Segment>(ayes).fill('aye'),
      ...Array<Segment>(others).fill('other'),
      ...Array<Segment>(waiting).fill('waiting'),
    ],
  };
}

/** One sentence describing an open vote, e.g. "3 of 5 Aye · waiting on 2". */
export function progressSummary(p: Progress): string {
  const parts = [`${p.ayes} of ${p.electorate} Aye`];
  if (p.others > 0) parts.push(`${p.others} asked to discuss`);
  if (p.waiting > 0) parts.push(`waiting on ${p.waiting}`);
  return parts.join(' · ');
}

export function isFinal(status: string): boolean {
  return [
    'ratified',
    'decided_in_person',
    'withdrawn',
    'decided_failed',
    'died_no_motion',
    'died_no_second',
  ].includes(status);
}

/** Finished motions the chair may archive (hide from the meeting lists). */
export const ARCHIVABLE_STATUSES: readonly string[] = [
  'ratified',
  'decided_in_person',
  'withdrawn',
  'decided_passed',
  'decided_failed',
  'decided_deferred',
  'died_no_motion',
  'died_no_second',
];

export function canArchive(status: string): boolean {
  return ARCHIVABLE_STATUSES.includes(status);
}

/** Members may comment until a motion is finally settled. */
export function commentsOpen(status: string): boolean {
  return status !== 'draft' && !isFinal(status) && !LEGACY_STATUSES.includes(status);
}

export const VOTING_PERIOD_CHOICES = [3, 5, 7] as const;
export const DEFAULT_VOTING_PERIOD = 5;

export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** File picker filter; the server and the storage bucket enforce the same list. */
export const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,application/pdf,image/*';
