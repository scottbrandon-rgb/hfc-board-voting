import 'server-only';
import { queryOne } from '@/lib/db';

/** Document types the board accepts (the file picker offers the same list). */
export const ALLOWED_MIME = new Set([
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

export async function loadDraft(motionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(motionId)) return null;
  return queryOne<{ id: string; status: string }>(
    'select id, status from public.motions where id = $1',
    [motionId],
  );
}
