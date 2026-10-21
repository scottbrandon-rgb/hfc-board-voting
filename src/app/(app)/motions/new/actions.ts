'use server';

import { revalidatePath } from 'next/cache';
import { requireChair, friendlyError } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextMotionNumber, sha256Hex } from '@/lib/motions';
import {
  DEFAULT_VOTING_PERIOD,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES as MAX_FILE_BYTES,
  VOTING_PERIOD_CHOICES,
} from '@/lib/rules';

const BUCKET = 'motion-attachments';
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
]);

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export interface MotionDraftInput {
  motionId?: string;
  title: string;
  description: string;
  background: string;
  votingPeriodDays: number;
}

function safeFileName(name: string): string {
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\-() ]/g, '_')
    .slice(0, 120);
}

async function loadDraft(motionId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('motions')
    .select('id, status')
    .eq('id', motionId)
    .maybeSingle();
  return data;
}

/** Creates a draft, or updates one. Text can change only while it is a draft. */
export async function saveMotion(input: MotionDraftInput): Promise<Result<{ motionId: string }>> {
  const chair = await requireChair();

  const title = input.title.trim();
  const description = input.description.trim();
  const background = input.background.trim();
  const days = (VOTING_PERIOD_CHOICES as readonly number[]).includes(input.votingPeriodDays)
    ? input.votingPeriodDays
    : DEFAULT_VOTING_PERIOD;

  if (!title) return { ok: false, message: 'Add a title.' };
  if (title.length > 200) return { ok: false, message: 'Keep the title under 200 characters.' };
  if (!description) return { ok: false, message: 'Add the motion text.' };
  if (description.length > 10000) return { ok: false, message: 'The motion text is too long.' };
  if (background.length > 10000) return { ok: false, message: 'The background is too long.' };

  const admin = createAdminClient();

  if (input.motionId) {
    const draft = await loadDraft(input.motionId);
    if (!draft) return { ok: false, message: 'Motion not found.' };
    if (draft.status !== 'draft') return { ok: false, message: 'Only drafts can be edited.' };
    const { error } = await admin
      .from('motions')
      .update({ title, description, background: background || null, voting_period_days: days })
      .eq('id', input.motionId);
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath(`/motions/${input.motionId}`);
    return { ok: true, motionId: input.motionId };
  }

  // The motion number is unique; retry once if two drafts race for it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const motionNumber = await nextMotionNumber(admin);
    const { data, error } = await admin
      .from('motions')
      .insert({
        motion_number: motionNumber,
        title,
        description,
        background: background || null,
        voting_period_days: days,
        status: 'draft',
        rules: 'unanimous_v1',
        created_by: chair.id,
      })
      .select('id')
      .single();
    if (!error && data) {
      await admin.from('audit_log').insert({
        motion_id: data.id,
        member_id: chair.id,
        event_type: 'created',
        event_data: { motion_number: motionNumber },
      });
      revalidatePath('/');
      return { ok: true, motionId: data.id };
    }
    if (error?.code !== '23505') return { ok: false, message: friendlyError(error) };
  }
  return { ok: false, message: 'Could not number the motion. Please try again.' };
}

/** A one-time upload link so the browser sends the file straight to storage. */
export async function prepareUpload(
  motionId: string,
  file: { name: string; size: number; type: string },
): Promise<Result<{ path: string; token: string }>> {
  await requireChair();
  const draft = await loadDraft(motionId);
  if (!draft) return { ok: false, message: 'Motion not found.' };
  if (draft.status !== 'draft')
    return { ok: false, message: 'Documents can only be added to a draft.' };
  if (file.size > MAX_FILE_BYTES)
    return { ok: false, message: `"${file.name}" is over the 25 MB limit.` };
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      message: `"${file.name}" isn't a supported type. Use PDF, Word, Excel or a photo.`,
    };
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from('motion_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('motion_id', motionId);
  if ((count ?? 0) >= MAX_ATTACHMENTS) {
    return { ok: false, message: `A motion can have up to ${MAX_ATTACHMENTS} documents.` };
  }

  const path = `motions/${motionId}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: friendlyError(error) };
  return { ok: true, path: data.path, token: data.token };
}

/** Records an uploaded document, fingerprinting it from storage. */
export async function registerAttachment(
  motionId: string,
  upload: { path: string; name: string },
): Promise<Result<{ attachmentId: string; size: number }>> {
  const chair = await requireChair();
  if (!upload.path.startsWith(`motions/${motionId}/`))
    return { ok: false, message: 'Invalid upload.' };
  const draft = await loadDraft(motionId);
  if (!draft || draft.status !== 'draft')
    return { ok: false, message: 'Documents can only be added to a draft.' };

  const admin = createAdminClient();
  const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(upload.path);
  if (dlError || !blob)
    return { ok: false, message: `"${upload.name}" did not finish uploading. Try again.` };
  if (blob.size > MAX_FILE_BYTES) {
    await admin.storage.from(BUCKET).remove([upload.path]);
    return { ok: false, message: `"${upload.name}" is over the 25 MB limit.` };
  }

  const { data: row, error } = await admin
    .from('motion_attachments')
    .insert({
      motion_id: motionId,
      storage_path: upload.path,
      file_name: upload.name.slice(0, 200),
      file_size: blob.size,
      content_type: blob.type || 'application/octet-stream',
      file_hash: await sha256Hex(await blob.arrayBuffer()),
      uploaded_by: chair.id,
    })
    .select('id')
    .single();
  if (error || !row) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/motions/${motionId}`);
  return { ok: true, attachmentId: row.id, size: blob.size };
}

export async function removeAttachment(attachmentId: string): Promise<Result> {
  await requireChair();
  const admin = createAdminClient();
  const { data: att } = await admin
    .from('motion_attachments')
    .select('id, motion_id, storage_path')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!att) return { ok: false, message: 'Document not found.' };
  const draft = await loadDraft(att.motion_id);
  if (!draft || draft.status !== 'draft') {
    return { ok: false, message: 'Documents can only be removed from a draft.' };
  }
  const { error } = await admin.from('motion_attachments').delete().eq('id', attachmentId);
  if (error) return { ok: false, message: friendlyError(error) };
  await admin.storage.from(BUCKET).remove([att.storage_path]);
  revalidatePath(`/motions/${att.motion_id}`);
  return { ok: true };
}
