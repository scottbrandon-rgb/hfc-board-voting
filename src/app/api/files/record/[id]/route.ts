/**
 * GET /api/files/record/<motion id>
 *
 * Downloads a motion's official PDF record. Chair and secretary only, as
 * before: they sign and file the record.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentMember } from '@/lib/dal';
import { one } from '@/lib/db';
import { openFile } from '@/lib/files';
import { pdfKey } from '@/lib/generate-pdf';
import { isUuid } from '@/lib/queries';
import { contentDisposition } from '@/lib/format-filename';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(new URL('/login', request.url));
  if (member.role !== 'chair' && member.role !== 'secretary')
    return new NextResponse('Not found', { status: 404 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const motion = await one<{ motion_number: string }>(
    'select motion_number from public.motions where id = $1',
    [id],
  );
  if (!motion) return new NextResponse('Not found', { status: 404 });

  const file = await openFile('motion-pdfs', pdfKey(id));
  if (!file) return new NextResponse('The record has not been made yet.', { status: 404 });

  return new NextResponse(file.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition('attachment', `${motion.motion_number}.pdf`),
      'Cache-Control': 'private, no-store',
    },
  });
}
