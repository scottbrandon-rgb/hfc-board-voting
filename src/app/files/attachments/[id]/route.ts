/**
 * GET /files/attachments/:id — a motion document, for signed-in members who
 * can see the motion (drafts: chair, secretary and the author only).
 */
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/dal';
import { queryOne } from '@/lib/db';
import { canSeeMotion } from '@/lib/queries';
import { getFile } from '@/lib/storage';
import { fileResponse } from '@/lib/serve-file';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const att = await queryOne<{
    motion_id: string;
    storage_path: string;
    file_name: string;
    content_type: string;
  }>(
    'select motion_id, storage_path, file_name, content_type from public.motion_attachments where id = $1',
    [id],
  );
  if (!att || !(await canSeeMotion(att.motion_id, member))) notFound();

  const file = await getFile('motion-attachments', att.storage_path);
  if (!file) {
    console.error('[files] document missing from storage:', att.storage_path);
    notFound();
  }
  return fileResponse(file.data, att.content_type, att.file_name, 'inline');
}
