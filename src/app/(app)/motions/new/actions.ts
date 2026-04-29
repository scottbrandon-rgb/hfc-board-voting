'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireChair } from '@/lib/dal';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextMotionNumber, sha256Hex } from '@/lib/motions';
import { notifyMotionPublished } from '@/lib/email';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_ATTACHMENTS = 4;
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

export type CreateMotionState = { status: 'idle' } | { status: 'error'; message: string };

function safeFileName(name: string): string {
  // Storage paths can't have slashes/backslashes; trim and replace exotic chars
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[^\w.\-() ]/g, '_')
    .slice(0, 200);
}

export async function createMotion(
  _prev: CreateMotionState,
  formData: FormData,
): Promise<CreateMotionState> {
  const chair = await requireChair();

  const title = (formData.get('title') as string | null)?.trim() ?? '';
  const description = (formData.get('description') as string | null)?.trim() ?? '';
  const publish = formData.get('publish') === 'true';
  const files = formData
    .getAll('attachments')
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!title) return { status: 'error', message: 'Title is required.' };
  if (title.length > 200)
    return { status: 'error', message: 'Title must be 200 characters or fewer.' };
  if (!description) return { status: 'error', message: 'Description is required.' };
  if (files.length > MAX_ATTACHMENTS)
    return { status: 'error', message: `Maximum ${MAX_ATTACHMENTS} attachments per motion.` };

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return { status: 'error', message: `"${file.name}" exceeds the 25 MB limit.` };
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return {
        status: 'error',
        message: `"${file.name}" has an unsupported type (${file.type || 'unknown'}). PDFs, Office docs, and images only.`,
      };
    }
  }

  const admin = createAdminClient();
  const headerList = await headers();
  const ipAddress = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const userAgent = headerList.get('user-agent') || null;

  // 1. Reserve motion number and insert the motion row
  const motionNumber = await nextMotionNumber(admin);
  const status = publish ? 'open' : 'draft';
  const publishedAt = publish ? new Date().toISOString() : null;

  const { data: motion, error: insertError } = await admin
    .from('motions')
    .insert({
      motion_number: motionNumber,
      title,
      description,
      status,
      created_by: chair.id,
      published_at: publishedAt,
    })
    .select('id, motion_number, title')
    .single();

  if (insertError || !motion) {
    return {
      status: 'error',
      message: `Could not create motion: ${insertError?.message ?? 'unknown error'}`,
    };
  }

  // 2. Upload attachments
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const fileHash = await sha256Hex(buffer);
    const safeName = safeFileName(file.name);
    const storagePath = `motions/${motion.id}/${fileHash.slice(0, 12)}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from('motion-attachments')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        status: 'error',
        message: `Uploaded the motion but failed on "${file.name}": ${uploadError.message}. Edit the draft to retry.`,
      };
    }

    const { error: attachError } = await admin.from('motion_attachments').insert({
      motion_id: motion.id,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      content_type: file.type,
      file_hash: fileHash,
      uploaded_by: chair.id,
    });

    if (attachError) {
      return {
        status: 'error',
        message: `Attachment metadata save failed for "${file.name}": ${attachError.message}.`,
      };
    }
  }

  // 3. Audit log
  await admin.from('audit_log').insert([
    {
      motion_id: motion.id,
      member_id: chair.id,
      event_type: 'created',
      event_data: { motion_number: motion.motion_number, attachment_count: files.length },
      ip_address: ipAddress,
      user_agent: userAgent,
    },
    ...(publish
      ? [
          {
            motion_id: motion.id,
            member_id: chair.id,
            event_type: 'published',
            event_data: { motion_number: motion.motion_number },
            ip_address: ipAddress,
            user_agent: userAgent,
          },
        ]
      : []),
  ]);

  // If published immediately, notify all active members
  if (publish) {
    const { data: allMembers } = await admin
      .from('members')
      .select('email')
      .eq('is_active', true);
    const emails = (allMembers ?? []).map((m) => m.email);
    void notifyMotionPublished(emails, motion.id, motion.motion_number, motion.title);
  }

  revalidatePath('/');
  redirect(`/motions/${motion.id}`);
}
