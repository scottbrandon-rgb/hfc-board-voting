/**
 * GET /files/records/:motionId — the official PDF record of a decided motion.
 * Chair and secretary only, as before.
 */
import { notFound } from 'next/navigation';
import { requireChairOrSecretary } from '@/lib/dal';
import { queryOne } from '@/lib/db';
import { PDF_STATUSES } from '@/lib/generate-pdf';
import { getFile } from '@/lib/storage';
import { fileResponse } from '@/lib/serve-file';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireChairOrSecretary();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const motion = await queryOne<{ motion_number: string; status: string }>(
    'select motion_number, status from public.motions where id = $1',
    [id],
  );
  if (!motion || !PDF_STATUSES.includes(motion.status)) notFound();

  const file = await getFile('motion-pdfs', `${id}.pdf`);
  if (!file) notFound();
  return fileResponse(file.data, 'application/pdf', `${motion.motion_number}.pdf`, 'attachment');
}
