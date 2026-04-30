'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireMember, requireChair } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeMotionTextHash } from '@/lib/motions';
import {
  notifyMotionPublished,
  notifyVotingOpened,
  notifyVotingClosed,
  notifyVoteReminder,
  notifyMotionRatified,
} from '@/lib/email';
import { generateAndStorePdf } from '@/lib/generate-pdf';

export type ActionState = { status: 'idle' } | { status: 'error'; message: string };
export type VoteState = { status: 'idle' } | { status: 'error'; message: string } | { status: 'success' };
export type CommentState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

async function auditCtx() {
  const h = await headers();
  return {
    ip_address: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: h.get('user-agent') ?? null,
  };
}

// ─── Publish draft ───────────────────────────────────────────────────────────

export async function publishDraft(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, title')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'draft')
    return { status: 'error', message: 'Only draft motions can be published.' };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('motions')
    .update({ status: 'open', published_at: now })
    .eq('id', motionId)
    .eq('status', 'draft');

  if (error) return { status: 'error', message: `Could not publish motion: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'published',
    event_data: { motion_number: motion.motion_number },
    ...ctx,
  });

  // Notify all active members
  const { data: allMembers } = await admin
    .from('members')
    .select('email')
    .eq('is_active', true);
  const emails = (allMembers ?? []).map((m) => m.email);
  void notifyMotionPublished(emails, motionId, motion.motion_number, motion.title);

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Delete draft ─────────────────────────────────────────────────────────────

export async function deleteDraft(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'draft')
    return { status: 'error', message: 'Only draft motions can be deleted.' };

  // Remove storage objects for all attachments first
  const { data: attachments } = await admin
    .from('motion_attachments')
    .select('storage_path')
    .eq('motion_id', motionId);

  if (attachments && attachments.length > 0) {
    await admin.storage
      .from('motion-attachments')
      .remove(attachments.map((a) => a.storage_path));
  }

  // Delete the motion row — cascade removes attachments, audit_log, comments
  const { error } = await admin
    .from('motions')
    .delete()
    .eq('id', motionId)
    .eq('status', 'draft');

  if (error) return { status: 'error', message: `Could not delete motion: ${error.message}` };

  revalidatePath('/');
  redirect('/');
}

// ─── Move ────────────────────────────────────────────────────────────────────

export async function moveMotion(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireMember();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number')
    .eq('id', motionId)
    .maybeSingle();

  if (member.role === 'chair')
    return { status: 'error', message: 'The chair cannot make a motion.' };
  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'open')
    return {
      status: 'error',
      message: 'Motion is no longer open — it may have already been moved.',
    };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('motions')
    .update({ status: 'moved', moved_by: member.id, moved_at: now })
    .eq('id', motionId)
    .eq('status', 'open'); // optimistic concurrency guard

  if (error) return { status: 'error', message: `Could not record move: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'moved',
    event_data: { motion_number: motion.motion_number },
    ...ctx,
  });

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Second ──────────────────────────────────────────────────────────────────

export async function secondMotion(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireMember();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, moved_by')
    .eq('id', motionId)
    .maybeSingle();

  if (member.role === 'chair')
    return { status: 'error', message: 'The chair cannot second a motion.' };
  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'moved')
    return { status: 'error', message: 'Motion is not currently awaiting a second.' };
  if (motion.moved_by === member.id)
    return { status: 'error', message: 'The mover cannot second their own motion.' };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('motions')
    .update({ status: 'seconded', seconded_by: member.id, seconded_at: now })
    .eq('id', motionId)
    .eq('status', 'moved');

  if (error) return { status: 'error', message: `Could not record second: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'seconded',
    event_data: { motion_number: motion.motion_number },
    ...ctx,
  });

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Withdraw ────────────────────────────────────────────────────────────────

export async function withdrawMotion(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireMember();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, moved_by')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'moved')
    return { status: 'error', message: 'Motion can only be withdrawn while awaiting a second.' };
  if (motion.moved_by !== member.id)
    return { status: 'error', message: 'Only the mover can withdraw this motion.' };

  const { error } = await admin
    .from('motions')
    .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('id', motionId)
    .eq('status', 'moved');

  if (error) return { status: 'error', message: `Could not withdraw motion: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'withdrawn',
    event_data: { motion_number: motion.motion_number },
    ...ctx,
  });

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Open Voting ─────────────────────────────────────────────────────────────

export async function openVoting(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, title, description')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'seconded')
    return { status: 'error', message: 'Motion must be seconded before voting can open.' };

  // Fetch attachment hashes to compute motion_text_hash
  const { data: attachments } = await admin
    .from('motion_attachments')
    .select('file_hash')
    .eq('motion_id', motionId);

  const attachmentHashes = (attachments ?? []).map((a) => a.file_hash);
  const motionTextHash = computeMotionTextHash(motion.title, motion.description, attachmentHashes);

  const now = new Date().toISOString();
  const { error } = await admin
    .from('motions')
    .update({ status: 'voting', voting_opened_at: now, motion_text_hash: motionTextHash })
    .eq('id', motionId)
    .eq('status', 'seconded');

  if (error) return { status: 'error', message: `Could not open voting: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'voting_opened',
    event_data: { motion_number: motion.motion_number, motion_text_hash: motionTextHash },
    ...ctx,
  });

  // Notify all active members that voting is open
  const { data: allMembers } = await admin
    .from('members')
    .select('email')
    .eq('is_active', true);
  const emails = (allMembers ?? []).map((m) => m.email);
  void notifyVotingOpened(emails, motionId, motion.motion_number, motion.title);

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Cast Vote ────────────────────────────────────────────────────────────────

const VALID_VOTES = ['aye', 'nay', 'abstain', 'defer'] as const;
type VoteChoice = (typeof VALID_VOTES)[number];

export async function castVote(
  motionId: string,
  _prev: VoteState,
  formData: FormData,
): Promise<VoteState> {
  const member = await requireMember();

  if (member.role === 'chair')
    return { status: 'error', message: 'The chair does not cast a vote.' };

  const vote = formData.get('vote') as string | null;
  if (!vote || !VALID_VOTES.includes(vote as VoteChoice))
    return { status: 'error', message: 'Please select a valid vote option.' };

  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, motion_text_hash')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'voting')
    return { status: 'error', message: 'Voting is not currently open for this motion.' };
  if (!motion.motion_text_hash)
    return { status: 'error', message: 'Motion integrity hash is missing — contact the chair.' };

  // Guard against duplicate votes
  const { data: existing } = await admin
    .from('votes')
    .select('id')
    .eq('motion_id', motionId)
    .eq('member_id', member.id)
    .maybeSingle();

  if (existing) return { status: 'error', message: 'You have already cast a vote on this motion.' };

  const ctx = await auditCtx();
  const { error } = await admin.from('votes').insert({
    motion_id: motionId,
    member_id: member.id,
    vote,
    motion_hash_at_vote: motion.motion_text_hash,
    ip_address: ctx.ip_address,
    user_agent: ctx.user_agent,
  });

  if (error) return { status: 'error', message: `Could not record vote: ${error.message}` };

  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'vote_cast',
    event_data: { motion_number: motion.motion_number, vote },
    ...ctx,
  });

  revalidatePath(`/motions/${motionId}`);
  return { status: 'success' };
}

// ─── Close Voting ─────────────────────────────────────────────────────────────

export async function closeVoting(
  motionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const result = formData.get('result') as string | null;
  if (!result || !['passed', 'failed', 'deferred'].includes(result))
    return { status: 'error', message: 'Please select a result before closing.' };

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, title, motion_text_hash')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'voting')
    return { status: 'error', message: 'Voting is not open for this motion.' };

  // Find all active voting members (non-chair) who have NOT yet voted
  const { data: voters } = await admin
    .from('members')
    .select('id')
    .eq('is_active', true)
    .eq('role', 'member');

  const { data: existingVotes } = await admin
    .from('votes')
    .select('member_id')
    .eq('motion_id', motionId);

  const votedIds = new Set((existingVotes ?? []).map((v) => v.member_id));
  const nonVoters = (voters ?? []).filter((m) => !votedIds.has(m.id));

  // Auto-abstain for non-voters
  if (nonVoters.length > 0) {
    const now = new Date().toISOString();
    await admin.from('votes').insert(
      nonVoters.map((m) => ({
        motion_id: motionId,
        member_id: m.id,
        vote: 'abstain',
        motion_hash_at_vote: motion.motion_text_hash ?? '',
        cast_at: now,
      })),
    );
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from('motions')
    .update({
      status: `decided_${result}` as 'decided_passed' | 'decided_failed' | 'decided_deferred',
      result,
      decided_at: now,
    })
    .eq('id', motionId)
    .eq('status', 'voting');

  if (error) return { status: 'error', message: `Could not close voting: ${error.message}` };

  // Tally final votes (including auto-abstains just inserted)
  const { data: finalVotes } = await admin
    .from('votes')
    .select('vote')
    .eq('motion_id', motionId);

  const tally = { aye: 0, nay: 0, abstain: 0, defer: 0 };
  for (const v of finalVotes ?? []) {
    if (v.vote === 'aye') tally.aye++;
    else if (v.vote === 'nay') tally.nay++;
    else if (v.vote === 'abstain') tally.abstain++;
    else if (v.vote === 'defer') tally.defer++;
  }

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'voting_closed',
    event_data: {
      motion_number: motion.motion_number,
      result,
      auto_abstained: nonVoters.length,
      tally,
    },
    ...ctx,
  });

  // Notify all active members of the result
  const { data: allMembers } = await admin
    .from('members')
    .select('email')
    .eq('is_active', true);
  const emails = (allMembers ?? []).map((m) => m.email);
  void notifyVotingClosed(emails, motionId, motion.motion_number, motion.title, result, tally);

  // Generate and store the provisional PDF record
  void generateAndStorePdf(motionId).catch((err) =>
    console.error('[pdf] Generation failed after closeVoting:', err),
  );

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Comment ─────────────────────────────────────────────────────────────────

export async function postComment(
  motionId: string,
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const member = await requireMember();
  const body = (formData.get('body') as string | null)?.trim() ?? '';

  if (!body) return { status: 'error', message: 'Comment cannot be empty.' };
  if (body.length > 4000)
    return { status: 'error', message: 'Comment must be 4,000 characters or fewer.' };

  const admin = createAdminClient();
  const { error } = await admin.from('comments').insert({
    motion_id: motionId,
    member_id: member.id,
    body,
  });

  if (error) return { status: 'error', message: `Could not post comment: ${error.message}` };

  revalidatePath(`/motions/${motionId}`);
  return { status: 'success' };
}

// ─── Ratify ───────────────────────────────────────────────────────────────────

export async function ratifyMotion(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, title')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'decided_passed')
    return { status: 'error', message: 'Only a provisionally passed motion can be ratified.' };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('motions')
    .update({ status: 'ratified', ratified_by: member.id, ratified_at: now })
    .eq('id', motionId)
    .eq('status', 'decided_passed');

  if (error) return { status: 'error', message: `Could not ratify motion: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'ratified',
    event_data: { motion_number: motion.motion_number },
    ...ctx,
  });

  // Notify all active members of ratification
  const { data: allMembers } = await admin
    .from('members')
    .select('email')
    .eq('is_active', true);
  const emails = (allMembers ?? []).map((m) => m.email);
  void notifyMotionRatified(emails, motionId, motion.motion_number, motion.title, member.full_name);

  // Regenerate PDF with ratification block filled in
  void generateAndStorePdf(motionId).catch((err) =>
    console.error('[pdf] Generation failed after ratifyMotion:', err),
  );

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}

// ─── Send vote reminders ──────────────────────────────────────────────────────

export async function sendVoteReminders(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number, title')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (motion.status !== 'voting')
    return { status: 'error', message: 'Reminders can only be sent while voting is open.' };

  // Find active voting members who have NOT yet voted
  const { data: voters } = await admin
    .from('members')
    .select('id, email')
    .eq('is_active', true)
    .eq('role', 'member');

  const { data: existingVotes } = await admin
    .from('votes')
    .select('member_id')
    .eq('motion_id', motionId);

  const votedIds = new Set((existingVotes ?? []).map((v) => v.member_id));
  const nonVoters = (voters ?? []).filter((m) => !votedIds.has(m.id));

  if (nonVoters.length === 0)
    return { status: 'error', message: 'All members have already voted.' };

  const emailAddresses = nonVoters.map((m) => m.email);
  await notifyVoteReminder(emailAddresses, motionId, motion.motion_number, motion.title);

  revalidatePath(`/motions/${motionId}`);
  return { status: 'idle' }; // stay on page, no redirect
}

// ─── Archive ──────────────────────────────────────────────────────────────────

const ARCHIVABLE_STATUSES = [
  'decided_passed', 'decided_failed', 'decided_deferred',
  'ratified', 'withdrawn', 'died_no_motion', 'died_no_second',
];

export async function archiveMotion(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (!ARCHIVABLE_STATUSES.includes(motion.status))
    return { status: 'error', message: 'This motion cannot be archived in its current state.' };

  const { error } = await admin
    .from('motions')
    .update({ status: 'archived' })
    .eq('id', motionId);

  if (error) return { status: 'error', message: `Could not archive motion: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: 'archived',
    event_data: { motion_number: motion.motion_number, previous_status: motion.status },
    ...ctx,
  });

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect('/');
}

// ─── Delete (any status, chair only) ─────────────────────────────────────────

export async function deleteMotion(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, motion_number, status')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };

  // Remove all storage objects: motion attachments + PDF record
  const { data: attachments } = await admin
    .from('motion_attachments')
    .select('storage_path')
    .eq('motion_id', motionId);

  if (attachments && attachments.length > 0) {
    await admin.storage
      .from('motion-attachments')
      .remove(attachments.map((a) => a.storage_path));
  }

  await admin.storage.from('motion-pdfs').remove([`${motionId}.pdf`]);

  const { error } = await admin.from('motions').delete().eq('id', motionId);

  if (error) return { status: 'error', message: `Could not delete motion: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: null,
    member_id: member.id,
    event_type: 'deleted',
    event_data: { motion_id: motionId, motion_number: motion.motion_number, status_at_deletion: motion.status },
    ...ctx,
  });

  revalidatePath('/');
  redirect('/');
}

// ─── Mark as died ─────────────────────────────────────────────────────────────

export async function markDied(
  motionId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const member = await requireChair();
  const admin = createAdminClient();

  const { data: motion } = await admin
    .from('motions')
    .select('id, status, motion_number')
    .eq('id', motionId)
    .maybeSingle();

  if (!motion) return { status: 'error', message: 'Motion not found.' };
  if (!['open', 'moved'].includes(motion.status))
    return { status: 'error', message: 'Motion cannot be marked as died in its current state.' };

  const newStatus = motion.status === 'open' ? 'died_no_motion' : 'died_no_second';

  const { error } = await admin
    .from('motions')
    .update({ status: newStatus })
    .eq('id', motionId)
    .eq('status', motion.status);

  if (error) return { status: 'error', message: `Could not update motion: ${error.message}` };

  const ctx = await auditCtx();
  await admin.from('audit_log').insert({
    motion_id: motionId,
    member_id: member.id,
    event_type: newStatus,
    event_data: { motion_number: motion.motion_number },
    ...ctx,
  });

  revalidatePath(`/motions/${motionId}`);
  revalidatePath('/');
  redirect(`/motions/${motionId}`);
}
