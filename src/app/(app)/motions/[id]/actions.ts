'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireMember } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionState = { status: 'idle' } | { status: 'error'; message: string };
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
