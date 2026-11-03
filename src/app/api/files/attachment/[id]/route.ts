/**
 * GET /api/files/attachment/<attachment id>
 *
 * Opens a motion's document for a signed-in board member who may see that
 * motion (drafts: only the chair, the secretary and the draft's author).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentMember } from '@/lib/dal';
import { one } from '@/lib/db';
import { openFile } from '@/lib/files';
import { canSeeMotion, isUuid } from '@/lib/queries';
import { contentDisposition } from '@/lib/format-filename';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(new URL('/login', request.url));

  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });

  const row = await one<{
    storage_path: string;
    file_name: string;
    content_type: string;
    status: string;
    created_by: string;
  }>(
    `select a.storage_path, a.file_name, a.content_type, m.status, m.created_by
       from public.motion_attachments a
       join public.motions m on m.id = a.motion_id
      where a.id = $1`,
    [id],
  );
  if (!row || !canSeeMotion(row, member)) return new NextResponse('Not found', { status: 404 });

  const file = await openFile('motion-attachments', row.storage_path);
  if (!file) return new NextResponse('This document is missing.', { status: 404 });

  return new NextResponse(file.body, {
    headers: {
      'Content-Type': row.content_type || file.contentType || 'application/octet-stream',
      'Content-Disposition': contentDisposition('inline', row.file_name),
      'Cache-Control': 'private, no-store',
    },
  });
}
