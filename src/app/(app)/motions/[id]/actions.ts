'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember, requireChair, requestContext, friendlyError } from '@/lib/dal';
import { one, query, rpc, safely } from '@/lib/db';
import { deleteFile } from '@/lib/files';
import { canSeeMotion } from '@/lib/queries';
import { canArchive, commentsOpen, type BallotChoice, type BallotReason } from '@/lib/rules';
import {
  notifyCall,
  notifyComment,
  notifyExtended,
  notifyOutcome,
  notifyPublished,
  notifyVotingOpened,
} from '@/lib/notify';
import { generateAndStorePdf } from '@/lib/generate-pdf';

export type ActionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; message?: string };

export type BallotState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      choice: BallotChoice;
      outcome: 'voting' | 'approved';
      ayes: number;
      electorate: number;
    };

/** Adds an entry to the audit log (append-only). */
async function audit(
  motionId: string,
  memberId: string,
  event: string,
  data: Record<string, unknown>,
  ctx?: { p_ip: string | null; p_user_agent: string | null },
) {
  await query(
    `insert into public.audit_log (motion_id, member_id, event_type, event_data, ip_address, user_agent)
     values ($1, $2, $3, $4, $5, $6)`,
    [motionId, memberId, event, data, ctx?.p_ip ?? null, ctx?.p_user_agent ?? null],
  );
}

function refresh(motionId: string) {
  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  revalidatePath('/motions');
  revalidatePath('/meeting');
}

function pdfAfter(motionId: string) {
  after(() =>
    generateAndStorePdf(motionId).catch((err) => console.error('[pdf] generation failed:', err)),
  );
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export async function publishDraft(motionId: string): Promise<ActionState> {
  const chair = await requireChair();
  const { error } = await rpc('vote_publish_motion', {
    p_motion_id: motionId,
    p_member_id: chair.id,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };
  after(() => notifyPublished(motionId));
  refresh(motionId);
  return { status: 'success' };
}

export async function deleteDraft(motionId: string): Promise<ActionState> {
  const chair = await requireChair();
  const motion = await one<{ id: string; status: string; motion_number: string }>(
    'select id, status, motion_number from public.motions where id = $1',
    [motionId],
  );
  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'draft') {
    return {
      status: 'error',
      message: 'Only drafts can be deleted. Published motions stay on record.',
    };
  }

  const attachments = await query<{ storage_path: string }>(
    'select storage_path from public.motion_attachments where motion_id = $1',
    [motionId],
  );

  const { error } = await safely(() =>
    query(`delete from public.motions where id = $1 and status = 'draft'`, [motionId]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };

  for (const a of attachments) {
    await deleteFile('motion-attachments', a.storage_path).catch((err) =>
      console.error('[files] could not delete', a.storage_path, err),
    );
  }
  await audit(motionId, chair.id, 'draft_deleted', { motion_number: motion.motion_number });

  revalidatePath('/');
  redirect('/');
}

// ─── Move, second, withdraw ──────────────────────────────────────────────────

export async function moveMotion(motionId: string): Promise<ActionState> {
  const member = await requireMember();
  const { error } = await rpc('vote_move_motion', {
    p_motion_id: motionId,
    p_member_id: member.id,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };
  refresh(motionId);
  return { status: 'success' };
}

export async function secondMotion(motionId: string): Promise<ActionState> {
  const member = await requireMember();
  const { data: status, error } = await rpc<string>('vote_second_motion', {
    p_motion_id: motionId,
    p_member_id: member.id,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  if (status === 'voting') {
    after(() => notifyVotingOpened(motionId));
  } else if (status === 'referred') {
    after(() => notifyOutcome(motionId));
    pdfAfter(motionId);
  }
  refresh(motionId);
  return { status: 'success' };
}

export async function withdrawMotion(motionId: string): Promise<ActionState> {
  const member = await requireMember();
  const { error } = await rpc('vote_withdraw_motion', {
    p_motion_id: motionId,
    p_member_id: member.id,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };
  refresh(motionId);
  return { status: 'success' };
}

// ─── Voting ──────────────────────────────────────────────────────────────────

const REASONS: readonly BallotReason[] = ['question', 'concern', 'conflict', 'other'];

export async function castBallot(
  motionId: string,
  _prev: BallotState,
  formData: FormData,
): Promise<BallotState> {
  const member = await requireMember();

  const choice = formData.get('choice');
  if (choice !== 'aye' && choice !== 'discuss') {
    return { status: 'error', message: 'Choose Aye or Discuss in person.' };
  }
  const rawReason = formData.get('reason');
  const reason =
    choice === 'discuss' &&
    typeof rawReason === 'string' &&
    (REASONS as readonly string[]).includes(rawReason)
      ? rawReason
      : null;
  const rawNote = formData.get('note');
  const note =
    choice === 'discuss' && typeof rawNote === 'string' ? rawNote.trim().slice(0, 1000) : '';

  const { data, error } = await rpc<Record<string, unknown>>('vote_cast_ballot', {
    p_motion_id: motionId,
    p_member_id: member.id,
    p_choice: choice,
    p_reason: reason,
    p_note: note || null,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  const result = (data ?? {}) as { status?: string; ayes?: number; electorate?: number };
  if (result.status === 'approved') {
    after(() => notifyOutcome(motionId));
    pdfAfter(motionId);
  }
  refresh(motionId);
  return {
    status: 'success',
    choice,
    outcome: result.status === 'approved' ? 'approved' : 'voting',
    ayes: result.ayes ?? 0,
    electorate: result.electorate ?? 0,
  };
}

// ─── Chair: refer, extend, notify ────────────────────────────────────────────

export async function referMotion(
  motionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const chair = await requireChair();
  const note = String(formData.get('note') ?? '').trim();
  if (note.length < 3)
    return { status: 'error', message: 'Add a note to the board explaining the referral.' };

  const { error } = await rpc('vote_refer_motion', {
    p_motion_id: motionId,
    p_member_id: chair.id,
    p_note: note,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  after(() => notifyOutcome(motionId));
  pdfAfter(motionId);
  refresh(motionId);
  return { status: 'success' };
}

export async function extendDeadline(
  motionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const chair = await requireChair();
  const days = Number(formData.get('days'));
  const note = String(formData.get('note') ?? '').trim();
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return { status: 'error', message: 'Extend by 1 to 7 days.' };
  }
  if (note.length < 3)
    return { status: 'error', message: 'Add a note to the board explaining the extension.' };

  const { error } = await rpc('vote_extend_deadline', {
    p_motion_id: motionId,
    p_member_id: chair.id,
    p_days: days,
    p_note: note,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  after(() => notifyExtended(motionId));
  refresh(motionId);
  return { status: 'success' };
}

/**
 * The chair's nudge: a call for a motion, a call for a second, or a reminder
 * to members who have not voted, depending on where the motion stands.
 */
export async function sendCall(motionId: string): Promise<ActionState> {
  const chair = await requireChair();
  const { data: status, error } = await rpc<string>('vote_mark_call', {
    p_motion_id: motionId,
    p_member_id: chair.id,
    ...(await requestContext()),
  });
  if (error) return { status: 'error', message: friendlyError(error) };

  after(() => notifyCall(motionId, status ?? ''));
  refresh(motionId);
  return {
    status: 'success',
    message:
      status === 'voting'
        ? 'Reminder sent.'
        : status === 'moved'
          ? 'Call for a second sent.'
          : 'Call for a motion sent.',
  };
}

/**
 * Chair: archive (hide from the meeting lists) or restore a finished motion.
 * The outcome and record are unchanged; the motion stays in the Motions list.
 */
export async function setArchived(motionId: string, archived: boolean): Promise<ActionState> {
  const chair = await requireChair();
  const motion = await one<{ status: string; motion_number: string; archived_at: string | null }>(
    'select status, motion_number, archived_at from public.motions where id = $1',
    [motionId],
  );
  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (archived && !canArchive(motion.status)) {
    return { status: 'error', message: 'Only finished motions can be archived.' };
  }
  if (!!motion.archived_at === archived) return { status: 'success' };

  const { error } = await safely(() =>
    archived
      ? query('update public.motions set archived_at = now(), archived_by = $2 where id = $1', [
          motionId,
          chair.id,
        ])
      : query('update public.motions set archived_at = null, archived_by = null where id = $1', [
          motionId,
        ]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };

  await audit(
    motionId,
    chair.id,
    archived ? 'archived' : 'unarchived',
    { motion_number: motion.motion_number, status: motion.status },
    await requestContext(),
  );

  refresh(motionId);
  return { status: 'success' };
}

// ─── Discussion ──────────────────────────────────────────────────────────────

export async function postComment(
  motionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const member = await requireMember();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { status: 'error', message: 'Write a comment first.' };
  if (body.length > 4000)
    return { status: 'error', message: 'Keep comments under 4,000 characters.' };

  const motion = await one<{ status: string; created_by: string }>(
    'select status, created_by from public.motions where id = $1',
    [motionId],
  );
  if (!motion || !canSeeMotion(motion, member))
    return { status: 'error', message: 'Motion not found.' };
  if (!commentsOpen(motion.status)) {
    return { status: 'error', message: 'Discussion is closed for this motion.' };
  }

  const { error } = await safely(() =>
    query('insert into public.comments (motion_id, member_id, body) values ($1, $2, $3)', [
      motionId,
      member.id,
      body,
    ]),
  );
  if (error) return { status: 'error', message: friendlyError(error) };

  after(() => notifyComment(motionId, member.id, body));
  revalidatePath(`/motions/${motionId}`);
  return { status: 'success' };
}
