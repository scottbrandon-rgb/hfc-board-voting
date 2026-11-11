'use server';

import { revalidatePath } from 'next/cache';
import { requireChair, friendlyError } from '@/lib/dal';
import { attempt, audit, query, queryOne } from '@/lib/db';
import { nextMotionNumber, sha256Hex } from '@/lib/motions';
import { ALLOWED_MIME, loadDraft } from '@/lib/attachments';
import { joinParts, putFile, removeFiles, removeParts } from '@/lib/storage';
import {
  DEFAULT_VOTING_PERIOD,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES as MAX_FILE_BYTES,
  MAX_ATTACHMENT_LABEL,
  UPLOAD_CHUNK_BYTES,
  VOTING_PERIOD_CHOICES,
} from '@/lib/rules';

const BUCKET = 'motion-attachments';

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

  if (input.motionId) {
    const draft = await loadDraft(input.motionId);
    if (!draft) return { ok: false, message: 'Motion not found.' };
    if (draft.status !== 'draft') return { ok: false, message: 'Only drafts can be edited.' };
    const { error } = await attempt(() =>
      query(
        `update public.motions set title = $2, description = $3, background = $4, voting_period_days = $5
          where id = $1`,
        [input.motionId, title, description, background || null, days],
      ),
    );
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath(`/motions/${input.motionId}`);
    return { ok: true, motionId: input.motionId };
  }

  // The motion number is unique; retry once if two drafts race for it.
  for (let attempt_ = 0; attempt_ < 2; attempt_++) {
    const motionNumber = await nextMotionNumber();
    const { data, error } = await attempt(() =>
      queryOne<{ id: string }>(
        `insert into public.motions
           (motion_number, title, description, background, voting_period_days, status, rules, created_by)
         values ($1, $2, $3, $4, $5, 'draft', 'unanimous_v1', $6)
         returning id`,
        [motionNumber, title, description, background || null, days, chair.id],
      ),
    );
    if (!error && data) {
      await audit({
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

/**
 * Checks a document before upload and picks where it will be stored. The
 * browser then sends it in pieces to /api/attachments/upload.
 */
export async function prepareUpload(
  motionId: string,
  file: { name: string; size: number; type: string },
): Promise<Result<{ path: string; parts: number }>> {
  await requireChair();
  const draft = await loadDraft(motionId);
  if (!draft) return { ok: false, message: 'Motion not found.' };
  if (draft.status !== 'draft')
    return { ok: false, message: 'Documents can only be added to a draft.' };
  if (file.size > MAX_FILE_BYTES)
    return { ok: false, message: `"${file.name}" is over the ${MAX_ATTACHMENT_LABEL} limit.` };
  if (file.size === 0) return { ok: false, message: `"${file.name}" is empty.` };
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      message: `"${file.name}" isn't a supported type. Use PDF, Word, Excel or a photo.`,
    };
  }

  const row = await queryOne<{ n: number }>(
    'select count(*)::int as n from public.motion_attachments where motion_id = $1',
    [motionId],
  );
  if ((row?.n ?? 0) >= MAX_ATTACHMENTS) {
    return { ok: false, message: `A motion can have up to ${MAX_ATTACHMENTS} documents.` };
  }

  const path = `motions/${motionId}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
  return { ok: true, path, parts: Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES)) };
}

/** Joins the uploaded pieces, fingerprints the document and records it. */
export async function registerAttachment(
  motionId: string,
  upload: { path: string; name: string; type: string; parts: number },
): Promise<Result<{ attachmentId: string; size: number }>> {
  const chair = await requireChair();
  if (!upload.path.startsWith(`motions/${motionId}/`) || upload.path.includes('..'))
    return { ok: false, message: 'Invalid upload.' };
  const maxParts = Math.ceil(MAX_FILE_BYTES / UPLOAD_CHUNK_BYTES);
  if (!Number.isInteger(upload.parts) || upload.parts < 1 || upload.parts > maxParts)
    return { ok: false, message: 'Invalid upload.' };
  const draft = await loadDraft(motionId);
  if (!draft || draft.status !== 'draft')
    return { ok: false, message: 'Documents can only be added to a draft.' };

  const joined = await joinParts(BUCKET, upload.path, upload.parts, MAX_FILE_BYTES);
  if ('error' in joined) {
    await removeParts(BUCKET, upload.path, upload.parts);
    return {
      ok: false,
      message:
        joined.error === 'too_big'
          ? `"${upload.name}" is over the ${MAX_ATTACHMENT_LABEL} limit.`
          : `"${upload.name}" did not finish uploading. Try again.`,
    };
  }

  const contentType = ALLOWED_MIME.has(upload.type) ? upload.type : 'application/octet-stream';
  await putFile(BUCKET, upload.path, joined.data, contentType);
  await removeParts(BUCKET, upload.path, upload.parts);

  const fileHash = await sha256Hex(joined.data);
  const { data: row, error } = await attempt(() =>
    queryOne<{ id: string }>(
      `insert into public.motion_attachments
         (motion_id, storage_path, file_name, file_size, content_type, file_hash, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        motionId,
        upload.path,
        upload.name.slice(0, 200),
        joined.data.byteLength,
        contentType,
        fileHash,
        chair.id,
      ],
    ),
  );
  if (error || !row) {
    await removeFiles(BUCKET, [upload.path]);
    return { ok: false, message: friendlyError(error) };
  }
  revalidatePath(`/motions/${motionId}`);
  return { ok: true, attachmentId: row.id, size: joined.data.byteLength };
}

export async function removeAttachment(attachmentId: string): Promise<Result> {
  await requireChair();
  const att = await queryOne<{ id: string; motion_id: string; storage_path: string }>(
    'select id, motion_id, storage_path from public.motion_attachments where id = $1',
    [attachmentId],
  );
  if (!att) return { ok: false, message: 'Document not found.' };
  const draft = await loadDraft(att.motion_id);
  if (!draft || draft.status !== 'draft') {
    return { ok: false, message: 'Documents can only be removed from a draft.' };
  }
  const { error } = await attempt(() =>
    query('delete from public.motion_attachments where id = $1', [attachmentId]),
  );
  if (error) return { ok: false, message: friendlyError(error) };
  await removeFiles(BUCKET, [att.storage_path]);
  revalidatePath(`/motions/${att.motion_id}`);
  return { ok: true };
}
