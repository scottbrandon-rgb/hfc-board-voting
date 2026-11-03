'use server';

import { revalidatePath } from 'next/cache';
import { requireChair, friendlyError } from '@/lib/dal';
import { one, query, safely } from '@/lib/db';
import { deleteFile, putFile, readFileBytes } from '@/lib/files';
import { nextMotionNumber, sha256Hex } from '@/lib/motions';
import { ALLOWED_UPLOAD_TYPES, chunkCount, chunkKey, isUploadPathFor } from '@/lib/uploads';
import {
  DEFAULT_VOTING_PERIOD,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES as MAX_FILE_BYTES,
  MAX_ATTACHMENT_MB,
  VOTING_PERIOD_CHOICES,
} from '@/lib/rules';

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
  if (!/^[0-9a-f-]{36}$/i.test(motionId)) return null;
  return one<{ id: string; status: string }>(
    'select id, status from public.motions where id = $1',
    [motionId],
  );
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
    const { error } = await safely(() =>
      query(
        `update public.motions
            set title = $2, description = $3, background = $4, voting_period_days = $5
          where id = $1`,
        [input.motionId, title, description, background || null, days],
      ),
    );
    if (error) return { ok: false, message: friendlyError(error) };
    revalidatePath(`/motions/${input.motionId}`);
    return { ok: true, motionId: input.motionId };
  }

  // The motion number is unique; retry once if two drafts race for it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const motionNumber = await nextMotionNumber();
    const { data, error } = await safely(() =>
      one<{ id: string }>(
        `insert into public.motions
           (motion_number, title, description, background, voting_period_days, status, rules, created_by)
         values ($1, $2, $3, $4, $5, 'draft', 'unanimous_v1', $6)
         returning id`,
        [motionNumber, title, description, background || null, days, chair.id],
      ),
    );
    if (!error && data) {
      await query(
        `insert into public.audit_log (motion_id, member_id, event_type, event_data)
         values ($1, $2, 'created', $3)`,
        [data.id, chair.id, { motion_number: motionNumber }],
      );
      revalidatePath('/');
      return { ok: true, motionId: data.id };
    }
    if (error?.code !== '23505') return { ok: false, message: friendlyError(error) };
  }
  return { ok: false, message: 'Could not number the motion. Please try again.' };
}

/**
 * Starts a document upload. The browser then sends the file in pieces to
 * /api/uploads (see src/app/api/uploads/route.ts) and calls
 * registerAttachment once every piece has arrived.
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
    return { ok: false, message: `"${file.name}" is over the ${MAX_ATTACHMENT_MB} MB limit.` };
  if (file.size <= 0) return { ok: false, message: `"${file.name}" is empty.` };
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return {
      ok: false,
      message: `"${file.name}" isn't a supported type. Use PDF, Word, Excel or a photo.`,
    };
  }

  const counted = await one<{ n: number }>(
    'select count(*) as n from public.motion_attachments where motion_id = $1',
    [motionId],
  );
  if ((counted?.n ?? 0) >= MAX_ATTACHMENTS) {
    return { ok: false, message: `A motion can have up to ${MAX_ATTACHMENTS} documents.` };
  }

  const path = `motions/${motionId}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(file.name)}`;
  return { ok: true, path, parts: chunkCount(file.size) };
}

/** Joins the uploaded pieces, fingerprints the document and records it. */
export async function registerAttachment(
  motionId: string,
  upload: { path: string; name: string; type: string; parts: number },
): Promise<Result<{ attachmentId: string; size: number }>> {
  const chair = await requireChair();
  if (!isUploadPathFor(motionId, upload.path)) return { ok: false, message: 'Invalid upload.' };
  if (!ALLOWED_UPLOAD_TYPES.has(upload.type)) return { ok: false, message: 'Invalid upload.' };
  const parts = Math.trunc(upload.parts);
  if (!(parts >= 1 && parts <= chunkCount(MAX_FILE_BYTES)))
    return { ok: false, message: 'Invalid upload.' };
  const draft = await loadDraft(motionId);
  if (!draft || draft.status !== 'draft')
    return { ok: false, message: 'Documents can only be added to a draft.' };

  const pieces: Uint8Array[] = [];
  let size = 0;
  for (let i = 0; i < parts; i++) {
    const piece = await readFileBytes('motion-attachments', chunkKey(upload.path, i));
    if (!piece)
      return { ok: false, message: `"${upload.name}" did not finish uploading. Try again.` };
    pieces.push(piece);
    size += piece.byteLength;
  }
  const removePieces = async () => {
    for (let i = 0; i < parts; i++) {
      await deleteFile('motion-attachments', chunkKey(upload.path, i)).catch(() => {});
    }
  };
  if (size > MAX_FILE_BYTES) {
    await removePieces();
    return { ok: false, message: `"${upload.name}" is over the ${MAX_ATTACHMENT_MB} MB limit.` };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) {
    bytes.set(piece, offset);
    offset += piece.byteLength;
  }
  await putFile('motion-attachments', upload.path, bytes, upload.type);
  await removePieces();

  const fileHash = await sha256Hex(bytes);
  const { data: row, error } = await safely(() =>
    one<{ id: string }>(
      `insert into public.motion_attachments
         (motion_id, storage_path, file_name, file_size, content_type, file_hash, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [motionId, upload.path, upload.name.slice(0, 200), size, upload.type, fileHash, chair.id],
    ),
  );
  if (error || !row) return { ok: false, message: friendlyError(error) };
  revalidatePath(`/motions/${motionId}`);
  return { ok: true, attachmentId: row.id, size };
}

export async function removeAttachment(attachmentId: string): Promise<Result> {
  await requireChair();
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return { ok: false, message: 'Document not found.' };
  const att = await one<{ id: string; motion_id: string; storage_path: string }>(
    'select id, motion_id, storage_path from public.motion_attachments where id = $1',
    [attachmentId],
  );
  if (!att) return { ok: false, message: 'Document not found.' };
  const draft = await loadDraft(att.motion_id);
  if (!draft || draft.status !== 'draft') {
    return { ok: false, message: 'Documents can only be removed from a draft.' };
  }
  const { error } = await safely(() =>
    query('delete from public.motion_attachments where id = $1', [attachmentId]),
  );
  if (error) return { ok: false, message: friendlyError(error) };
  await deleteFile('motion-attachments', att.storage_path).catch((err) =>
    console.error('[files] could not delete', att.storage_path, err),
  );
  revalidatePath(`/motions/${att.motion_id}`);
  return { ok: true };
}
